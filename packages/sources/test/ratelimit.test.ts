import { describe, expect, it } from "vitest";
import { MemoryCache, checkRateLimit } from "../src/index.js";

describe("per-IP rate limit (NFR-4)", () => {
  const at = (iso: string) => new Date(iso);

  it("allows 30 per hour then blocks with Retry-After to the end of the hour", async () => {
    const cache = new MemoryCache();
    const now = at("2026-10-29T12:10:00Z");
    for (let i = 0; i < 30; i++) {
      expect(await checkRateLimit(cache, "1.2.3.4", now)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }
    expect(await checkRateLimit(cache, "1.2.3.4", now)).toEqual({ allowed: false, retryAfterSeconds: 3000 });
  });

  it("counts per IP and resets in the next hour", async () => {
    const cache = new MemoryCache();
    const now = at("2026-10-29T12:59:00Z");
    for (let i = 0; i < 30; i++) await checkRateLimit(cache, "a", now);
    expect((await checkRateLimit(cache, "a", now)).allowed).toBe(false);
    expect((await checkRateLimit(cache, "b", now)).allowed).toBe(true);
    expect((await checkRateLimit(cache, "a", at("2026-10-29T13:00:00Z"))).allowed).toBe(true);
  });

  it("uses the rl:{ip}:{hour} key", async () => {
    const cache = new MemoryCache();
    await checkRateLimit(cache, "9.9.9.9", at("2026-10-29T12:00:00Z"));
    expect(cache.keys()).toEqual([`rl:9.9.9.9:${Math.floor(Date.parse("2026-10-29T12:00:00Z") / 3_600_000)}`]);
  });
});
