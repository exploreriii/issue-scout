import {
  RawIssueSchema,
  rank,
  toCandidates,
  type Explanation,
  type OrgConfig,
  type Preferences,
  type Profile,
  type Ranked,
  type RawIssue,
} from "@issue-scout/core";
import { DEFAULT_MODEL, explain, type AiBinding } from "@issue-scout/explainer";
import {
  GithubHttp,
  GithubIssueSource,
  GithubProfileSource,
  KvCache,
  SNAPSHOT_TTL_SECONDS,
  scout,
  snapshotKey,
  type Cache,
  type IssueSource,
  type ProfileSource,
  type RateLimitInfo,
  type ScoutInput,
} from "@issue-scout/sources";
import { z } from "zod";
import type { Env } from "./env";
import { getRegistry } from "./registry";
import { toShortlist, type ShortlistItem } from "./state";

export const RATE_LIMIT_KEY = "gh:ratelimit";

/** Everything the flow and the tools need, built once per request or per agent message. */
export interface Deps {
  cache: Cache;
  issues: IssueSource;
  profiles: ProfileSource;
  /** Read-only REST client (GET only, FR-15). */
  github: GithubHttp;
  registry: OrgConfig[];
  ai: AiBinding;
  model: string;
  now: () => Date;
  rateLimits: () => RateLimitInfo[];
}

export function createDeps(env: Env, now: () => Date = () => new Date()): Deps {
  const opts = { token: env.GITHUB_TOKEN };
  const issues = new GithubIssueSource(opts);
  const profiles = new GithubProfileSource(opts);
  const github = new GithubHttp(opts);
  return {
    cache: new KvCache(env.CACHE),
    issues,
    profiles,
    github,
    registry: getRegistry(),
    ai: env.AI as unknown as AiBinding,
    model: env.AI_MODEL ?? DEFAULT_MODEL,
    now,
    rateLimits: () => [issues.rateLimit, profiles.rateLimit, github.rateLimit],
  };
}

/** Keep the lowest "remaining" seen this run so /health can report it (FR-14). Never throws. */
export async function recordRateLimit(deps: Deps): Promise<void> {
  try {
    const seen = deps.rateLimits().filter((r) => r.remaining !== null);
    if (seen.length === 0) return;
    const low = seen.reduce((a, b) => ((b.remaining ?? 0) < (a.remaining ?? 0) ? b : a));
    await deps.cache.put(RATE_LIMIT_KEY, { ...low, seenAt: deps.now().toISOString() }, 3600);
  } catch {
    /* health metadata is best-effort */
  }
}

export type OrgCounts = Record<string, number>;

export interface ScoutOutput {
  profile: Profile;
  shortlist: ShortlistItem[];
  top: Ranked[];
  runnersUp: Ranked[];
  explanations: Explanation[];
  explanationsStatus: "ok" | "unavailable";
  snapshot: { id: string; ageSeconds: number };
  candidatesRef: string[];
  warnings: string[];
  fetches: { issues: number; profiles: number };
  /** Candidates per enabled org before the org filter. */
  orgCounts: OrgCounts;
  /** Canonical logins of the org filter applied, if any. */
  orgs?: string[];
}

/** Map requested logins to canonical registry logins (case-insensitive). Unknown ones are returned separately. */
export function resolveOrgs(registry: OrgConfig[], requested: string[]): { orgs: string[]; unknown: string[] } {
  const byLower = new Map(registry.filter((o) => o.enabled).map((o) => [o.login.toLowerCase(), o.login]));
  const orgs: string[] = [];
  const unknown: string[] = [];
  for (const r of requested) {
    const login = byLower.get(r.toLowerCase());
    if (!login) unknown.push(r);
    else if (!orgs.includes(login)) orgs.push(login);
  }
  return { orgs, unknown };
}

export async function candidateKeys(registry: OrgConfig[]): Promise<string[]> {
  return Promise.all(registry.filter((o) => o.enabled).map((o) => snapshotKey(o)));
}

/**
 * The shared orchestration behind POST /scout and the agent's first message:
 * profile -> cached snapshots -> rank -> one explainer call for the top five.
 */
