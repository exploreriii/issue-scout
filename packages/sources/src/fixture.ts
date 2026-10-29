import { ProfileSchema, RawIssueSchema, type OrgConfig, type Profile, type RawIssue } from "@issue-scout/core";
import { z } from "zod";
import { ProfileNotFoundError, type IssueSource, type ProfileSource } from "./types.js";

const SnapshotSchema = z.object({
  recordedAt: z.string(),
  orgs: z.array(z.string()),
  issues: z.array(z.record(z.string(), z.unknown())),
});

/** The recorder writes `null` for an unknown repoLastMergedPrAt; the schema wants it absent. */
function dropNulls(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
}

/**
 * IssueSource over a recorded snapshot (packages/core/test/fixtures/issues.snapshot.json).
 * The caller supplies the parsed JSON, so this module has no filesystem dependency.
 */
export class FixtureIssueSource implements IssueSource {
  readonly recordedAt: string;
  private readonly issues: RawIssue[];

  constructor(snapshotJson: unknown) {
    const snap = SnapshotSchema.parse(snapshotJson);
    this.recordedAt = snap.recordedAt;
    this.issues = snap.issues.map((i) => RawIssueSchema.parse(dropNulls(i)));
  }

  async fetchOpenIssues(org: OrgConfig): Promise<RawIssue[]> {
    const login = org.login.toLowerCase();
    return this.issues.filter((i) => i.org.toLowerCase() === login);
  }
}

/** ProfileSource over profiles.json (an array of Profile; github ones are keyed by handle). */
export class FixtureProfileSource implements ProfileSource {
  private readonly byHandle = new Map<string, Profile>();

  constructor(profilesJson: unknown) {
    for (const p of z.array(ProfileSchema).parse(profilesJson)) {
      if (p.handle) this.byHandle.set(p.handle.toLowerCase(), p);
    }
  }

  async fetchProfile(handle: string): Promise<Profile> {
    const p = this.byHandle.get(handle.toLowerCase());
    if (!p) throw new ProfileNotFoundError(handle);
    return p;
  }
}

export function fixtureSources(snapshotJson: unknown, profilesJson: unknown) {
  return { issues: new FixtureIssueSource(snapshotJson), profiles: new FixtureProfileSource(profilesJson) };
}
