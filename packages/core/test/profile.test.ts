import { describe, expect, it } from "vitest";
import { profileFromGithub, profileFromText } from "../src/index.js";

describe("profileFromText", () => {
  it('parses "Python and a bit of Rust, two evenings"', () => {
    const p = profileFromText("Python and a bit of Rust, two evenings");
    expect(p.source).toBe("text");
    expect(p.languages.map((l) => l.name)).toEqual(["Python", "Rust"]);
    expect(p.languages[0]!.weight).toBeGreaterThan(p.languages[1]!.weight);
    expect(p.timeBudgetHours).toBe(4);
    expect(p.experienceBand).toBe(0);
    expect(p).toEqual(profileFromText("Python and a bit of Rust, two evenings"));
  });
  it("hours and weekend patterns", () => {
    expect(profileFromText("TypeScript, 4 hours").timeBudgetHours).toBe(4);
    expect(profileFromText("Go this weekend").timeBudgetHours).toBe(8);
    expect(profileFromText("Python").timeBudgetHours).toBeUndefined();
  });
  it("does not confuse Java and JavaScript", () => {
    expect(profileFromText("JavaScript").languages.map((l) => l.name)).toEqual(["JavaScript"]);
  });
  it("band from merged PR count; tests flag", () => {
    expect(profileFromText("Rust, 3 merged PRs").experienceBand).toBe(1);
    expect(profileFromText("Rust, 10 pull requests").experienceBand).toBe(2);
    expect(profileFromText("Rust, I like writing tests").wantsTests).toBe(true);
  });
});

describe("profileFromGithub", () => {
  const repos = [
    { language: "Python", pushed_at: "2026-09-01T00:00:00Z" },
    { language: "Python", pushed_at: "2026-08-01T00:00:00Z" },
    { language: "Rust", pushed_at: "2026-09-10T00:00:00Z" },
    { language: "Go", pushed_at: "2019-01-01T00:00:00Z" },
    { language: "Ruby", pushed_at: "2026-09-10T00:00:00Z", fork: true },
    { language: null },
  ];
  it("weights by repo count and recency", () => {
    const p = profileFromGithub({ login: "me" }, repos, 0);
    expect(p.handle).toBe("me");
    expect(p.languages.map((l) => l.name)).toEqual(["Python", "Rust", "Go"]);
    const total = p.languages.reduce((a, l) => a + l.weight, 0);
    expect(total).toBeCloseTo(1, 2);
    const go = p.languages.find((l) => l.name === "Go")!;
    const rust = p.languages.find((l) => l.name === "Rust")!;
    expect(go.weight).toBeLessThan(rust.weight);
  });
  it("experience bands 0 / 1-5 / 6+", () => {
    const b = (n: number) => profileFromGithub({ login: "x" }, [], n).experienceBand;
    expect([b(0), b(1), b(5), b(6), b(40)]).toEqual([0, 1, 1, 2, 2]);
  });
  it("is deterministic", () => {
    expect(profileFromGithub({ login: "me" }, repos, 2)).toEqual(profileFromGithub({ login: "me" }, [...repos], 2));
  });
});

describe("profileFromGithub fork fallback", () => {
  it("uses forks when the account has no non-fork repositories with a language", () => {
    const repos = [
      { language: "TypeScript", pushed_at: "2026-10-01T00:00:00Z", fork: true },
      { language: "Python", pushed_at: "2026-09-01T00:00:00Z", fork: true },
      { language: null, pushed_at: "2026-09-01T00:00:00Z", fork: true },
    ] as never;
    const p = profileFromGithub({ login: "forker" }, repos, 10);
    expect(p.languages.map((l) => l.name).sort()).toEqual(["Python", "TypeScript"]);
    expect(p.experienceBand).toBe(2);
  });
});
