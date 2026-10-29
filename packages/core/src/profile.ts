import type { Profile } from "./schema.js";

export interface GithubUser { login: string }
export interface GithubRepo {
  language?: string | null;
  pushed_at?: string | null;
  fork?: boolean;
  archived?: boolean;
}

const YEAR = 365 * 86_400_000;

function normalise(m: Map<string, number>): { name: string; weight: number }[] {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...m.entries()]
    .map(([name, w]) => ({ name, weight: Math.round((w / total) * 10_000) / 10_000 }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

/**
 * Languages weighted by repo count and recency. Recency is measured against
 * the newest push across the repos (no clock), so the result is deterministic.
 * Forks are ignored. Repo weight: pushed within 1y = 1, within 3y = 0.5, else 0.25.
 */
export function profileFromGithub(user: GithubUser, repos: GithubRepo[], mergedPrCount: number): Profile {
  const own = repos.filter((r) => !r.fork && r.language);
  const times = own.map((r) => (r.pushed_at ? Date.parse(r.pushed_at) : NaN)).filter((t) => !Number.isNaN(t));
  const ref = times.length ? Math.max(...times) : 0;
  const weights = new Map<string, number>();
  for (const r of own) {
    const t = r.pushed_at ? Date.parse(r.pushed_at) : NaN;
    const age = Number.isNaN(t) ? Infinity : ref - t;
    const w = age <= YEAR ? 1 : age <= 3 * YEAR ? 0.5 : 0.25;
    const name = r.language as string;
    weights.set(name, (weights.get(name) ?? 0) + w);
  }
  return {
    source: "github",
    handle: user.login,
    languages: normalise(weights),
    experienceBand: bandFromMergedPrs(mergedPrCount),
    excludeRepos: [],
  };
}

export function bandFromMergedPrs(n: number): 0 | 1 | 2 {
  return n <= 0 ? 0 : n <= 5 ? 1 : 2;
}

const LANGUAGES: { name: string; re: RegExp }[] = [
  { name: "Python", re: /\bpython\b/gi },
  { name: "Rust", re: /\brust\b/gi },
  { name: "TypeScript", re: /\btypescript\b|\bts\b/gi },
  { name: "JavaScript", re: /\bjavascript\b|\bjs\b|\bnode(?:\.js)?\b/gi },
  { name: "Go", re: /\bgolang\b|\bgo\b(?=\s*(?:lang|,|\.|$|and|or|\b(?:code|programming)))/gi },
  { name: "Java", re: /\bjava\b(?!script)/gi },
  { name: "Kotlin", re: /\bkotlin\b/gi },
  { name: "C++", re: /\bc\+\+/gi },
  { name: "C#", re: /\bc#/gi },
  { name: "Swift", re: /\bswift\b/gi },
  { name: "Ruby", re: /\bruby\b/gi },
  { name: "PHP", re: /\bphp\b/gi },
  { name: "Solidity", re: /\bsolidity\b/gi },
  { name: "Scala", re: /\bscala\b/gi },
  { name: "Shell", re: /\bbash\b|\bshell\b/gi },
];
const HEDGE_RE = /(a (?:bit|little) of|some|basic|beginner|learning|little)\s*$/i;

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};
const NUM = "(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)";
const num = (s: string) => (NUM_WORDS[s.toLowerCase()] ?? Number(s));

/** Hours per evening and per weekend when a text budget is given in those units. */
export const HOURS_PER_EVENING = 2;
export const HOURS_PER_WEEKEND = 8;

export function parseHours(text: string): number | undefined {
  const t = text.toLowerCase();
  const hrs = new RegExp(`${NUM}\\s*(?:hours?|hrs?)\\b`).exec(t);
  if (hrs?.[1]) return num(hrs[1]);
  const eve = new RegExp(`${NUM}\\s*evenings?\\b`).exec(t);
  if (eve?.[1]) return num(eve[1]) * HOURS_PER_EVENING;
  const wk = new RegExp(`${NUM}\\s*weekends?\\b`).exec(t);
  if (wk?.[1]) return num(wk[1]) * HOURS_PER_WEEKEND;
  if (/\bweekend\b/.test(t)) return HOURS_PER_WEEKEND;
  return undefined;
}

/** Simple keyword extraction. Deterministic; weights normalised to sum 1. */
export function profileFromText(text: string): Profile {
  const found: { name: string; pos: number; hedged: boolean }[] = [];
  for (const { name, re } of LANGUAGES) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    found.push({ name, pos: m.index, hedged: HEDGE_RE.test(before) });
  }
  found.sort((a, b) => a.pos - b.pos);
  const weights = new Map<string, number>();
  found.forEach((f, i) => weights.set(f.name, f.hedged ? 0.3 : Math.max(0.5, 1 - i * 0.1)));

  const prs = new RegExp(`${NUM}\\s+(?:merged\\s+)?(?:prs?|pull requests?)\\b`, "i").exec(text);
  const band = prs?.[1] ? bandFromMergedPrs(num(prs[1])) : 0;

  const profile: Profile = {
    source: "text",
    languages: normalise(weights),
    experienceBand: band,
    excludeRepos: [],
  };
  const hours = parseHours(text);
  if (hours !== undefined) profile.timeBudgetHours = hours;
  if (/\b(tests?|testing)\b/i.test(text)) profile.wantsTests = true;
  return profile;
}
