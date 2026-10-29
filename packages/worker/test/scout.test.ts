import { env } from "cloudflare:test";
import { RATE_LIMIT_PER_HOUR } from "@issue-scout/sources";
import { beforeEach, describe, expect, it } from "vitest";
import { handleOrgs, handleScout } from "../src/routes/scout";
import { clearKv, makeDeps } from "./helpers";

beforeEach(clearKv);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://example.com/scout", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /scout", () => {
  it("returns five explained items for a handle, plus runners-up and a snapshot", async () => {
    const t = makeDeps();
    const res = await handleScout(post({ handle: "exploreriii" }), env, t.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.profile.handle).toBe("exploreriii");
    expect(body.shortlist).toHaveLength(5);
    for (const item of body.shortlist) {
      expect(item.issue.url).toMatch(/^https:\/\/github\.com\//);
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.explanation.issueId).toBe(item.issue.id);
    }
    expect(body.runnersUp.length).toBeGreaterThan(0);
    expect(body.snapshot.id).toMatch(/^[0-9a-f]{64}$/);
    expect(body.snapshot.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(body.explanations).toBe("ok");
    expect(t.gh.calls).toHaveLength(0);
  });

  it("accepts profile text and still returns the shortlist when the explainer is down", async () => {
    const t = makeDeps();
    t.ai.failExplain = true;
    const res = await handleScout(post({ profileText: "I write Rust and want a small first contribution" }), env, t.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.shortlist).toHaveLength(5);
    expect(body.shortlist[0].explanation).toBeUndefined();
    expect(body.explanations).toBe("unavailable");
  });

  it.each([
    ["bad handle", { handle: "not a handle!" }],
    ["too long handle", { handle: "a".repeat(40) }],
    ["empty body object", {}],
    ["both fields", { handle: "abc", profileText: "x" }],
    ["profile text over 500", { profileText: "x".repeat(501) }],
    ["blank profile text", { profileText: "   " }],
    ["non-string handle", { handle: 7 }],
    ["not JSON", "{oops"],
    ["array body", []],
  ])("answers 400 with a message for %s", async (_name, body) => {
    const t = makeDeps();
    const res = await handleScout(post(body), env, t.deps);
    expect(res.status).toBe(400);
    expect(typeof ((await res.json()) as any).error).toBe("string");
    expect(t.fetches).toEqual({ issues: 0, profiles: 0 });
  });

  it("answers 404 for an unknown GitHub user and 405 for GET", async () => {
    const t = makeDeps();
    expect((await handleScout(post({ handle: "nobody-here" }), env, t.deps)).status).toBe(404);
    const get = await handleScout(new Request("https://example.com/scout"), env, t.deps);
    expect(get.status).toBe(405);
  });

  it("answers 429 with Retry-After after the per-IP limit", async () => {
    const t = makeDeps();
    const ip = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
      const ok = await handleScout(post({ profileText: "typescript" }, ip), env, t.deps);
      expect(ok.status).toBe(200);
    }
    const limited = await handleScout(post({ profileText: "typescript" }, ip), env, t.deps);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    // another address is unaffected
    const other = await handleScout(post({ profileText: "typescript" }, { "cf-connecting-ip": "203.0.113.10" }), env, t.deps);
    expect(other.status).toBe(200);
  });

  it("does not store the IP in KV", async () => {
    const t = makeDeps();
    await handleScout(post({ profileText: "rust" }, { "cf-connecting-ip": "203.0.113.77" }), env, t.deps);
    const keys = (await env.CACHE.list()).keys.map((k) => k.name);
    expect(keys.some((k) => k.includes("203.0.113.77"))).toBe(false);
    expect(keys.some((k) => k.startsWith("rl:"))).toBe(true);
  });
});

describe("GET /orgs", () => {
  it("lists the enabled registry as login and displayName", async () => {
    const t = makeDeps();
    const res = handleOrgs(new Request("https://example.com/orgs"), t.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { login: "hiero-ledger", displayName: "Hiero Ledger" },
      { login: "hiero-hackers", displayName: "Hiero Hackers" },
      { login: "LFDT-CLPR", displayName: "LFDT CLPR" },
    ]);
    expect(handleOrgs(new Request("https://example.com/orgs", { method: "POST" }), t.deps).status).toBe(405);
  });
});

describe("POST /scout with orgs (FR-16)", () => {
  it("answers 400 for an unknown org and for a malformed orgs field, before any fetch", async () => {
    const t = makeDeps();
    const unknown = await handleScout(post({ handle: "exploreriii", orgs: ["hiero-ledger", "nope-org"] }), env, t.deps);
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as any).error).toContain("nope-org");
    const bad = await handleScout(post({ handle: "exploreriii", orgs: "hiero-ledger" }), env, t.deps);
    expect(bad.status).toBe(400);
    expect(t.fetches).toEqual({ issues: 0, profiles: 0 });
  });

  it("hard-filters candidates to the chosen orgs and echoes them", async () => {
    const t = makeDeps();
    const res = await handleScout(post({ handle: "exploreriii", orgs: ["HIERO-HACKERS"] }), env, t.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.orgs).toEqual(["hiero-hackers"]);
    expect(body.shortlist.length).toBeGreaterThan(0);
    for (const item of [...body.shortlist, ...body.runnersUp]) expect(item.issue.org).toBe("hiero-hackers");
  });

  it("returns orgCounts from before the org filter, with 0 for an org with no candidates", async () => {
    const t = makeDeps();
    const all = (await (await handleScout(post({ handle: "exploreriii" }), env, t.deps)).json()) as any;
    expect(all.orgs).toBeUndefined();
    expect(Object.keys(all.orgCounts).sort()).toEqual(["LFDT-CLPR", "hiero-hackers", "hiero-ledger"]);
    expect(all.orgCounts["LFDT-CLPR"]).toBe(0);
    expect(all.orgCounts["hiero-ledger"]).toBeGreaterThan(0);
    expect(all.orgCounts["hiero-hackers"]).toBeGreaterThan(0);

    const filtered = (await (await handleScout(post({ handle: "exploreriii", orgs: ["hiero-hackers"] }), env, makeDeps().deps)).json()) as any;
    expect(filtered.orgCounts).toEqual(all.orgCounts);
  });
});
