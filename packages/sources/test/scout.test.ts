import { describe, expect, it } from "vitest";
import { loadRegistry } from "@issue-scout/core";
import {
  FixtureIssueSource,
  FixtureProfileSource,
  InvalidHandleError,
  InvalidProfileTextError,
  MemoryCache,
  scout,
  snapshotId,
  warmSnapshots,
  type IssueSource,
  type ScoutDeps,
} from "../src/index.js";
import orgsJson from "../../../orgs.json";
import snapshot from "../../core/test/fixtures/issues.snapshot.json";
import profiles from "../../core/test/fixtures/profiles.json";

const registry = loadRegistry(orgsJson);
const T0 = Date.parse("2026-10-29T12:00:00Z");

function setup() {
  let t = T0;
  const cache = new MemoryCache(() => t);
  const deps = (): ScoutDeps => ({
    issues: new FixtureIssueSource(snapshot),
    profiles: new FixtureProfileSource(profiles),
    cache,
    registry,
    now: new Date(t),
  });
  return { cache, deps, advance: (s: number) => (t += s * 1000) };
}

describe("scout()", () => {
  it("returns a shortlist, a snapshot id and the profile on a cold cache", async () => {
    const { deps } = setup();
    const r = await scout({ handle: "exploreriii" }, deps());
    expect(r.fetches).toEqual({ issues: 3, profiles: 1 });
    expect(r.profile.handle).toBe("exploreriii");
    expect(r.top.length).toBeGreaterThan(0);
    expect(r.top.length).toBeLessThanOrEqual(5);
    expect(r.runnersUp.length).toBeLessThanOrEqual(5);
    expect(r.snapshot.id).toMatch(/^[0-9a-f]{64}$/);
    expect(r.snapshot.recordedAt).toBe("2026-10-29T12:00:00.000Z");
    expect(r.snapshot.ageSeconds).toBe(0);
    expect(r.snapshot.id).toBe(await snapshotId(registry.map((o) => o.login), r.snapshot.recordedAt));
  });

  it("makes zero fetches on a warm cache, with the same snapshot id (FR-9)", async () => {
    const { deps, advance } = setup();
    const first = await scout({ handle: "exploreriii" }, deps());
    advance(600);
    const second = await scout({ handle: "exploreriii" }, { ...deps(), preferences: { excludeRepos: [], excludeIssues: [], wantsTests: true } });
    expect(second.fetches).toEqual({ issues: 0, profiles: 0 });
    expect(second.snapshot.id).toBe(first.snapshot.id);
    expect(second.snapshot.ageSeconds).toBe(600);
    expect(second.top.length).toBeGreaterThan(0);
  });

  it("text profiles never fetch a profile, and issues stay cached", async () => {
    const { deps } = setup();
    await scout({ profileText: "I know Python, 2 hours a week" }, deps());
    const r = await scout({ profileText: "Rust and TypeScript, one weekend" }, deps());
    expect(r.profile.source).toBe("text");
    expect(r.fetches).toEqual({ issues: 0, profiles: 0 });
  });

  it("refetches issues once the 1 h snapshot TTL has passed, but not the 24 h profile", async () => {
    const { deps, advance } = setup();
    await scout({ handle: "exploreriii" }, deps());
    advance(3599);
    expect((await scout({ handle: "exploreriii" }, deps())).fetches).toEqual({ issues: 0, profiles: 0 });
    advance(2);
    const r = await scout({ handle: "exploreriii" }, deps());
    expect(r.fetches).toEqual({ issues: 3, profiles: 0 });
    expect(r.snapshot.recordedAt).toBe(new Date(T0 + 3601_000).toISOString());
  });

  it("refetches the profile after 24 h", async () => {
    const { deps, advance } = setup();
    await scout({ handle: "exploreriii" }, deps());
    advance(86_399);
    expect((await scout({ handle: "exploreriii" }, deps())).fetches.profiles).toBe(0);
    advance(2);
    expect((await scout({ handle: "exploreriii" }, deps())).fetches.profiles).toBe(1);
  });

  it("enforces snapshot age from recordedAt even if the cache keeps the entry", async () => {
    const { deps, advance } = setup();
    const d = deps();
    const forever = { ...d.cache, get: d.cache.get.bind(d.cache), put: (k: string, v: unknown) => d.cache.put(k, v, 10 ** 9) } as ScoutDeps["cache"];
    await scout({ profileText: "Python" }, { ...d, cache: forever });
    advance(3601);
    const r = await scout({ profileText: "Python" }, { ...deps(), cache: forever });
    expect(r.fetches.issues).toBe(3);
  });

  it("validates input", async () => {
    const { deps } = setup();
    await expect(scout({ handle: "bad handle!" }, deps())).rejects.toThrow(InvalidHandleError);
    await expect(scout({ profileText: "   " }, deps())).rejects.toThrow(InvalidProfileTextError);
    await expect(scout({ profileText: "x".repeat(501) }, deps())).rejects.toThrow(InvalidProfileTextError);
  });

  it("skips disabled orgs and degrades when one org fails", async () => {
    const { deps } = setup();
    const flaky: IssueSource = {
      async fetchOpenIssues(org) {
        if (org.login === "hiero-hackers") throw new Error("boom");
        return new FixtureIssueSource(snapshot).fetchOpenIssues(org);
      },
    };
    const r = await scout({ profileText: "Python" }, { ...deps(), issues: flaky });
    expect(r.warnings).toEqual(["hiero-hackers: boom"]);
    expect(r.top.length).toBeGreaterThan(0);
    const off = await scout({ profileText: "Python" }, { ...deps(), registry: registry.map((o) => ({ ...o, enabled: o.login === "hiero-ledger" })), cache: new MemoryCache() });
    expect(off.fetches.issues).toBe(1);
  });
});

describe("warmSnapshots()", () => {
  it("refreshes every enabled org regardless of age, so a following scout() fetches nothing", async () => {
    const { deps, advance, cache } = setup();
    await scout({ profileText: "Python" }, deps());
    advance(3000); // still inside the TTL, but the cron refreshes anyway
    let calls = 0;
    const counting: IssueSource = { fetchOpenIssues: (o) => (calls++, new FixtureIssueSource(snapshot).fetchOpenIssues(o)) };
    const r = await warmSnapshots(registry, { issues: counting, cache, now: new Date(T0 + 3_000_000) });
    expect(calls).toBe(3);
    expect(r.failed).toEqual([]);
    expect(r.refreshed).toHaveLength(3);
    advance(3000); // 6000 s after the first fill: expired without the warm-up
    const next = await scout({ profileText: "Python" }, deps());
    expect(next.fetches.issues).toBe(0);
  });

  it("keeps going when one org fails", async () => {
    const { cache } = setup();
    const flaky: IssueSource = {
      async fetchOpenIssues(org) {
        if (org.login === "hiero-hackers") throw new Error("boom");
        return [];
      },
    };
    const r = await warmSnapshots(registry, { issues: flaky, cache, now: new Date(T0) });
    expect(r.failed).toEqual(["hiero-hackers"]);
    expect(r.refreshed).toEqual(["hiero-ledger", "LFDT-CLPR"]);
  });
});
