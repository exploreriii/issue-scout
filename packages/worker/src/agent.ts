import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { HANDLE_RE, ProfileNotFoundError, RATE_LIMIT_PER_HOUR, checkRateLimit, type ScoutInput } from "@issue-scout/sources";
import { interpretWithAi, parseCommand, type Command } from "./commands";
import type { Env } from "./env";
import { describeError, logFailure } from "./errors";
import { createDeps, runScout, type Deps } from "./flow";
import { MAX_PROFILE_TEXT_CHARS, MAX_USER_MESSAGE_CHARS } from "./limits";
import { ipKey } from "./routes/scout";
import {
  MAX_MESSAGES,
  SESSION_TTL_SECONDS,
  initialState,
  toShortlist,
  type IssueScoutState,
  type ShortlistItem,
} from "./state";
import {
  WATCH_CALLBACK,
  checkWatchedIssue,
  excludeRepo,
  explainIssue,
  refine,
  repoContext,
  watch,
  whyNot,
  type ToolCall,
  type ToolResult,
  type WatchPayload,
} from "./tools";

export type { IssueScoutState } from "./state";

const HELP =
  'Try: "only Rust", "exclude org/repo", "why not <issue url>", "context org/repo", "watch 2 for 7 days", "explain 3".';

type Action = ToolCall | { tool: "exclude"; repo: string };

function commandToAction(c: Command): Action {
  switch (c.cmd) {
    case "only":
      return { tool: "refine", languages: c.languages };
    case "exclude":
      return { tool: "exclude", repo: c.repo };
    case "whyNot":
      return { tool: "whyNot", url: c.url };
    case "context":
      return { tool: "repoContext", org: c.org, repo: c.repo };
    case "watch":
      return { tool: "watch", issue: c.n, days: c.days };
    case "explain":
      return { tool: "explain", issue: c.n };
  }
}

function toInput(text: string): ScoutInput {
  const t = text.trim();
  const bare = t.startsWith("@") ? t.slice(1) : t;
  return HANDLE_RE.test(bare) ? { handle: bare } : { profileText: t };
}

export class IssueScoutAgent extends Agent<Env, IssueScoutState> {
  initialState: IssueScoutState = initialState();

  /** Serialises messages so a second one never reads state a running one is about to replace. */
  private serial: Promise<unknown> = Promise.resolve();

  /** Seam for tests; production talks to GitHub through KV-cached sources. */
  buildDeps(): Deps {
    return createDeps(this.env);
  }

  async onStart(): Promise<void> {
    await this.ensureExpiry();
  }

