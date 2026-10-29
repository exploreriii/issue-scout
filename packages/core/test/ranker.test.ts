import { describe, expect, it } from "vitest";
import { estimateEffortHours, rank, scoreCandidate } from "../src/index.js";
import { NOW, cand, daysAgo, emptyPrefs, profile } from "./helpers.js";

const reasons = (c = cand(), p = profile(), prefs = emptyPrefs) => scoreCandidate(c, p, prefs, NOW).reasons;

describe("ranking rules", () => {
  it("top-3 language +3", () => {
    const r = scoreCandidate(cand({ repoLanguage: "Python" }), profile(), emptyPrefs, NOW);
    expect(r.reasons).toContain("Repo is Python, your main language");
    expect(r.reasons.join()).not.toContain("which you have used");
  });
  it("language outside top-3 but used +1; unused none", () => {
    const p = profile({
      languages: [
        { name: "A", weight: 4 }, { name: "B", weight: 3 }, { name: "C", weight: 2 }, { name: "Rust", weight: 1 },
      ],
    });
    expect(reasons(cand({ repoLanguage: "rust" }), p)).toContain("Repo is rust, which you have used");
    const none = reasons(cand({ repoLanguage: "Go" }), p).join("|");
    expect(none).not.toMatch(/Repo is Go/);
  });
  it("firstIssue with band<=1 +2; band 2 gets -1 'too small'", () => {
    expect(reasons(cand(), profile({ experienceBand: 0 }))).toContain("Labelled for first-timers");
    const r = reasons(cand(), profile({ experienceBand: 2 }));
    expect(r).toContain("Labelled as a first issue; may be too small for you");
    expect(r).not.toContain("Labelled for first-timers");
  });
  it("helpWanted band 2 +2; band 0 gets -1 'too large'; band 1 neutral", () => {
    const h = cand({ tier: "helpWanted" });
    expect(reasons(h, profile({ experienceBand: 2 }))).toContain("Help-wanted matches your experience");
    expect(reasons(h, profile({ experienceBand: 0 }))).toContain("Labelled help-wanted; may be too large for a first issue");
    const mid = reasons(h, profile({ experienceBand: 1 })).join("|");
    expect(mid).not.toMatch(/Help-wanted matches|may be too/);
  });
  it("tier score arithmetic", () => {
    const a = scoreCandidate(cand(), profile({ experienceBand: 2 }), emptyPrefs, NOW).score;
    const b = scoreCandidate(cand(), profile({ experienceBand: 0 }), emptyPrefs, NOW).score;
    expect(b - a).toBe(3);
  });
  it("Unassigned always listed for candidates", () => {
    expect(reasons()).toContain("Unassigned");
  });
  it("claim phrase in last comment removes the +1", () => {
    expect(reasons()).toContain("Nobody has asked to take it");
    expect(reasons(cand({ lastComment: "Looks fun, thanks!" }))).toContain("Nobody has asked to take it");
    for (const t of ["I'd like to take this", "id like to work on it", "Can I take this?", "can i work on this", "Assign me please"]) {
      expect(reasons(cand({ lastComment: t }))).not.toContain("Nobody has asked to take it");
    }
  });
  it("active <=30 days; boundary and negative", () => {
    expect(reasons(cand({ updatedAt: daysAgo(30) }))).toContain("Active in the last month");
    expect(reasons(cand({ updatedAt: daysAgo(31) }))).not.toContain("Active in the last month");
  });
  it("age >180 days -1", () => {
    expect(reasons(cand({ createdAt: daysAgo(181) }))).toContain("Older than six months");
    expect(reasons(cand({ createdAt: daysAgo(180) }))).not.toContain("Older than six months");
  });
  it("body 200-2000 chars well-scoped", () => {
    expect(reasons(cand({ body: "x".repeat(200) }))).toContain("Well-scoped description");
    expect(reasons(cand({ body: "x".repeat(2000) }))).toContain("Well-scoped description");
    expect(reasons(cand({ body: "x".repeat(199) }))).not.toContain("Well-scoped description");
    expect(reasons(cand({ body: "x".repeat(2001) }))).not.toContain("Well-scoped description");
  });
  it("checklist or 'acceptance' gives acceptance criteria", () => {
    expect(reasons(cand({ body: "- [ ] do it" }))).toContain("Has acceptance criteria");
    expect(reasons(cand({ body: "Acceptance: it works" }))).toContain("Has acceptance criteria");
    expect(reasons(cand({ body: "just do it" }))).not.toContain("Has acceptance criteria");
  });
  it("repo merged a PR in <=14 days", () => {
    expect(reasons(cand({ repoLastMergedPrAt: daysAgo(14) }))).toContain("Repo merged a PR in the last two weeks");
    expect(reasons(cand({ repoLastMergedPrAt: daysAgo(15) }))).not.toContain("Repo merged a PR in the last two weeks");
    expect(reasons(cand())).not.toContain("Repo merged a PR in the last two weeks");
  });
  it("wantsTests + tests mention", () => {
    const p = profile();
    const prefs = { ...emptyPrefs, wantsTests: true };
    expect(reasons(cand({ body: "add unit tests" }), p, prefs)).toContain("Involves tests");
    expect(reasons(cand({ labels: ["good first issue", "tests"] }), p, prefs)).toContain("Involves tests");
    expect(reasons(cand({ body: "refactor" }), p, prefs)).not.toContain("Involves tests");
    expect(reasons(cand({ body: "add unit tests" }), p, emptyPrefs)).not.toContain("Involves tests");
  });
  it("effort over time budget -2", () => {
    const prefs = { ...emptyPrefs, timeBudgetHours: 4 };
    expect(reasons(cand({ labels: ["good first issue", "size/xl"] }), profile(), prefs)).toContain(
      "Probably bigger than your time budget",
    );
    expect(reasons(cand({ labels: ["good first issue", "size/s"] }), profile(), prefs)).not.toContain(
      "Probably bigger than your time budget",
    );
    // falls back to profile budget
    expect(reasons(cand({ labels: ["good first issue", "size/xl"] }), profile({ timeBudgetHours: 4 }))).toContain(
      "Probably bigger than your time budget",
    );
  });
});

