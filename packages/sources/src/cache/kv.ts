import type { Cache } from "../types.js";

/** Cloudflare KV rejects expirationTtl below 60 seconds. */
export const KV_MIN_TTL_SECONDS = 60;

interface Stored<T> {
  value: T;
  storedAt: number;
}

/**
 * KVNamespace-backed Cache. Callers build keys per ARCHITECTURE s7
 * (`snap:`, `profile:`, `contrib:`, `rl:`). Each entry is stored as
 * `{value, storedAt}` (epoch ms) and expires through KV's expirationTtl.
 */
export class KvCache implements Cache {
  constructor(
    private readonly kv: KVNamespace,
    private readonly clock: () => number = Date.now,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const stored = await this.kv.get<Stored<T>>(key, "json");
    if (stored === null || typeof stored !== "object" || !("value" in stored)) return null;
    return stored.value;
  }

  async put<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const body: Stored<T> = { value, storedAt: this.clock() };
    await this.kv.put(key, JSON.stringify(body), {
      expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlSeconds)),
    });
  }
}
