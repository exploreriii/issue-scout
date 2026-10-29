import { describe, expect, it } from "vitest";
import { toCandidates, whyNot } from "../src/index.js";
import { NOW, emptyPrefs, org, profile, raw } from "./helpers.js";

describe("toCandidates (FR-4)", () => {
  it("assigns firstIssue tier, case-insensitively and by alias", () => {
    const [c] = toCandidates([raw({ labels: ["GOOD FIRST ISSUE"] })], [org]);
    expect(c?.tier).toBe("firstIssue");
    const [d] = toCandidates([raw({ labels: ["good first issue: beginner"] })], [org]);
    expect(d?.tier).toBe("firstIssue");
  });
  it("helpWanted when only that alias matches; firstIssue wins if both", () => {
    expect(toCandidates([raw({ labels: ["Help Wanted"] })], [org])[0]?.tier).toBe("helpWanted");
    expect(toCandidates([raw({ labels: ["help wanted", "good first issue"] })], [org])[0]?.tier).toBe("firstIssue");
  });
  it("drops assigned issues", () => {
    expect(toCandidates([raw({ assignees: 1 })], [org])).toHaveLength(0);
  });
  it("drops claimed-label issues", () => {
    expect(toCandidates([raw({ labels: ["good first issue", "Status: In Progress"] })], [org])).toHaveLength(0);
  });
  it("drops exclude-label issues", () => {
    expect(toCandidates([raw({ labels: ["help wanted", "Epic"] })], [org])).toHaveLength(0);
  });
  it("drops issues with no qualifying label", () => {
    expect(toCandidates([raw({ labels: ["bug"] })], [org])).toHaveLength(0);
  });
  it("uses the alias set of the issue's own org", () => {
    const other = { ...org, login: "other", labels: { ...org.labels, firstIssue: ["newbie"], helpWanted: [] } };
    const rs = [raw({ org: "other", labels: ["newbie"] }), raw({ org: "other", labels: ["good first issue"], id: "x" })];
    expect(toCandidates(rs, [org, other]).map((c) => c.id)).toEqual(["i1"]);
  });
  it("drops unknown or disabled orgs", () => {
    expect(toCandidates([raw({ org: "nobody" })], [org])).toHaveLength(0);
    expect(toCandidates([raw()], [{ ...org, enabled: false }])).toHaveLength(0);
  });
});

describe("whyNot", () => {
  const issue = raw({ updatedAt: NOW.toISOString() });
  it("returns reasons for an eligible issue", () => {
    const r = whyNot(issue.url, [issue], [org], profile(), emptyPrefs, NOW);
    expect(r).toHaveProperty("reasons");
    expect((r as { reasons: string[] }).reasons).toContain("Unassigned");
  });
  it("names the excluding rule", () => {
    const a = raw({ assignees: 2 });
    expect(whyNot(a.url, [a], [org], profile(), emptyPrefs, NOW)).toEqual({ excludedBy: "Already assigned" });
    const l = raw({ labels: ["bug"] });
    expect(whyNot(l.url, [l], [org], profile(), emptyPrefs, NOW)).toEqual({
      excludedBy: "No first-issue or help-wanted label",
    });
    expect(whyNot("nope", [issue], [org], profile(), emptyPrefs, NOW)).toHaveProperty("excludedBy");
    const x = whyNot(issue.url, [issue], [org], profile(), { excludeRepos: [], excludeIssues: [issue.id] }, NOW);
    expect(x).toEqual({ excludedBy: "Issue is on your exclude list" });
  });
});
