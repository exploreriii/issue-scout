import type { Explanation, Preferences, Profile, Ranked } from "@issue-scout/core";
import type { ScoutInput } from "@issue-scout/sources";

export const SESSION_TTL_SECONDS = 7 * 86_400; // NFR-6
export const MAX_WATCHES = 10;
export const MAX_MESSAGES = 50;

export type ShortlistItem = Ranked & { explanation?: Explanation };

export interface Watch {
  scheduleId: string;
  issueId: string;
  url: string;
  title: string;
  days: number;
  createdAt: string;
  dueAt: string;
  status: "pending" | "done";
}

export interface SessionMessage {
  at: string;
  text: string;
}

export interface IssueScoutState {
  version: 1;
  profile?: Profile;
  /** What built the profile, so a refine can refill an expired snapshot without refetching the profile. */
  input?: ScoutInput;
  snapshotId?: string;
  /** KV keys of the per-org snapshots the ranking was built from. */
  candidatesRef?: string[];
  ranked?: { top: Ranked[]; runnersUp: Ranked[] };
  explanations?: Explanation[];
  preferences: Preferences;
  rejected: { issues: string[]; repos: string[] };
  watches: Watch[];
  /** Messages produced outside a request (watch results). */
  messages: SessionMessage[];
  createdAt: string;
}

export function emptyPreferences(): Preferences {
  return { excludeRepos: [], excludeIssues: [] };
}

export function initialState(now: Date = new Date()): IssueScoutState {
  return {
    version: 1,
    preferences: emptyPreferences(),
    rejected: { issues: [], repos: [] },
    watches: [],
    messages: [],
    createdAt: now.toISOString(),
  };
}

/** Preferences with the user's rejections folded in; this is what the ranker sees. */
export function effectivePreferences(s: IssueScoutState): Preferences {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    ...s.preferences,
    excludeRepos: uniq([...s.preferences.excludeRepos, ...s.rejected.repos]),
    excludeIssues: uniq([...s.preferences.excludeIssues, ...s.rejected.issues]),
  };
}

export function allRanked(s: IssueScoutState): Ranked[] {
  return s.ranked ? [...s.ranked.top, ...s.ranked.runnersUp] : [];
}

export function toShortlist(top: Ranked[], explanations: Explanation[] | undefined): ShortlistItem[] {
  const byId = new Map((explanations ?? []).map((e) => [e.issueId, e]));
  return top.map((r) => {
    const explanation = byId.get(r.issue.id);
    return explanation ? { ...r, explanation } : r;
  });
}
