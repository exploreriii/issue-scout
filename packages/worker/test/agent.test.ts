import { SELF, env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { IssueScoutAgent } from "../src/agent";
import type { IssueScoutState } from "../src/state";
import { clearKv, makeDeps, snapshot, type TestDeps } from "./helpers";

beforeEach(clearKv);

type Reply = { type: string; text: string; shortlist?: any[]; orgCounts?: Record<string, number>; orgs?: string[] };

interface Session {
  t: TestDeps;
  send(text: string, seed?: unknown): Promise<Reply>;
  /** Next assistant frame that was not a reply to send() (e.g. a watch result). */
  next(): Promise<Reply>;
  state(): Promise<IssueScoutState>;
  inspect<T>(fn: (agent: IssueScoutAgent) => T | Promise<T>): Promise<T>;
}

let n = 0;
async function open(): Promise<Session> {
  const name = `test-session-${++n}`;
  const res = await SELF.fetch(`https://example.com/agents/issue-scout/${name}`, { headers: { Upgrade: "websocket" } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();

  const inbox: Reply[] = [];
  const waiters: ((r: Reply) => void)[] = [];
  ws.addEventListener("message", (ev) => {
    let data: Reply;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (data.type !== "assistant") return; // SDK state-sync and identity frames
    const w = waiters.shift();
    if (w) w(data);
    else inbox.push(data);
  });
  const next = () =>
    new Promise<Reply>((resolve, reject) => {
      const queued = inbox.shift();
      if (queued) return resolve(queued);
      const timer = setTimeout(() => reject(new Error("timed out waiting for assistant frame")), 5000);
      waiters.push((r) => (clearTimeout(timer), resolve(r)));
    });

  const stub = env.IssueScoutAgent.get(env.IssueScoutAgent.idFromName(name));
  const inspect = <T>(fn: (agent: IssueScoutAgent) => T | Promise<T>) =>
    runInDurableObject(stub, (instance) => fn(instance as unknown as IssueScoutAgent));

  const t = makeDeps();
  await inspect((agent) => {
    agent.buildDeps = () => t.deps;
  });

  return {
    t,
    next,
    async send(text, seed) {
      ws.send(JSON.stringify({ type: "user", text, ...(seed ? { seed } : {}) }));
      return next();
    },
    state: () => inspect((a) => a.state),
    inspect,
  };
}

describe("IssueScoutAgent", () => {
  it("builds a shortlist from the first message", async () => {
    const s = await open();
    const reply = await s.send("exploreriii");
    expect(reply.type).toBe("assistant");
    expect(reply.shortlist).toHaveLength(5);
    expect(reply.shortlist![0].explanation).toBeDefined();
    expect(reply.text).toContain("exploreriii");
    for (const item of reply.shortlist!) expect(reply.text).toContain(item.issue.url);

    const st = await s.state();
    expect(st.profile?.handle).toBe("exploreriii");
    expect(st.ranked?.top).toHaveLength(5);
    expect(st.snapshotId).toMatch(/^[0-9a-f]{64}$/);
    expect(st.candidatesRef).toHaveLength(3);
    expect(st.explanations).toHaveLength(5);
    expect(s.t.fetches).toEqual({ issues: 3, profiles: 1 });
  });

  it("treats a sentence as profile text and an unknown handle as a request for another", async () => {
    const a = await open();
    const reply = await a.send("I mostly write Rust and have never contributed before");
    expect(reply.shortlist!.length).toBeGreaterThan(0);
    expect((await a.state()).profile?.source).toBe("text");

    const b = await open();
    const unknown = await b.send("nobody-here");
    expect(unknown.text).toContain("could not find that GitHub user");
    expect((await b.state()).profile).toBeUndefined();
  });

  it("re-ranks 'only Rust' from the cached snapshot with zero fetches", async () => {
    const s = await open();
    await s.send("exploreriii");
    const before = { ...s.t.fetches };
    const callsBefore = s.t.gh.calls.length;

    const reply = await s.send("only Rust");
    expect(reply.shortlist!.length).toBeGreaterThan(0);
    for (const item of reply.shortlist!) expect(item.issue.repoLanguage).toBe("Rust");
    expect(s.t.fetches).toEqual(before);
    expect(s.t.gh.calls.length).toBe(callsBefore);
    expect((await s.state()).preferences.languages).toEqual(["Rust"]);
  });

  it("filters by org from the cached snapshot with zero fetches, and 'all orgs' clears it", async () => {
    const s = await open();
    const first = await s.send("exploreriii");
    expect(first.orgCounts!["hiero-ledger"]).toBeGreaterThan(0);
    expect(first.orgCounts!["LFDT-CLPR"]).toBe(0);
    const before = { ...s.t.fetches };
    const callsBefore = s.t.gh.calls.length;

    const only = await s.send("only org hiero-hackers");
    expect(only.shortlist!.length).toBeGreaterThan(0);
    for (const item of only.shortlist!) expect(item.issue.org).toBe("hiero-hackers");
    expect(only.orgs).toEqual(["hiero-hackers"]);
    expect(only.orgCounts).toEqual(first.orgCounts);
    expect((await s.state()).preferences.orgs).toEqual(["hiero-hackers"]);

    const both = await s.send("only orgs hiero-ledger, hiero-hackers");
    expect(both.orgs).toEqual(["hiero-ledger", "hiero-hackers"]);

    const all = await s.send("all orgs");
    expect(all.orgs).toEqual([]);
    expect((await s.state()).preferences.orgs).toBeUndefined();
    expect(s.t.fetches).toEqual(before);
    expect(s.t.gh.calls.length).toBe(callsBefore);
  });

  it("rejects an unknown org in a refine", async () => {
    const s = await open();
    await s.send("exploreriii");
    const reply = await s.send("only org nope-org");
    expect(reply.text).toContain("nope-org");
    expect((await s.state()).preferences.orgs).toBeUndefined();
  });

  it("a seed from the UI builds the session so a first refine works without a handle message", async () => {
    const s = await open();
    const reply = await s.send("only org hiero-hackers", { handle: "exploreriii" });
    expect(reply.shortlist!.length).toBeGreaterThan(0);
    for (const item of reply.shortlist!) expect(item.issue.org).toBe("hiero-hackers");
    expect((await s.state()).profile?.handle).toBe("exploreriii");
  });

  it("refills an expired snapshot through the sources, not the network", async () => {
    const s = await open();
    await s.send("exploreriii");
    await clearKv(); // snapshots gone, profile cache gone
    const reply = await s.send("only Python");
    expect(reply.shortlist!.length).toBeGreaterThan(0);
    expect(s.t.fetches.issues).toBe(6); // 3 orgs refetched
    expect(s.t.fetches.profiles).toBe(1); // stored profile reused, not refetched
  });

  it("excludes a repo and remembers the rejection", async () => {
    const s = await open();
    const first = await s.send("exploreriii");
    const repo = `${first.shortlist![0].issue.org}/${first.shortlist![0].issue.repo}`;
    const reply = await s.send(`exclude ${repo}`);
    for (const item of reply.shortlist ?? []) expect(`${item.issue.org}/${item.issue.repo}`).not.toBe(repo);
    expect((await s.state()).rejected.repos).toEqual([repo]);
  });

  it("whyNot returns score reasons for a ranked issue and the excluding rule for an assigned one", async () => {
    const s = await open();
    const first = await s.send("exploreriii");
    const ranked = await s.send(`why not ${first.shortlist![0].issue.url}`);
    expect(ranked.text).toContain("number 1");
    expect(ranked.text).toContain(first.shortlist![0].reasons[0]);

    const assigned = (snapshot.issues as any[]).find((i) => i.assignees > 0);
    if (assigned) {
      const r = await s.send(`why not ${assigned.url}`);
      expect(r.text).toContain("Already assigned");
    }
    const labelless = (snapshot.issues as any[]).find((i) => i.assignees === 0 && i.labels.some((l: string) => /^(claimed|epic)$/i.test(l)));
    if (labelless) {
      const r = await s.send(`why not ${labelless.url}`);
      expect(r.text).toMatch(/claimed|excluded/i);
    }

    const outside = await s.send("why not https://github.com/some-other-org/repo/issues/1");
    expect(outside.text).toContain("not one of the organisations");
    const garbage = await s.send("why not nonsense");
    expect(garbage.text).toContain("does not look like a GitHub issue URL");
  });

  it("whyNot falls back to a single REST read for an issue outside the snapshot", async () => {
    const s = await open();
    await s.send("exploreriii");
    s.t.gh.issues.set("hiero-ledger/hiero-sdk-rust#99999", {
      node_id: "I_x",
      number: 99999,
      title: "Unlabelled",
      body: "",
      html_url: "https://github.com/hiero-ledger/hiero-sdk-rust/issues/99999",
      state: "open",
      labels: [{ name: "bug" }],
      assignees: [],
      comments: 0,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
    });
    const r = await s.send("why not https://github.com/hiero-ledger/hiero-sdk-rust/issues/99999");
    expect(r.text).toContain("No first-issue or help-wanted label");
    expect(s.t.gh.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("repoContext summarises CONTRIBUTING once (cached), reports CI and the last merged PR", async () => {
    const s = await open();
    await s.send("exploreriii");
    const r = await s.send("context hiero-ledger/hiero-sdk-rust");
    expect(r.text).toContain("Fork, branch, sign your commits");
    expect(r.text).toContain("success on main");
    expect(r.text).toContain("2026-10-24");
    const summaryCalls = () => s.t.ai.calls.filter((c) => c.kind === "contributing").length;
    expect(summaryCalls()).toBe(1);
    await s.send("context hiero-ledger/hiero-sdk-rust");
    expect(summaryCalls()).toBe(1);
    expect(s.t.gh.calls.every((c) => c.method === "GET")).toBe(true);

    const outside = await s.send("context somebody/else");
    expect(outside.text).toContain("not one of the organisations");
  });

  it("explain stores the explanation and returns it", async () => {
    const s = await open();
    s.t.ai.failExplain = true;
    await s.send("exploreriii");
    expect((await s.state()).explanations).toEqual([]);
    s.t.ai.failExplain = false;
    const r = await s.send("explain 2");
    expect(r.text).toContain("Fit: Your recent work matches");
    expect(r.shortlist![1].explanation).toBeDefined();
    expect((await s.state()).explanations).toHaveLength(1);
  });

  it("watch schedules a re-check and posts the result into the session on wake", async () => {
    const s = await open();
    const first = await s.send("exploreriii");
    const target = first.shortlist![0].issue;
    const reply = await s.send("watch 1 for 3 days");
    expect(reply.text).toContain("3 days");

    const schedules = await s.inspect((a) => a.listSchedules());
    const w = schedules.find((x) => x.callback === "checkWatch");
    expect(w).toBeDefined();
    const days = (Number(w!.time) * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
    const st = await s.state();
    expect(st.watches).toHaveLength(1);
    expect(st.watches[0]).toMatchObject({ issueId: target.id, days: 3, status: "pending", scheduleId: w!.id });

    // the issue is taken by the time the schedule fires
    s.t.gh.issues.set(`${target.org}/${target.repo}#${target.number}`, {
      node_id: target.id,
      number: target.number,
      title: target.title,
      body: "",
      html_url: target.url,
      state: "open",
      labels: [{ name: "good first issue" }],
      assignees: [{ login: "someone" }],
      comments: 2,
      created_at: target.createdAt,
      updated_at: "2026-11-01T00:00:00Z",
    });
    await s.inspect((a) => a.checkWatch({ issueId: target.id, url: target.url }));
    const pushed = await s.next();
    expect(pushed.text).toContain("now looks taken");
    const after = await s.state();
    expect(after.messages.at(-1)?.text).toContain("now looks taken");
    expect(after.watches[0]?.status).toBe("done");
  });

  it("watch rejects durations outside 1-14 days and unknown positions", async () => {
    const s = await open();
    await s.send("exploreriii");
    expect((await s.send("watch 1 for 20 days")).text).toContain("1 to 14 days");
    expect((await s.send("watch 1 for 0 days")).text).toContain("1 to 14 days");
    expect((await s.send("watch 99 for 3 days")).text).toContain("could not find that issue");
    const schedules = await s.inspect((a) => a.listSchedules());
    expect(schedules.filter((x) => x.callback === "checkWatch")).toHaveLength(0);
  });

  it("expires after 7 days: cancels watches and clears the session", async () => {
    const s = await open();
    await s.send("exploreriii");
    await s.send("watch 1 for 5 days");

    const schedules = await s.inspect((a) => a.listSchedules());
    const expiry = schedules.find((x) => x.callback === "expireSession");
    expect(expiry).toBeDefined();
    const days = (Number(expiry!.time) * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(schedules.some((x) => x.callback === "checkWatch")).toBe(true);

    await s.inspect((a) => a.expireSession());
    const st = await s.state();
    expect(st.profile).toBeUndefined();
    expect(st.ranked).toBeUndefined();
    expect(st.watches).toEqual([]);
    expect(st.messages).toEqual([]);
    expect(st.rejected).toEqual({ issues: [], repos: [] });
    const left = await s.inspect((a) => a.listSchedules());
    expect(left.some((x) => x.callback === "checkWatch")).toBe(false);
  });

  describe("free text", () => {
    it("maps a free-text request to a declared tool through one model call", async () => {
      const s = await open();
      await s.send("exploreriii");
      s.t.ai.interpretAnswer = 'Sure! {"tool":"refine","languages":["Python"]}';
      const r = await s.send("anything in the snake language please");
      expect(s.t.ai.calls.filter((c) => c.kind === "interpret")).toHaveLength(1);
      expect(r.shortlist!.length).toBeGreaterThan(0);
      for (const item of r.shortlist!) expect(item.issue.repoLanguage).toBe("Python");
    });

    it("asks for a clearer request when the model output is invalid or names no tool", async () => {
      const s = await open();
      await s.send("exploreriii");
      for (const answer of ["blah", '{"tool":"deleteEverything"}', '{"tool":"watch","issue":1,"days":99}', '{"tool":"none"}']) {
        s.t.ai.interpretAnswer = answer;
        const r = await s.send("do something odd");
        expect(r.text).toContain("did not understand");
      }
    });

    it("reads \"a Rust issue in a new repository that fits my skills\" without the model", async () => {
      const s = await open();
      const first = await s.send("exploreriii");
      const shown = new Set(first.shortlist!.map((i) => `${i.issue.org}/${i.issue.repo}`));
      const r = await s.send("I want to find a Rust issue in a new repository that is a good fit for my skills");
      expect(s.t.ai.calls.filter((c) => c.kind === "interpret")).toHaveLength(0);
      expect(r.shortlist!.length).toBeGreaterThan(0);
      for (const item of r.shortlist!) {
        expect(item.issue.repoLanguage).toBe("Rust");
        expect(shown.has(`${item.issue.org}/${item.issue.repo}`)).toBe(false);
        expect(r.text).toContain(item.issue.url);
      }
      const st = await s.state();
      expect(st.preferences.languages).toEqual(["Rust"]);
      expect([...shown].every((repo) => st.preferences.excludeRepos.includes(repo))).toBe(true);
    });

    it("does not call the model for a deterministic command", async () => {
      const s = await open();
      await s.send("exploreriii");
      await s.send("only Rust");
      expect(s.t.ai.calls.filter((c) => c.kind === "interpret")).toHaveLength(0);
    });
  });
});
