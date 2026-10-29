import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import type { Ranked } from "@issue-scout/core";
import { HANDLE_RE, ProfileNotFoundError, RATE_LIMIT_PER_HOUR, checkRateLimit, type ScoutInput } from "@issue-scout/sources";
import { interpretWithAi, parseCommand, type Command } from "./commands";
import type { Env } from "./env";
import { describeError, logFailure } from "./errors";
import { createDeps, runScout, type Deps, type OrgCounts } from "./flow";
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
  'Try: "only Rust", "only org hiero-hackers", "all orgs", "exclude org/repo", "why not <issue url>", "context org/repo", "watch 2 for 7 days", "explain 3".';

type Reply = {
  text: string;
  shortlist?: ShortlistItem[];
  runnersUp?: Ranked[];
  orgCounts?: OrgCounts;
  orgs?: string[];
};

type Action = ToolCall | { tool: "exclude"; repo: string };

function commandToAction(c: Command): Action {
  switch (c.cmd) {
    case "only":
      return { tool: "refine", languages: c.languages };
    case "orgs":
      return { tool: "refine", orgs: c.orgs };
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

/** A seed is a ScoutInput the UI already used; it gets the same validation as the first chat message. */
function parseSeed(raw: unknown): ScoutInput | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as { handle?: unknown; profileText?: unknown };
  if (typeof r.handle === "string" && HANDLE_RE.test(r.handle)) return { handle: r.handle };
  if (typeof r.profileText === "string" && r.profileText.trim() && r.profileText.length <= MAX_PROFILE_TEXT_CHARS) {
    return { profileText: r.profileText };
  }
  return null;
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
    const m = data as { type?: unknown; text?: unknown; seed?: unknown };
    if (m.type !== "user" || typeof m.text !== "string") return;
    const text = m.text.trim();
    if (!text) return;
    const ip = (connection.state as { ip?: string } | null)?.ip ?? "unknown";

    const run = this.serial.then(async () => {
      let reply: Reply;
      try {
        await this.ensureExpiry();
        // The UI fetches its first shortlist over POST /scout, so it passes the same input once to seed this session.
        const seed = parseSeed(m.seed);
        if (seed && !this.state.profile) await this.seedSession(this.buildDeps(), seed);
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

  private async handleUser(text: string, ip: string): Promise<Reply> {
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
    const reply: Reply = { text: result.text };
    // A refine always carries its list, even an empty one, so the UI never keeps showing a stale shortlist.
    if (result.shortlist && (result.shortlist.length > 0 || result.orgs !== undefined)) reply.shortlist = result.shortlist;
    if (result.state?.ranked) reply.runnersUp = result.state.ranked.runnersUp;
    if (result.orgCounts) reply.orgCounts = result.orgCounts;
    if (result.orgs) reply.orgs = result.orgs;
    return reply;
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

  /** Build the profile and shortlist for `input` and store them as this session's state. */
  private async seedSession(deps: Deps, input: ScoutInput) {
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
    return out;
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
      const out = await this.seedSession(deps, input);
      const who = out.profile.handle ? `for ${out.profile.handle}` : "for that profile";
      if (out.top.length === 0) {
        return { text: `No open good-first-issue matches ${who} right now. ${HELP}` };
      }
      const lines = out.top.map((r, i) => `${i + 1}. ${r.issue.org}/${r.issue.repo}#${r.issue.number} ${r.issue.title}`);
      const note = out.explanationsStatus === "unavailable" ? "\n(Explanations are unavailable right now; the reasons on each card still apply.)" : "";
      return {
        text: `Here are your top ${out.top.length} matches ${who}:\n${lines.join("\n")}${note}\n${HELP}`,
        shortlist: toShortlist(out.top, out.explanations),
        orgCounts: out.orgCounts,
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
