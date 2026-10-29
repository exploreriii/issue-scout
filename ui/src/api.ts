// Response shapes mirror ARCHITECTURE s3/s4 and packages/core/src/schema.ts.
// Declared locally (type-only) so the UI bundle never pulls in zod or core.

export type Tier = "firstIssue" | "helpWanted";

export interface Candidate {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  assignees: number;
  comments: number;
  createdAt: string;
  updatedAt: string;
  repoLanguage?: string;
  repoTopics: string[];
  repoLastMergedPrAt?: string;
  lastComment?: string;
  tier: Tier;
}

export interface Explanation {
  issueId: string;
  fit: string;
  firstPrLooksLike: string;
  effortHours: number;
  firstStep: string;
}

export interface Ranked {
  issue: Candidate;
  score: number;
  reasons: string[];
}

export type ShortlistItem = Ranked & { explanation?: Explanation };

export interface Profile {
  source: "github" | "text";
  handle?: string;
  languages: { name: string; weight: number }[];
  experienceBand: 0 | 1 | 2;
  timeBudgetHours?: number;
  wantsTests?: boolean;
  excludeRepos: string[];
}

export interface ScoutResponse {
  profile: Profile;
  shortlist: ShortlistItem[];
  runnersUp: Ranked[];
  snapshot: { id: string; ageSeconds: number };
  /** "pending" when the request asked for no explanations (?explain=0); a second call fills them in. */
  explanations?: "ok" | "unavailable" | "pending";
  /** Candidates per org login before the org filter. */
  orgCounts?: Record<string, number>;
  /** The org filter that was applied, when one was. */
  orgs?: string[];
}

export interface OrgInfo {
  login: string;
  displayName: string;
}

export type ScoutInput = { handle: string } | { profileText: string };

/** GET /orgs. Failure is not fatal: the page just has no filter row. */
export async function getOrgs(): Promise<OrgInfo[]> {
  const res = await fetch("/orgs");
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return [];
  return body.filter(
    (o): o is OrgInfo => !!o && typeof o.login === "string" && typeof o.displayName === "string",
  );
}

export async function postScout(
  input: ScoutInput,
  orgs?: string[],
  opts: { explain?: boolean } = {},
): Promise<ScoutResponse> {
  const res = await fetch(opts.explain === false ? "/scout?explain=0" : "/scout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orgs && orgs.length > 0 ? { ...input, orgs } : input),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* non-JSON error body: keep the default message */
    }
    throw new Error(message);
  }
  return (await res.json()) as ScoutResponse;
}
