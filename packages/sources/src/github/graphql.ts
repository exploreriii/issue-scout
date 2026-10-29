import { RawIssueSchema, type OrgConfig, type RawIssue } from "@issue-scout/core";
import { GithubApiError, GithubRateLimitError, type IssueSource, type RateLimitInfo } from "../types.js";

export const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
export const USER_AGENT = "issue-scout";
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_PAGES = 3;
export const MAX_BODY_CHARS = 2000;

/**
 * Same field selection as scripts/record-fixtures.sh, plus the last comment
 * (ARCHITECTURE s5 claim rule) and the repo's most recent merged PR (FR-3).
 */
export const ISSUES_QUERY = `query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        id number title body url createdAt updatedAt
        assignees { totalCount }
        comments(last: 1) { totalCount nodes { body } }
        labels(first: 20) { nodes { name } }
        repository {
          name
          primaryLanguage { name }
          repositoryTopics(first: 10) { nodes { topic { name } } }
          pullRequests(states: MERGED, first: 1, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { mergedAt } }
        }
      }
    }
  }
}`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GithubClientOptions {
  /** Read-only public-scope token (Worker secret). Optional. */
  token?: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export function githubHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function parseRateLimit(headers: Headers, previous: RateLimitInfo): RateLimitInfo {
  const num = (name: string): number | null => {
    const v = headers.get(name);
    if (v === null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    limit: num("x-ratelimit-limit") ?? previous.limit,
    remaining: num("x-ratelimit-remaining") ?? previous.remaining,
    resetAt: num("x-ratelimit-reset") ?? previous.resetAt,
  };
}

/** Shared by the GraphQL and REST clients: token, UA, timeout, rate-limit tracking. */
export class GithubHttp {
  rateLimit: RateLimitInfo = { limit: null, remaining: null, resetAt: null };
  private readonly token: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: GithubClientOptions = {}) {
    this.token = opts.token || undefined;
    // Late-bound so a stubbed global fetch is honoured.
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: { ...githubHeaders(this.token), ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new GithubApiError(`GitHub request timed out after ${this.timeoutMs} ms`);
      }
      throw new GithubApiError(`GitHub request failed: ${(e as Error).message}`);
    }
    this.rateLimit = parseRateLimit(res.headers, this.rateLimit);
    if ((res.status === 403 || res.status === 429) && this.rateLimit.remaining === 0) {
      throw new GithubRateLimitError(this.rateLimit.resetAt);
    }
    return res;
  }
}

interface SearchPage {
  data?: {
    search: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: (IssueNode | null)[];
    };
  };
  errors?: { message: string }[];
}

interface IssueNode {
  id?: string;
  number?: number;
  title?: string;
  body?: string | null;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  assignees?: { totalCount: number };
  comments?: { totalCount: number; nodes?: ({ body?: string | null } | null)[] };
  labels?: { nodes?: ({ name: string } | null)[] };
  repository?: {
    name: string;
    primaryLanguage?: { name: string } | null;
    repositoryTopics?: { nodes?: ({ topic: { name: string } } | null)[] };
    pullRequests?: { nodes?: ({ mergedAt?: string | null } | null)[] };
  };
}

/** Map one search node to RawIssue exactly as record-fixtures.sh does. Null for non-issue nodes. */
export function mapIssueNode(node: IssueNode | null | undefined, org: string): RawIssue | null {
  if (!node || !node.id || !node.repository) return null;
  const issue: Record<string, unknown> = {
    id: node.id,
    org,
    repo: node.repository.name,
    number: node.number,
    title: node.title,
    body: [...(node.body ?? "")].slice(0, MAX_BODY_CHARS).join(""),
    url: node.url,
    labels: (node.labels?.nodes ?? []).flatMap((l) => (l ? [l.name] : [])),
    assignees: node.assignees?.totalCount ?? 0,
    comments: node.comments?.totalCount ?? 0,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    repoTopics: (node.repository.repositoryTopics?.nodes ?? []).flatMap((t) => (t ? [t.topic.name] : [])),
  };
  const lang = node.repository.primaryLanguage?.name;
  if (lang) issue.repoLanguage = lang;
  const merged = node.repository.pullRequests?.nodes?.[0]?.mergedAt;
  if (merged) issue.repoLastMergedPrAt = merged;
  const last = node.comments?.nodes?.[0]?.body;
  if (last) issue.lastComment = last;
  const parsed = RawIssueSchema.safeParse(issue);
  return parsed.success ? parsed.data : null;
}

/** `org:X is:issue is:open label:"a","b"` (comma = OR over the alias set). */
export function buildSearchQuery(org: string, labels: string[]): string {
  const quoted = labels.map((l) => `"${l.replace(/"/g, "")}"`).join(",");
  return `org:${org} is:issue is:open label:${quoted}`;
}

export class GithubGraphQL {
  readonly http: GithubHttp;
  constructor(opts: GithubClientOptions = {}) {
    this.http = new GithubHttp(opts);
  }

  get rateLimit(): RateLimitInfo {
    return this.http.rateLimit;
  }

  async searchPage(q: string, cursor: string | null): Promise<NonNullable<SearchPage["data"]>["search"]> {
    const res = await this.http.request(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ISSUES_QUERY, variables: { q, cursor } }),
    });
    if (!res.ok) throw new GithubApiError(`GitHub GraphQL returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as SearchPage;
    if (!json.data) {
      throw new GithubApiError(`GitHub GraphQL error: ${json.errors?.[0]?.message ?? "no data"}`);
    }
    return json.data.search;
  }
}

export interface GithubIssueSourceOptions extends GithubClientOptions {
  maxPages?: number;
}

/** IssueSource backed by GitHub search. Read-only: only POSTs the fixed query above. */
export class GithubIssueSource implements IssueSource {
  readonly client: GithubGraphQL;
  private readonly maxPages: number;

  constructor(opts: GithubIssueSourceOptions = {}) {
    this.client = new GithubGraphQL(opts);
    this.maxPages = opts.maxPages ?? MAX_PAGES;
  }

  get rateLimit(): RateLimitInfo {
    return this.client.rateLimit;
  }

  /** One search, at most `maxPages` pages of 100. */
  async searchAll(org: string, q: string): Promise<RawIssue[]> {
    const out: RawIssue[] = [];
    let cursor: string | null = null;
    for (let page = 1; page <= this.maxPages; page++) {
      const result = await this.client.searchPage(q, cursor);
      for (const node of result.nodes) {
        const issue = mapIssueNode(node, org);
        if (issue) out.push(issue);
      }
      if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
      cursor = result.pageInfo.endCursor;
    }
    return out;
  }

  async fetchOpenIssues(org: OrgConfig): Promise<RawIssue[]> {
    const byId = new Map<string, RawIssue>();
    for (const labels of [org.labels.firstIssue, org.labels.helpWanted]) {
      if (labels.length === 0) continue;
      for (const issue of await this.searchAll(org.login, buildSearchQuery(org.login, labels))) {
        if (!byId.has(issue.id)) byId.set(issue.id, issue);
      }
    }
    return [...byId.values()];
  }
}
