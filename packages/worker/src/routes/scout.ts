import { RATE_LIMIT_PER_HOUR, checkRateLimit, isValidHandle, type ScoutInput } from "@issue-scout/sources";
import { MAX_PROFILE_TEXT_CHARS } from "../limits";
import { describeError, logFailure } from "../errors";
import type { Env } from "../env";
import { createDeps, runScout, type Deps } from "../flow";

const MAX_BODY_BYTES = 4096;

export type ParsedBody = { ok: true; input: ScoutInput } | { ok: false; message: string };

/** FR-1: a handle matching ^[A-Za-z0-9-]{1,39}$ or free text of at most 500 characters. */
export function parseScoutBody(text: string): ParsedBody {
  if (text.length > MAX_BODY_BYTES) return { ok: false, message: "Request body is too large." };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, message: "Body must be JSON: {\"handle\": \"...\"} or {\"profileText\": \"...\"}." };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const hasHandle = b.handle !== undefined;
  const hasText = b.profileText !== undefined;
  if (hasHandle === hasText) return { ok: false, message: "Send exactly one of \"handle\" or \"profileText\"." };
  if (hasHandle) {
    if (!isValidHandle(b.handle)) {
      return { ok: false, message: "handle must be 1 to 39 letters, digits or hyphens." };
    }
    return { ok: true, input: { handle: b.handle } };
  }
  if (typeof b.profileText !== "string" || b.profileText.trim().length === 0) {
    return { ok: false, message: "profileText must be a non-empty string." };
  }
  if (b.profileText.trim().length > MAX_PROFILE_TEXT_CHARS) {
    return { ok: false, message: `profileText must be at most ${MAX_PROFILE_TEXT_CHARS} characters.` };
  }
  return { ok: true, input: { profileText: b.profileText } };
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The rate-limit key is a truncated hash of the IP, so no address is stored in KV (NFR-6). */
export async function ipKey(ip: string | null | undefined): Promise<string> {
  return (await sha256Hex(`ip:${ip ?? "unknown"}`)).slice(0, 24);
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

/** POST /scout (ARCHITECTURE s4). `deps` is an injection point for tests; production builds GitHub sources. */
export async function handleScout(
  request: Request,
  env: Env,
  deps: Deps = createDeps(env),
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405, { Allow: "POST" });

  const parsed = parseScoutBody(await request.text());
  if (!parsed.ok) return json({ error: parsed.message }, 400);

  const rl = await checkRateLimit(deps.cache, await ipKey(request.headers.get("cf-connecting-ip")), deps.now());
  if (!rl.allowed) {
    return json(
      { error: `Rate limit of ${RATE_LIMIT_PER_HOUR} shortlists per hour reached. Try again later.` },
      429,
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  try {
    const out = await runScout(parsed.input, deps);
    return json(
      {
        profile: out.profile,
        shortlist: out.shortlist,
        runnersUp: out.runnersUp,
        snapshot: out.snapshot,
        explanations: out.explanationsStatus,
        ...(out.warnings.length > 0 ? { warnings: out.warnings } : {}),
      },
      200,
    );
  } catch (e) {
    logFailure("scout", e);
    const d = describeError(e, deps.now());
    return json(
      { error: d.message },
      d.status,
      d.retryAfterSeconds ? { "Retry-After": String(d.retryAfterSeconds) } : {},
    );
  }
}
