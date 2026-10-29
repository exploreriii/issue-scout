import {
  ProfileSchema,
  RawIssueSchema,
  profileFromText,
  rank,
  toCandidates,
  type OrgConfig,
  type Preferences,
  type Profile,
  type Ranked,
  type RawIssue,
} from "@issue-scout/core";
import { z } from "zod";
import { assertValidHandle } from "./github/rest.js";
import {
  InvalidProfileTextError,
  type Cache,
  type IssueSource,
  type ProfileSource,
} from "./types.js";

export const SNAPSHOT_TTL_SECONDS = 3600; // NFR-3
export const PROFILE_TTL_SECONDS = 86_400; // NFR-3
export const MAX_PROFILE_TEXT = 500; // FR-1

export type ScoutInput = { handle: string } | { profileText: string };

export interface ScoutDeps {
  issues: IssueSource;
  profiles: ProfileSource;
  cache: Cache;
  registry: OrgConfig[];
  now: Date;
  preferences?: Preferences;
}

export interface ScoutResult {
  profile: Profile;
  snapshot: { id: string; recordedAt: string; ageSeconds: number };
  top: Ranked[];
  runnersUp: Ranked[];
  /** Source calls made by this run; zero on a warm cache (FR-9). */
  fetches: { issues: number; profiles: number };
  /** Orgs that failed to load while others succeeded. */
  warnings: string[];
}

const CachedSnapshotSchema = z.object({ recordedAt: z.string(), issues: z.array(RawIssueSchema) });
type CachedSnapshot = z.infer<typeof CachedSnapshotSchema>;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `snap:{org}:{labelset-hash}:{page}` (ARCHITECTURE s7); a snapshot is stored as one "all" page. */
export async function snapshotKey(org: OrgConfig): Promise<string> {
  const aliases = JSON.stringify([org.labels.firstIssue, org.labels.helpWanted].map((s) => s.map((l) => l.toLowerCase()).sort()));
  return `snap:${org.login}:${(await sha256Hex(aliases)).slice(0, 12)}:all`;
}

export const profileKey = (handle: string) => `profile:${handle.toLowerCase()}`;

export async function snapshotId(orgLogins: string[], recordedAt: string): Promise<string> {
  return sha256Hex(`${[...orgLogins].sort().join(",")}|${recordedAt}`);
}

export async function scout(input: ScoutInput, deps: ScoutDeps): Promise<ScoutResult> {
  const { cache, registry, now } = deps;
  const fetches = { issues: 0, profiles: 0 };
  const issues: IssueSource = {
    fetchOpenIssues: (org) => {
      fetches.issues++;
      return deps.issues.fetchOpenIssues(org);
    },
  };
  const profiles: ProfileSource = {
    fetchProfile: (h) => {
      fetches.profiles++;
      return deps.profiles.fetchProfile(h);
    },
  };

  // Profile
  let profile: Profile;
  if ("handle" in input) {
    assertValidHandle(input.handle);
    const key = profileKey(input.handle);
    const hit = ProfileSchema.safeParse(await cache.get<unknown>(key));
    if (hit.success) {
      profile = hit.data;
    } else {
      profile = await profiles.fetchProfile(input.handle);
      await cache.put(key, profile, PROFILE_TTL_SECONDS);
    }
  } else {
    const text = input.profileText.trim();
    if (text.length === 0 || text.length > MAX_PROFILE_TEXT) throw new InvalidProfileTextError();
    profile = profileFromText(text);
  }

  // Issues: one cached snapshot per enabled org.
  const orgs = registry.filter((o) => o.enabled);
  const loaded = await Promise.allSettled(
    orgs.map(async (org): Promise<CachedSnapshot> => {
      const key = await snapshotKey(org);
      const parsed = CachedSnapshotSchema.safeParse(await cache.get<unknown>(key));
      if (parsed.success) {
        const ageMs = now.getTime() - Date.parse(parsed.data.recordedAt);
        if (ageMs >= 0 && ageMs < SNAPSHOT_TTL_SECONDS * 1000) return parsed.data;
      }
      const fresh: CachedSnapshot = { recordedAt: now.toISOString(), issues: await issues.fetchOpenIssues(org) };
      await cache.put(key, fresh, SNAPSHOT_TTL_SECONDS);
      return fresh;
    }),
  );

  const snapshots: CachedSnapshot[] = [];
  const warnings: string[] = [];
  const logins: string[] = [];
  loaded.forEach((r, i) => {
    const login = orgs[i]!.login;
    if (r.status === "fulfilled") {
      snapshots.push(r.value);
      logins.push(login);
    } else {
      warnings.push(`${login}: ${(r.reason as Error).message}`);
    }
  });
  if (orgs.length > 0 && snapshots.length === 0) {
    throw loaded.find((r): r is PromiseRejectedResult => r.status === "rejected")!.reason;
  }

  const byId = new Map<string, RawIssue>();
  for (const s of snapshots) for (const i of s.issues) if (!byId.has(i.id)) byId.set(i.id, i);

  const recordedAt = snapshots.map((s) => s.recordedAt).sort()[0] ?? now.toISOString();
  const preferences: Preferences = deps.preferences ?? { excludeRepos: [], excludeIssues: [] };
  const { top, runnersUp } = rank(toCandidates([...byId.values()], registry), profile, preferences, now);

  return {
    profile,
    snapshot: {
      id: await snapshotId(logins, recordedAt),
      recordedAt,
      ageSeconds: Math.max(0, Math.floor((now.getTime() - Date.parse(recordedAt)) / 1000)),
    },
    top,
    runnersUp,
    fetches,
    warnings,
  };
}