export async function runScout(
  input: ScoutInput,
  deps: Deps,
  preferences?: Preferences,
  profiles: ProfileSource = deps.profiles,
): Promise<ScoutOutput> {
  const result = await scout(input, {
    issues: deps.issues,
    profiles,
    cache: deps.cache,
    registry: deps.registry,
    now: deps.now(),
    ...(preferences ? { preferences } : {}),
  });
  // scout() has just warmed the per-org snapshots, so this is a zero-network read.
  const keys = await candidateKeys(deps.registry);
  const orgs = preferences?.orgs && preferences.orgs.length > 0 ? preferences.orgs : undefined;
  const pool = await loadAvailable(deps.cache, keys, deps.now());
  let { top, runnersUp } = result;
  let orgCounts: OrgCounts = {};
  if (pool.length > 0) {
    const reranked = rerank(pool, deps.registry, result.profile, preferences ?? emptyPrefs(), deps.now());
    orgCounts = reranked.orgCounts;
    if (orgs) ({ top, runnersUp } = reranked);
  }
  const ex = await explain(top, result.profile, { ai: deps.ai, model: deps.model });
  await recordRateLimit(deps);
  return {
    profile: result.profile,
    shortlist: toShortlist(top, ex.explanations),
    top,
    runnersUp,
    orgCounts,
    ...(orgs ? { orgs } : {}),
    explanations: ex.explanations,
    explanationsStatus: ex.status,
    snapshot: { id: result.snapshot.id, ageSeconds: result.snapshot.ageSeconds },
    candidatesRef: await candidateKeys(deps.registry),
    warnings: result.warnings,
    fetches: result.fetches,
  };
}

const CachedSnapshot = z.object({ recordedAt: z.string(), issues: z.array(RawIssueSchema) });

/** Raw issues from the warm per-org snapshots, or null if any is missing or past its TTL. Zero network. */
export async function loadRaw(
  cache: Cache,
  keys: string[],
  now: Date,
): Promise<{ raw: RawIssue[]; recordedAt: string } | null> {
  const byId = new Map<string, RawIssue>();
  let oldest = "";
  for (const key of keys) {
    const parsed = CachedSnapshot.safeParse(await cache.get<unknown>(key));
    if (!parsed.success) return null;
    const age = now.getTime() - Date.parse(parsed.data.recordedAt);
    if (!(age >= 0 && age < SNAPSHOT_TTL_SECONDS * 1000)) return null;
    for (const i of parsed.data.issues) if (!byId.has(i.id)) byId.set(i.id, i);
    if (oldest === "" || parsed.data.recordedAt < oldest) oldest = parsed.data.recordedAt;
  }
  return { raw: [...byId.values()], recordedAt: oldest || now.toISOString() };
}

const emptyPrefs = (): Preferences => ({ excludeRepos: [], excludeIssues: [] });

/** Issues from whichever per-org snapshots are warm; missing or stale ones are skipped. Zero network. */
async function loadAvailable(cache: Cache, keys: string[], now: Date): Promise<RawIssue[]> {
  const byId = new Map<string, RawIssue>();
  for (const key of keys) {
    const parsed = CachedSnapshot.safeParse(await cache.get<unknown>(key));
    if (!parsed.success) continue;
    const age = now.getTime() - Date.parse(parsed.data.recordedAt);
    if (!(age >= 0 && age < SNAPSHOT_TTL_SECONDS * 1000)) continue;
    for (const i of parsed.data.issues) if (!byId.has(i.id)) byId.set(i.id, i);
  }
  return [...byId.values()];
}

/**
 * Rank raw issues for a profile. `prefs.languages` and `prefs.orgs` are hard filters here (core's ranker only
 * scores). `orgCounts` is the number of candidates per enabled org after the language filter but before the org filter.
 */
export function rerank(
  raw: RawIssue[],
  registry: OrgConfig[],
  profile: Profile,
  prefs: Preferences,
  now: Date,
): { top: Ranked[]; runnersUp: Ranked[]; orgCounts: OrgCounts } {
  let candidates = toCandidates(raw, registry);
  const langs = (prefs.languages ?? []).map((l) => l.toLowerCase());
  if (langs.length > 0) {
    candidates = candidates.filter((c) => c.repoLanguage !== undefined && langs.includes(c.repoLanguage.toLowerCase()));
  }
  const orgCounts: OrgCounts = {};
  for (const o of registry) if (o.enabled) orgCounts[o.login] = 0;
  const canonical = new Map(registry.map((o) => [o.login.toLowerCase(), o.login]));
  for (const c of candidates) {
    const login = canonical.get(c.org.toLowerCase());
    if (login !== undefined && login in orgCounts) orgCounts[login] = (orgCounts[login] ?? 0) + 1;
  }
  const wanted = new Set((prefs.orgs ?? []).map((o) => o.toLowerCase()));
  if (wanted.size > 0) candidates = candidates.filter((c) => wanted.has(c.org.toLowerCase()));
  return { ...rank(candidates, profile, prefs, now), orgCounts };
}
