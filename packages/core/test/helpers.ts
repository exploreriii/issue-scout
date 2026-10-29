import type { Candidate, OrgConfig, Preferences, Profile, RawIssue } from "../src/index.js";

export const NOW = new Date("2026-10-29T12:00:00Z");
export const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

export const org: OrgConfig = {
  login: "hiero-ledger",
  displayName: "Hiero",
  enabled: true,
  labels: {
    firstIssue: ["good first issue", "Good First Issue: Beginner"],
    helpWanted: ["help wanted"],
    claimed: ["status: in progress", "assigned"],
    exclude: ["epic", "discussion", "tracking"],
  },
  defaultLanguages: ["Python"],
};

export const emptyPrefs: Preferences = { excludeRepos: [], excludeIssues: [] };

export const profile = (over: Partial<Profile> = {}): Profile => ({
  source: "text",
  languages: [{ name: "Python", weight: 1 }],
  experienceBand: 1,
  excludeRepos: [],
  ...over,
});

/** A neutral issue: scores only "Unassigned" + "Nobody has asked" by default. */
export const raw = (over: Partial<RawIssue> = {}): RawIssue => ({
  id: "i1",
  org: "hiero-ledger",
  repo: "r1",
  number: 1,
  title: "t",
  body: "short",
  url: "https://github.com/hiero-ledger/r1/issues/1",
  labels: ["good first issue"],
  assignees: 0,
  comments: 0,
  createdAt: daysAgo(100),
  updatedAt: daysAgo(100),
  repoTopics: [],
  ...over,
});

export const cand = (over: Partial<Candidate> = {}): Candidate => ({ ...raw(), tier: "firstIssue", ...over });
