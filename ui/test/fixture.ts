import type { ScoutResponse } from "../src/api";

const issue = (n: number, extra: Partial<ScoutResponse["shortlist"][0]["issue"]> = {}) => ({
  id: `hiero-ledger/sdk-js#${n}`,
  org: "hiero-ledger",
  repo: "sdk-js",
  number: n,
  title: `Fix thing ${n}`,
  body: "body",
  url: `https://github.com/hiero-ledger/sdk-js/issues/${n}`,
  labels: ["good first issue", "typescript"],
  assignees: 0,
  comments: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  repoTopics: [],
  tier: "firstIssue" as const,
  ...extra,
});

export const fixture: ScoutResponse = {
  profile: { source: "github", handle: "octocat", languages: [{ name: "TypeScript", weight: 1 }], experienceBand: 0, excludeRepos: [] },
  shortlist: [1, 2, 3, 4, 5].map((n) => ({
    issue: issue(n),
    score: 14 - n * 2, // raw rule points: 12, 10, 8, 6, 4
    reasons: [`language match ${n}`, "recently active"],
    ...(n === 1
      ? {
          explanation: {
            issueId: "hiero-ledger/sdk-js#1",
            fit: "You write TypeScript.",
            firstPrLooksLike: "A small docs fix.",
            effortHours: 2,
            firstStep: "Read CONTRIBUTING.md.",
          },
        }
      : {}),
  })),
  runnersUp: [6, 7].map((n) => ({ issue: issue(n), score: 3, reasons: [`runner reason ${n}`] })),
  snapshot: { id: "snap1", ageSeconds: 12 },
};
