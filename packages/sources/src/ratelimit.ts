import type { Cache } from "./types.js";

export const RATE_LIMIT_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

export interface RateLimitResult {
  allowed: boolean;
  /** 0 when allowed; otherwise seconds until the current hour window ends (Retry-After). */
  retryAfterSeconds: number;
}

/**
 * Per-IP fixed-window counter (NFR-4): key `rl:{ip}:{hour}`, 30 shortlists per hour.
 * Read-then-write on KV is not atomic; concurrent bursts can overshoot slightly,
 * which is acceptable for an abuse guard.
 */
export async function checkRateLimit(
  cache: Cache,
  ip: string,
  now: Date,
  limit: number = RATE_LIMIT_PER_HOUR,
): Promise<RateLimitResult> {
  const t = now.getTime();
  const hour = Math.floor(t / HOUR_MS);
  const secondsLeft = Math.max(1, Math.ceil(((hour + 1) * HOUR_MS - t) / 1000));
  const key = `rl:${ip}:${hour}`;
  const count = (await cache.get<number>(key)) ?? 0;
  if (count >= limit) return { allowed: false, retryAfterSeconds: secondsLeft };
  await cache.put(key, count + 1, 3600);
  return { allowed: true, retryAfterSeconds: 0 };
}