  async onRequest(_request: Request): Promise<Response> {
    return Response.json({ ok: true, agent: "IssueScoutAgent" });
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    // Only a hash is kept, only on the socket, so the per-IP limit also covers chat (NFR-4, NFR-6).
    connection.setState({ ip: await ipKey(ctx.request.headers.get("cf-connecting-ip")) });
  }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message !== "string") return;
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    const m = data as { type?: unknown; text?: unknown };
    if (m.type !== "user" || typeof m.text !== "string") return;
    const text = m.text.trim();
    if (!text) return;
    const ip = (connection.state as { ip?: string } | null)?.ip ?? "unknown";

    const run = this.serial.then(async () => {
      let reply: { text: string; shortlist?: ShortlistItem[] };
      try {
        await this.ensureExpiry();
        reply = await this.handleUser(text.slice(0, MAX_USER_MESSAGE_CHARS), ip);
      } catch (e) {
        logFailure("agent message", e);
        reply = { text: describeError(e).message };
      }
      connection.send(JSON.stringify({ type: "assistant", ...reply }));
    });
    this.serial = run.catch(() => undefined);
    await run;
  }

  // -- session lifecycle ----------------------------------------------------

  /** One cleanup at 7 days (NFR-6). schedule(..., {idempotent}) makes this safe to call on every wake. */
  private async ensureExpiry(): Promise<void> {
    await this.schedule(SESSION_TTL_SECONDS, "expireSession", undefined, { idempotent: true });
  }

  /** Scheduled callback: cancel watches and wipe the session (FR-12, NFR-6). */
  async expireSession(): Promise<void> {
    for (const s of await this.listSchedules()) {
      if (s.callback !== "expireSession") await this.cancelSchedule(s.id);
    }
    this.setState(initialState());
  }

  /** Scheduled callback for FR-12: re-check one issue and post the result into the session. */
  async checkWatch(payload: WatchPayload): Promise<void> {
    const w = this.state.watches.find((x) => x.issueId === payload.issueId && x.status === "pending");
    if (!w) return;
    const deps = this.buildDeps();
    const text = await checkWatchedIssue(deps, w);
    const messages = [...this.state.messages, { at: deps.now().toISOString(), text }].slice(-MAX_MESSAGES);
    this.setState({
      ...this.state,
      watches: this.state.watches.map((x) => (x === w ? { ...x, status: "done" as const } : x)),
      messages,
    });
    this.broadcast(JSON.stringify({ type: "assistant", text }));
  }

  // -- message handling -----------------------------------------------------

  private async handleUser(text: string, ip: string): Promise<{ text: string; shortlist?: ShortlistItem[] }> {
    const deps = this.buildDeps();
    if (!this.state.profile) return this.firstMessage(deps, text, ip);

    const cmd = parseCommand(text);
    let action: Action | null = cmd ? commandToAction(cmd) : null;
    if (!action) {
      const viaModel = await interpretWithAi(deps.ai, deps.model, text);
      action = viaModel;
    }
    if (!action) return { text: `I did not understand that. ${HELP}` };

    const result = await this.runAction(deps, action);
    if (result.state) this.setState({ ...this.state, ...result.state });
    return result.shortlist && result.shortlist.length > 0
      ? { text: result.text, shortlist: result.shortlist }
      : { text: result.text };
  }

  private runAction(deps: Deps, a: Action): Promise<ToolResult> {
    const s = this.state;
    switch (a.tool) {
      case "refine": {
        const { tool: _t, ...patch } = a;
        return refine(deps, s, patch);
      }
      case "exclude":
        return excludeRepo(deps, s, a.repo);
      case "whyNot":
        return whyNot(deps, s, a.url);
      case "repoContext":
        return repoContext(deps, a.org, a.repo);
      case "explain":
        return explainIssue(deps, s, a.issue);
      case "watch":
        return watch(deps, s, a.issue, a.days, async (delay, payload) => {
          const sched = await this.schedule(delay, WATCH_CALLBACK, payload);
          return { id: sched.id };
        });
    }
  }

  private async firstMessage(deps: Deps, text: string, ip: string) {
    const input = toInput(text);
    if ("profileText" in input && input.profileText.length > MAX_PROFILE_TEXT_CHARS) {
      return { text: `Please keep the description under ${MAX_PROFILE_TEXT_CHARS} characters, or send just your GitHub handle.` };
    }
    const rl = await checkRateLimit(deps.cache, ip, deps.now());
    if (!rl.allowed) {
      const mins = Math.ceil(rl.retryAfterSeconds / 60);
      return { text: `That is ${RATE_LIMIT_PER_HOUR} shortlists this hour. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` };
    }

    try {
      const out = await runScout(input, deps);
      this.setState({
        ...this.state,
        profile: out.profile,
        input,
        snapshotId: out.snapshot.id,
        candidatesRef: out.candidatesRef,
        ranked: { top: out.top, runnersUp: out.runnersUp },
        explanations: out.explanations,
        createdAt: deps.now().toISOString(),
      });
      const who = out.profile.handle ? `for ${out.profile.handle}` : "for that profile";
      if (out.top.length === 0) {
        return { text: `No open good-first-issue matches ${who} right now. ${HELP}` };
      }
      const lines = out.top.map((r, i) => `${i + 1}. ${r.issue.org}/${r.issue.repo}#${r.issue.number} ${r.issue.title}`);
      const note = out.explanationsStatus === "unavailable" ? "\n(Explanations are unavailable right now; the reasons on each card still apply.)" : "";
      return {
        text: `Here are your top ${out.top.length} matches ${who}:\n${lines.join("\n")}${note}\n${HELP}`,
        shortlist: toShortlist(out.top, out.explanations),
      };
    } catch (e) {
      logFailure("agent scout", e);
      if (e instanceof ProfileNotFoundError && "handle" in input) {
        return { text: "I could not find that GitHub user. Send another handle, or describe your languages and experience in a sentence." };
      }
      return { text: describeError(e, deps.now()).message };
    }
  }
}