describe("estimateEffortHours", () => {
  it("uses size/effort labels first", () => {
    expect(estimateEffortHours({ body: "x".repeat(5000), labels: ["size/xs"] })).toBe(1);
    expect(estimateEffortHours({ body: "", labels: ["Effort/L"] })).toBe(8);
    expect(estimateEffortHours({ body: "", labels: ["effort: 3h"] })).toBe(3);
  });
  it("falls back to body length", () => {
    expect(estimateEffortHours({ body: "x", labels: [] })).toBe(1);
    expect(estimateEffortHours({ body: "x".repeat(800), labels: [] })).toBe(2);
    expect(estimateEffortHours({ body: "x".repeat(2000), labels: [] })).toBe(4);
    expect(estimateEffortHours({ body: "x".repeat(4000), labels: [] })).toBe(8);
  });
});

describe("ordering, diversity, tie-breaks", () => {
  const mk = (n: number, repo: string, over = {}) =>
    cand({ id: `i${n}`, number: n, repo, url: `u${n}`, ...over });

  it("sorts by score desc", () => {
    const hi = mk(1, "a", { repoLanguage: "Python" });
    const lo = mk(2, "b");
    const { top } = rank([lo, hi], profile(), emptyPrefs, NOW);
    expect(top.map((r) => r.issue.id)).toEqual(["i1", "i2"]);
  });
  it("ties: updatedAt desc then number asc", () => {
    const a = mk(5, "a", { updatedAt: daysAgo(100) });
    const b = mk(2, "b", { updatedAt: daysAgo(90) });
    const c = mk(1, "c", { updatedAt: daysAgo(100) });
    const d = mk(3, "d", { updatedAt: daysAgo(100) });
    const { top } = rank([a, b, c, d], profile(), emptyPrefs, NOW);
    expect(top.map((r) => r.issue.number)).toEqual([2, 1, 3, 5]);
  });
  it("at most 2 per repo in the top five; extras fall to runners-up", () => {
    const hot = [1, 2, 3, 4].map((n) => mk(n, "hot", { repoLanguage: "Python" }));
    const others = [10, 11, 12, 13].map((n) => mk(n, `r${n}`));
    const { top, runnersUp } = rank([...hot, ...others], profile(), emptyPrefs, NOW);
    expect(top).toHaveLength(5);
    expect(top.filter((r) => r.issue.repo === "hot")).toHaveLength(2);
    expect(top.slice(0, 2).map((r) => r.issue.repo)).toEqual(["hot", "hot"]);
    expect(runnersUp.map((r) => r.issue.number).sort((x, y) => x - y)).toEqual([3, 4, 13]);
  });
  it("backfills from a third repo: A x4, B x3, C x1 gives A,A,B,B,C", () => {
    const A = [1, 2, 3, 4].map((n) => mk(n, "A", { repoLanguage: "Python" }));
    const B = [5, 6, 7].map((n) => mk(n, "B"));
    const C = [mk(8, "C", { updatedAt: daysAgo(200), createdAt: daysAgo(300) })];
    const { top, runnersUp } = rank([...A, ...B, ...C], profile(), emptyPrefs, NOW);
    expect(top).toHaveLength(5);
    const count = (r: string) => top.filter((x) => x.issue.repo === r).length;
    expect([count("A"), count("B"), count("C")]).toEqual([2, 2, 1]);
    expect(runnersUp.map((r) => r.issue.number).sort((x, y) => x - y)).toEqual([3, 4, 7]);
  });
  it("documented case: only two repos available, top holds four (cap beats the five-count)", () => {
    const A = [1, 2, 3, 4].map((n) => mk(n, "A"));
    const B = [5, 6, 7].map((n) => mk(n, "B"));
    const { top, runnersUp } = rank([...A, ...B], profile(), emptyPrefs, NOW);
    expect(top).toHaveLength(4);
    expect(runnersUp).toHaveLength(3);
  });
  it("runners-up are positions 6-10 only", () => {
    const all = Array.from({ length: 14 }, (_, i) => mk(i + 1, `r${i}`));
    const { top, runnersUp } = rank(all, profile(), emptyPrefs, NOW);
    expect(top).toHaveLength(5);
    expect(runnersUp).toHaveLength(5);
  });
  it("is deterministic and carries reasons", () => {
    const all = [mk(1, "a", { repoLanguage: "Python" }), mk(2, "b")];
    const r1 = rank(all, profile(), emptyPrefs, NOW);
    const r2 = rank([...all].reverse(), profile(), emptyPrefs, NOW);
    expect(r1).toEqual(r2);
    expect(r1.top[0]?.reasons.length).toBeGreaterThan(0);
  });
  it("honours excludeRepos and excludeIssues", () => {
    const a = mk(1, "a");
    const b = mk(2, "b");
    const out = rank([a, b], profile(), { excludeRepos: ["hiero-ledger/a"], excludeIssues: [] }, NOW);
    expect(out.top.map((r) => r.issue.id)).toEqual(["i2"]);
    const out2 = rank([a, b], profile(), { excludeRepos: [], excludeIssues: ["i2"] }, NOW);
    expect(out2.top.map((r) => r.issue.id)).toEqual(["i1"]);
  });
});
