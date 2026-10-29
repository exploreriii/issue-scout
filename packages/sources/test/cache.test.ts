import { describe, expect, it } from "vitest";
import { KvCache, MemoryCache } from "../src/index.js";

describe("MemoryCache", () => {
  it("expires entries by ttl", async () => {
    let t = 1_000_000;
    const c = new MemoryCache(() => t);
    await c.put("k", { a: 1 }, 10);
    expect(await c.get("k")).toEqual({ a: 1 });
    t += 9_999;
    expect(await c.get("k")).toEqual({ a: 1 });
    t += 1;
    expect(await c.get("k")).toBeNull();
    expect(await c.get("missing")).toBeNull();
  });
});

describe("KvCache", () => {
  const fakeKv = () => {
    const puts: { key: string; value: string; opts: any }[] = [];
    const kv = {
      puts,
      async get(key: string) {
        const p = [...puts].reverse().find((x) => x.key === key);
        return p ? JSON.parse(p.value) : null;
      },
      async put(key: string, value: string, opts: any) {
        puts.push({ key, value, opts });
      },
    };
    return kv;
  };

  it("stores {value, storedAt} with expirationTtl and reads the value back", async () => {
    const kv = fakeKv();
    const c = new KvCache(kv as unknown as KVNamespace, () => 1234);
    await c.put("profile:x", { hi: true }, 86_400);
    expect(JSON.parse(kv.puts[0]!.value)).toEqual({ value: { hi: true }, storedAt: 1234 });
    expect(kv.puts[0]!.opts).toEqual({ expirationTtl: 86_400 });
    expect(await c.get("profile:x")).toEqual({ hi: true });
    expect(await c.get("nope")).toBeNull();
  });

  it("clamps ttl to KV's 60 second minimum", async () => {
    const kv = fakeKv();
    await new KvCache(kv as unknown as KVNamespace).put("k", 1, 5);
    expect(kv.puts[0]!.opts).toEqual({ expirationTtl: 60 });
  });
});
