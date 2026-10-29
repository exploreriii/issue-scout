import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { handleScout } from "../src/routes/scout";
import { clearKv, makeDeps } from "./helpers";

beforeEach(clearKv);

describe("GET /health", () => {
  it("reports null snapshot ages, no rate limit and no gateway on a cold cache", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      snapshotAges: { "hiero-ledger": null, "hiero-hackers": null, "LFDT-CLPR": null },
      githubRateLimitRemaining: null,
      aiGateway: { configured: false },
    });
  });

  it("reports per-org snapshot age and the last seen rate limit after a scout", async () => {
    const t = makeDeps();
    const res = await handleScout(
      new Request("https://example.com/scout", { method: "POST", body: JSON.stringify({ handle: "exploreriii" }) }),
      env,
      t.deps,
    );
    expect(res.status).toBe(200);
    const health = (await (await SELF.fetch("https://example.com/health")).json()) as any;
    for (const org of ["hiero-ledger", "hiero-hackers", "LFDT-CLPR"]) expect(typeof health.snapshotAges[org]).toBe("number");
    expect(health.githubRateLimitRemaining).toBe(4321);
  });
});
