import { KvCache, snapshotKey } from "@issue-scout/sources";
import type { Env } from "../env";
import { RATE_LIMIT_KEY } from "../flow";
import { getRegistry } from "../registry";

/** FR-14. Snapshot ages come from the cache keys; nothing here calls GitHub or the model. */
export async function handleHealth(env: Env, now: Date = new Date()): Promise<Response> {
  const cache = new KvCache(env.CACHE);
  const snapshotAges: Record<string, number | null> = {};
  for (const org of getRegistry()) {
    try {
      const snap = await cache.get<{ recordedAt?: string }>(await snapshotKey(org));
      const at = snap?.recordedAt ? Date.parse(snap.recordedAt) : NaN;
      snapshotAges[org.login] = Number.isFinite(at) ? Math.max(0, Math.floor((now.getTime() - at) / 1000)) : null;
    } catch {
      snapshotAges[org.login] = null;
    }
  }
  let remaining: number | null = null;
  try {
    const rl = await cache.get<{ remaining?: number | null }>(RATE_LIMIT_KEY);
    remaining = typeof rl?.remaining === "number" ? rl.remaining : null;
  } catch {
    /* leave null */
  }
  return Response.json({
    ok: true,
    snapshotAges,
    githubRateLimitRemaining: remaining,
    aiGateway: { configured: Boolean(env.AI_GATEWAY_ID) },
  });
}
