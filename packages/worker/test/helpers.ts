import { env } from "cloudflare:test";
import { loadRegistry } from "@issue-scout/core";
import { GithubHttp, KvCache, fixtureSources, type RateLimitInfo } from "@issue-scout/sources";
import type { Deps } from "../src/flow";
import orgsJson from "../../../orgs.json";
import snapshot from "../../core/test/fixtures/issues.snapshot.json";
import profiles from "../../core/test/fixtures/profiles.json";

export { snapshot, profiles };
export const NOW = new Date("2026-10-29T08:00:00Z");

export async function clearKv(): Promise<void> {
  const list = await env.CACHE.list();
  await Promise.all(list.keys.map((k) => env.CACHE.delete(k.name)));
}

export interface AiStub {
  run(model: string, input: any): Promise<unknown>;
  calls: { kind: "explain" | "contributing" | "interpret" | "other"; input: any }[];
  /** What the interpret call answers; default is non-JSON so the parser rejects it. */
  interpretAnswer: string;
  /** Make the explainer fail (status "unavailable"). */
  failExplain: boolean;
}

export function makeAi(): AiStub {
  const stub: AiStub = {
    calls: [],
    interpretAnswer: "I am not sure.",
    failExplain: false,
    async run(_model, input) {
      const system: string = input.messages?.[0]?.content ?? "";
      const user: string = input.messages?.at(-1)?.content ?? "";
      if (system.includes("EXPLAINS")) {
        stub.calls.push({ kind: "explain", input });
        if (stub.failExplain) throw new Error("model down");
        const ids = [...user.matchAll(/"issueId": "([^"]+)"/g)].map((m) => m[1]);
        return {
          response: JSON.stringify(
            ids.map((issueId) => ({ issueId, fit: "Your recent work matches the language and size of this issue, so it should feel familiar.", firstPrLooksLike: "A small, focused patch that changes one file and adds or adjusts a single test.", effortHours: 2, firstStep: "Read the issue and the contributing guide, then comment that you would like to take it." })),
          ),
        };
      }
      if (system.includes("CONTRIBUTING")) {
        stub.calls.push({ kind: "contributing", input });
        return { response: "Fork, branch, sign your commits, open a PR." };
      }
      if (system.includes("You map a user's message")) {
        stub.calls.push({ kind: "interpret", input });
        return { response: stub.interpretAnswer };
      }
      stub.calls.push({ kind: "other", input });
      return { response: "" };
    },
  };
  return stub;
}

export interface FakeGithub {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  calls: { url: string; method: string }[];
  /** Mutable REST view of issues, keyed "org/repo#n". */
  issues: Map<string, Record<string, unknown>>;
}

/** Hermetic stand-in for api.github.com REST (GET only). */
export function makeFakeGithub(): FakeGithub {
  const calls: FakeGithub["calls"] = [];
  const issues = new Map<string, Record<string, unknown>>();
  const headers = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4321", "x-ratelimit-reset": "1893456000" };
  const j = (body: unknown, status = 200) => Response.json(body, { status, headers });
  return {
    calls,
    issues,
    async fetch(url, init) {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const u = new URL(url);
      const p = u.pathname;
      let m: RegExpExecArray | null;
      if ((m = /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(p))) {
        return m[3] === "CONTRIBUTING.md"
          ? new Response("# Contributing\nPlease sign your commits and open a PR.", { status: 200, headers })
          : j({ message: "Not Found" }, 404);
      }
      if ((m = /^\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/.exec(p))) {
        return j({ workflow_runs: [{ conclusion: "success", status: "completed", head_branch: u.searchParams.get("branch") }] });
      }
      if ((m = /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(p))) {
        const issue = issues.get(`${m[1]}/${m[2]}#${m[3]}`);
        return issue ? j(issue) : j({ message: "Not Found" }, 404);
      }
      if ((m = /^\/repos\/([^/]+)\/([^/]+)$/.exec(p))) return j({ default_branch: "main" });
      if (p === "/search/issues") return j({ items: [{ closed_at: "2026-10-25T00:00:00Z", pull_request: { merged_at: "2026-10-24T10:00:00Z" } }] });
      return j({ message: "Not Found" }, 404);
    },
  };
}

export interface TestDeps {
  deps: Deps;
  ai: AiStub;
  gh: FakeGithub;
  /** Counts of IssueSource / ProfileSource calls: zero on a warm cache. */
  fetches: { issues: number; profiles: number };
  rateLimit: RateLimitInfo;
}

export function makeDeps(): TestDeps {
  const ai = makeAi();
  const gh = makeFakeGithub();
  const fetches = { issues: 0, profiles: 0 };
  const src = fixtureSources(snapshot, profiles);
  const rateLimit: RateLimitInfo = { limit: 5000, remaining: 4321, resetAt: 1893456000 };
  const deps: Deps = {
    cache: new KvCache(env.CACHE),
    issues: { fetchOpenIssues: (o) => (fetches.issues++, src.issues.fetchOpenIssues(o)) },
    profiles: { fetchProfile: (h) => (fetches.profiles++, src.profiles.fetchProfile(h)) },
    github: new GithubHttp({ fetch: gh.fetch }),
    registry: loadRegistry(orgsJson),
    ai,
    model: "test-model",
    now: () => NOW,
    rateLimits: () => [rateLimit],
  };
  return { deps, ai, gh, fetches, rateLimit };
}
