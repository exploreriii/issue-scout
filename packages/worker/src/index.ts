import { routeAgentRequest } from "agents";
import type { Env } from "./env";
import { handleHealth } from "./routes/health";
import { getRegistry } from "./registry";
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
} satisfies ExportedHandler<Env>;
