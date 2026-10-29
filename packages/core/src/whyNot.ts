import { evaluateCandidate } from "./candidates.js";
import { excludedByPrefs, scoreCandidate } from "./ranker.js";
import type { OrgConfig, Preferences, Profile, RawIssue } from "./schema.js";

export type WhyNotResult = { reasons: string[] } | { excludedBy: string };

/**
 * Explain an issue: why it would rank (its score reasons) or which rule
 * excludes it from the candidate set.
 */
export function whyNot(
  issueUrl: string,
  raw: RawIssue[],
  registry: OrgConfig[],
  profile: Profile,
  preferences: Preferences,
  now: Date,
): WhyNotResult {
  const issue = raw.find((r) => r.url === issueUrl);
  if (!issue) return { excludedBy: "Issue is not in the current snapshot" };
  const verdict = evaluateCandidate(issue, registry);
  if (!verdict.ok) return { excludedBy: verdict.reason };
  const pref = excludedByPrefs(issue, profile, preferences);
  if (pref) return { excludedBy: pref };
  const ranked = scoreCandidate({ ...issue, tier: verdict.tier }, profile, preferences, now);
  return { reasons: ranked.reasons };
}
