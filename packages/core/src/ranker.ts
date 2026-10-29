import type { Candidate, Preferences, Profile, Ranked, RawIssue } from "./schema.js";

const DAY = 86_400_000;
const CLAIM_RE = /i'?d like to (take|work on)|can i (take|work)|assign me/i;
const TESTS_RE = /\btests?\b|\btesting\b/i;
const CHECKLIST_RE = /- \[[ xX]\]|acceptance/i;

const SIZE_HOURS: Record<string, number> = { xs: 1, s: 2, small: 2, m: 4, medium: 4, l: 8, large: 8, xl: 16 };

/** Effort in hours from size/* or effort/* labels, else from body length. */
export function estimateEffortHours(issue: Pick<RawIssue, "body" | "labels">): number {
  for (const label of issue.labels) {
    const m = /^(?:size|effort)\s*[/:]\s*(.+)$/i.exec(label.trim());
    if (!m || !m[1]) continue;
    const v = m[1].trim().toLowerCase();
    const known = SIZE_HOURS[v];
    if (known !== undefined) return known;
    const n = /^(\d+(?:\.\d+)?)\s*h?$/.exec(v);
    if (n && n[1]) return Number(n[1]);
  }
  const len = issue.body.length;
  if (len < 500) return 1;
  if (len < 1500) return 2;
  if (len < 3000) return 4;
  return 8;
}
export function languageRank(profile: Profile): string[] {
  return [...profile.languages]
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .map((l) => l.name);
}

function ageDays(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY;
}

export function effectivePrefs(profile: Profile, prefs: Preferences) {
  return {
    timeBudgetHours: prefs.timeBudgetHours ?? profile.timeBudgetHours,
    wantsTests: prefs.wantsTests ?? profile.wantsTests ?? false,
  };
}

/** Score one candidate per ARCHITECTURE s5. Pure. */
export function scoreCandidate(c: Candidate, profile: Profile, prefs: Preferences, now: Date): Ranked {
  let score = 0;
  const reasons: string[] = [];
  const add = (pts: number, reason: string) => {
    score += pts;
    reasons.push(reason);
  };
  const eff = effectivePrefs(profile, prefs);

  // Language
  if (c.repoLanguage) {
    const lang = c.repoLanguage.toLowerCase();
    const ranked = languageRank(profile);
    const idx = ranked.findIndex((n) => n.toLowerCase() === lang);
    if (idx >= 0 && idx < 3) add(3, `Repo is ${c.repoLanguage}, your main language`);
    else if (idx >= 3) add(1, `Repo is ${c.repoLanguage}, which you have used`);
  }

  // Tier vs experience
  const band = profile.experienceBand;
  if (c.tier === "firstIssue" && band <= 1) add(2, "Labelled for first-timers");
  else if (c.tier === "helpWanted" && band === 2) add(2, "Help-wanted matches your experience");
  else if (c.tier === "firstIssue" && band === 2) add(-1, "Labelled as a first issue; may be too small for you");
  else if (c.tier === "helpWanted" && band === 0) add(-1, "Labelled help-wanted; may be too large for a first issue");

  // Assignee: candidates are unassigned by construction
  if (c.assignees === 0) add(2, "Unassigned");

  if (!(c.lastComment && CLAIM_RE.test(c.lastComment))) add(1, "Nobody has asked to take it");

  if (ageDays(c.updatedAt, now) <= 30) add(1, "Active in the last month");
  if (ageDays(c.createdAt, now) > 180) add(-1, "Older than six months");

  const len = c.body.length;
  if (len >= 200 && len <= 2000) add(1, "Well-scoped description");
  if (CHECKLIST_RE.test(c.body)) add(1, "Has acceptance criteria");

  if (c.repoLastMergedPrAt && ageDays(c.repoLastMergedPrAt, now) <= 14) {
    add(1, "Repo merged a PR in the last two weeks");
  }

  if (eff.wantsTests && (TESTS_RE.test(c.body) || c.labels.some((l) => TESTS_RE.test(l)))) {
    add(1, "Involves tests");
  }

  if (eff.timeBudgetHours !== undefined && estimateEffortHours(c) > eff.timeBudgetHours) {
    add(-2, "Probably bigger than your time budget");
  }

  return { issue: c, score, reasons };
}

function repoKey(c: Candidate): string {
  return `${c.org}/${c.repo}`.toLowerCase();
}

/** True if the candidate is excluded by profile/preferences (repos or issues). */
export function excludedByPrefs(c: Candidate | RawIssue, profile: Profile, prefs: Preferences): string | undefined {
  const full = `${c.org}/${c.repo}`.toLowerCase();
  const repoList = [...profile.excludeRepos, ...prefs.excludeRepos].map((r) => r.toLowerCase());
  if (repoList.includes(full) || repoList.includes(c.repo.toLowerCase())) return `Repository ${c.org}/${c.repo} is on your exclude list`;
  if (prefs.excludeIssues.includes(c.id) || prefs.excludeIssues.includes(c.url)) return "Issue is on your exclude list";
  return undefined;
}

export function compareRanked(a: Ranked, b: Ranked): number {
  if (b.score !== a.score) return b.score - a.score;
  const ua = new Date(a.issue.updatedAt).getTime();
  const ub = new Date(b.issue.updatedAt).getTime();
  if (ub !== ua) return ub - ua;
  return a.issue.number - b.issue.number;
}

/**
 * Rank candidates. Top five honour the diversity rule (<=2 per repo); the
 * next five (positions 6-10 of what remains, in score order) are runners-up.
 */
export function rank(
  candidates: Candidate[],
  profile: Profile,
  preferences: Preferences,
  now: Date,
): { top: Ranked[]; runnersUp: Ranked[] } {
  const scored = candidates
    .filter((c) => excludedByPrefs(c, profile, preferences) === undefined)
    .map((c) => scoreCandidate(c, profile, preferences, now))
    .sort(compareRanked);

  const top: Ranked[] = [];
  const rest: Ranked[] = [];
  const perRepo = new Map<string, number>();
  for (const r of scored) {
    const k = repoKey(r.issue);
    if (top.length < 5 && (perRepo.get(k) ?? 0) < 2) {
      top.push(r);
      perRepo.set(k, (perRepo.get(k) ?? 0) + 1);
    } else {
      rest.push(r);
    }
  }
  return { top, runnersUp: rest.slice(0, 5) };
}
