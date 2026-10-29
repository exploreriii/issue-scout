import type { Cache } from "../types.js";

interface Entry {
  json: string;
  expiresAt: number;
}

/** In-memory Cache for tests. Values round-trip through JSON, like KV. */
export class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();

  /** `clock` returns epoch milliseconds; inject a fake to test TTL expiry. */
  constructor(private readonly clock: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (this.clock() >= e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(e.json) as T;
  }

  async put<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { json: JSON.stringify(value), expiresAt: this.clock() + ttlSeconds * 1000 });
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}
