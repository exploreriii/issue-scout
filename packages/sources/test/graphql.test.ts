import { describe, expect, it } from "vitest";
import { GithubGraphQL, GithubIssueSource, GithubRateLimitError, GithubApiError, buildSearchQuery } from "../src/index.js";
import type { OrgConfig } from "@issue-scout/core";
import page1 from "./recorded/graphql-page1.json";
import page2 from "./recorded/graphql-page2.json";
import { jsonResponse, mockFetch } from "./helpers.js";

const org: OrgConfig = {
  login: "hiero-ledger",
  displayName: "Hiero",
  enabled: true,
  labels: { firstIssue: ["good first issue", "skill: good first issue"], helpWanted: ["help wanted"], claimed: [], exclude: [] },
  defaultLanguages: [],
};

describe("GraphQL mapping to RawIssue", () => {
  it("maps recorded nodes the way record-fixtures.sh does, plus lastComment and merged PR", async () => {
    const { fetch } = mockFetch(() => ({ data: { search: { ...page1.data.search, pageInfo: { hasNextPage: false, endCursor: null } } } }));
    const src = new GithubIssueSource({ fetch });
    const issues = await src.searchAll("hiero-ledger", "q");
    expect(issues).toHaveLength(2); // the empty {} node is skipped
    expect(issues[0]).toEqual({
      id: "I_kwDOC8OKfc7yYL_c",
      org: "hiero-ledger",
      repo: "hiero-mirror-node",
      number: 13130,
      title: "HIP-1056 Set block number in transformed TransactionReceipt",
      body: "### Problem\n\nCN will add `block_number` to `transaction_receipt`.\n\n### Solution\n\nSet block number.",
      url: "https://github.com/hiero-ledger/hiero-mirror-node/issues/13130",
      labels: ["enhancement", "Good First Issue", "importer"],
      assignees: 0,
      comments: 3,
      createdAt: "2026-03-12T18:19:27Z",
      updatedAt: "2026-10-19T22:44:40Z",
      repoLanguage: "Java",
      repoTopics: ["hedera", "mirror-node"],
      repoLastMergedPrAt: "2026-10-27T10:00:00Z",
      lastComment: "I'd like to take this one",
    });
    // null body -> "", null language omitted, no merged PR omitted, empty comments -> no lastComment
    expect(issues[1]).toEqual({
      id: "I_kwDORZporc8AAAABZmc9rA",
      org: "hiero-ledger",
      repo: "analytics",
      number: 601,
      title: "Activate DRY-RUN mode for automations",
      body: "",
      url: "https://github.com/hiero-ledger/analytics/issues/601",
      labels: ["good first issue"],
      assignees: 1,
      comments: 0,
      createdAt: "2026-10-24T12:38:51Z",
      updatedAt: "2026-10-24T12:43:27Z",
      repoTopics: [],
    });
  });

  it("truncates bodies to 2000 characters", async () => {
    const node = structuredClone(page2.data.search.nodes[0]!);
    node.body = "é".repeat(2500);
    const { fetch } = mockFetch(() => ({ data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] } } }));
    const [issue] = await new GithubIssueSource({ fetch }).searchAll("hiero-ledger", "q");
    expect([...issue!.body]).toHaveLength(2000);
  });

  it("builds an OR label search per alias set and dedupes across the two searches", async () => {
    const { fetch, calls } = mockFetch(() => ({ data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: page2.data.search.nodes } } }));
    const issues = await new GithubIssueSource({ fetch }).fetchOpenIssues(org);
    expect(calls.map((c) => c.body.variables.q)).toEqual([
      'org:hiero-ledger is:issue is:open label:"good first issue","skill: good first issue"',
      'org:hiero-ledger is:issue is:open label:"help wanted"',
    ]);
    expect(issues).toHaveLength(1);
    expect(buildSearchQuery("o", ['a"b'])).toBe('org:o is:issue is:open label:"ab"');
  });

  it("follows the cursor across pages", async () => {
    const { fetch, calls } = mockFetch((_c, n) => (n === 1 ? page1 : page2));
    const issues = await new GithubIssueSource({ fetch }).searchAll("hiero-ledger", "q");
    expect(issues.map((i) => i.number)).toEqual([13130, 601, 7]);
    expect(calls.map((c) => c.body.variables.cursor)).toEqual([null, "Y3Vyc29yOjEwMA=="]);
  });
});

describe("pagination", () => {
  it("stops at 3 pages even when GitHub keeps saying hasNextPage", async () => {
    const { fetch, calls } = mockFetch(() => page1);
    const noEmpty: OrgConfig = { ...org, labels: { ...org.labels, helpWanted: [] } };
    await new GithubIssueSource({ fetch }).fetchOpenIssues(noEmpty);
    expect(calls).toHaveLength(3);
  });

  it("stops early when there is no next page", async () => {
    const { fetch, calls } = mockFetch(() => page2);
    await new GithubIssueSource({ fetch }).searchAll("hiero-ledger", "q");
    expect(calls).toHaveLength(1);
  });
});

describe("client behaviour", () => {
  it("sends User-Agent, posts to the GraphQL endpoint, and omits Authorization without a token", async () => {
    const { fetch, calls } = mockFetch(() => page2);
    await new GithubIssueSource({ fetch }).searchAll("o", "q");
    expect(calls[0]!.url).toBe("https://api.github.com/graphql");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.headers["User-Agent"]).toBe("issue-scout");
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the token when given", async () => {
    const { fetch, calls } = mockFetch(() => page2);
    await new GithubIssueSource({ fetch, token: "test-token" }).searchAll("o", "q");
    expect(calls[0]!.headers.Authorization).toBe("Bearer test-token");
  });

  it("reads rate-limit headers into RateLimitInfo", async () => {
    const { fetch } = mockFetch(() => jsonResponse(page2, { headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4321", "x-ratelimit-reset": "1790000000" } }));
    const client = new GithubGraphQL({ fetch });
    expect(client.rateLimit).toEqual({ limit: null, remaining: null, resetAt: null });
    await client.searchPage("q", null);
    expect(client.rateLimit).toEqual({ limit: 5000, remaining: 4321, resetAt: 1790000000 });
  });

  it("throws GithubRateLimitError on 403 with remaining 0", async () => {
    const { fetch } = mockFetch(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" } }));
    const err = await new GithubGraphQL({ fetch }).searchPage("q", null).catch((e) => e);
    expect(err).toBeInstanceOf(GithubRateLimitError);
    expect(err.resetAt).toBe(1790000000);
  });

  it("throws GithubApiError on HTTP errors, GraphQL errors without data, and timeouts", async () => {
    const http = mockFetch(() => new Response("nope", { status: 502 }));
    await expect(new GithubGraphQL({ fetch: http.fetch }).searchPage("q", null)).rejects.toMatchObject({ status: 502 });
    const gql = mockFetch(() => ({ errors: [{ message: "bad query" }] }));
    await expect(new GithubGraphQL({ fetch: gql.fetch }).searchPage("q", null)).rejects.toThrow(/bad query/);
    const slow = async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    };
    await expect(new GithubGraphQL({ fetch: slow }).searchPage("q", null)).rejects.toThrow(GithubApiError);
  });
});
