import { routeAgentRequest } from "agents";
import type { Env } from "./env";
import { handleHealth } from "./routes/health";
import { getRegistry } from "./registry";
import { warmSnapshots, type WarmResult } from "@issue-scout/sources";
import { createDeps, recordRateLimit, type Deps } from "./flow";
import { handleOrgs, handleScout } from "./routes/scout";

export { IssueScoutAgent } from "./agent";

/**
 * The Agents SDK derives the URL segment from the binding name (IssueScoutAgent -> issue-scout-agent),
 * but the UI contract (ARCHITECTURE s4) is /agents/issue-scout/:session. Alias it here so the
 * binding in wrangler.jsonc does not have to change.
 */
function withAgentAlias(request: Request, url: URL): Request {
  const from = "/agents/issue-scout/";
  if (!url.pathname.startsWith(from)) return request;
  const aliased = new URL(url);
  aliased.pathname = `/agents/issue-scout-agent/${url.pathname.slice(from.length)}`;
  return new Request(aliased, request);
}

/** Cron Trigger body: refresh every enabled org's snapshot so user requests find a warm cache. */
export async function warmAll(deps: Deps): Promise<WarmResult> {
  const result = await warmSnapshots(deps.registry, { issues: deps.issues, cache: deps.cache, now: deps.now() });
  await recordRateLimit(deps);
  if (result.failed.length > 0) console.warn(`warm-up failed for: ${result.failed.join(", ")}`);
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") return handleHealth(env);
    if (url.pathname === "/orgs") return handleOrgs(request, { registry: getRegistry() });
    if (url.pathname === "/scout") return handleScout(request, env);

    if (url.pathname.startsWith("/agents/")) {
      return (
        (await routeAgentRequest(withAgentAlias(request, url), env)) ??
        new Response("Not found", { status: 404 })
      );
    }

    return env.ASSETS.fetch(request);
  },

  /** `deps` is an injection point for tests; production builds GitHub sources. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext, deps?: Deps): Promise<void> {
    ctx.waitUntil(warmAll(deps ?? createDeps(env)));
  },
} satisfies ExportedHandler<Env>;
