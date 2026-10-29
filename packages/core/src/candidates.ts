import { labelSets, findOrg } from "./registry.js";
import type { Candidate, OrgConfig, RawIssue, Tier } from "./schema.js";

export type CandidateVerdict =
  | { ok: true; tier: Tier }
  | { ok: false; reason: string };

/** FR-4 evaluated for one issue; the reason names the first failing rule. */
export function evaluateCandidate(raw: RawIssue, registry: OrgConfig[]): CandidateVerdict {
  const org = findOrg(registry, raw.org);
  if (!org) return { ok: false, reason: `Organisation ${raw.org} is not in the registry` };
  if (!org.enabled) return { ok: false, reason: `Organisation ${org.login} is disabled` };
  if (raw.assignees > 0) return { ok: false, reason: "Already assigned" };
  const sets = labelSets(org);
  const labels = raw.labels.map((l) => l.trim().toLowerCase());
  const claimed = labels.find((l) => sets.claimed.has(l));
  if (claimed) return { ok: false, reason: `Has claimed label "${claimed}"` };
  const excluded = labels.find((l) => sets.exclude.has(l));
  if (excluded) return { ok: false, reason: `Has excluded label "${excluded}"` };
  if (labels.some((l) => sets.firstIssue.has(l))) return { ok: true, tier: "firstIssue" };
  if (labels.some((l) => sets.helpWanted.has(l))) return { ok: true, tier: "helpWanted" };
  return { ok: false, reason: "No first-issue or help-wanted label" };
}

/** Snapshot issues are assumed open. Order of input is preserved. */
export function toCandidates(raw: RawIssue[], registry: OrgConfig[]): Candidate[] {
  const out: Candidate[] = [];
  for (const r of raw) {
    const v = evaluateCandidate(r, registry);
    if (v.ok) out.push({ ...r, tier: v.tier });
  }
  return out;
}
