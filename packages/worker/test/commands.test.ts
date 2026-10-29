import type { Ranked } from "@issue-scout/core";
import { describe, expect, it } from "vitest";
import { interpretFreeText } from "../src/commands";

const top = [
  { issue: { org: "hiero-ledger", repo: "sdk-js" } },
  { issue: { org: "hiero-ledger", repo: "sdk-js" } },
  { issue: { org: "hiero-hackers", repo: "tools" } },
] as unknown as Ranked[];

describe("interpretFreeText", () => {
  it("reads the placeholder sentence: language plus a new repository", () => {
    expect(interpretFreeText("I want to find a Rust issue in a new repository that fits my skills", top)).toEqual({
      tool: "refine",
      languages: ["Rust"],
      excludeRepos: ["hiero-ledger/sdk-js", "hiero-hackers/tools"],
    });
  });

  it("finds several languages and the other phrases anywhere in the text", () => {
    expect(interpretFreeText("something smaller in C++ or Go with tests, in another repo", top)).toEqual({
      tool: "refine",
      languages: ["Go", "C++"],
      excludeRepos: ["hiero-ledger/sdk-js", "hiero-hackers/tools"],
      timeBudgetHours: 4,
      wantsTests: true,
    });
    expect(interpretFreeText("a quick evening fix in typescript", [])).toEqual({ tool: "refine", languages: ["TypeScript"], timeBudgetHours: 4 });
  });

  it("does not mistake Java for JavaScript, or common words for languages", () => {
    expect(interpretFreeText("javascript please", [])).toEqual({ tool: "refine", languages: ["JavaScript"] });
    expect(interpretFreeText("a java issue", [])).toEqual({ tool: "refine", languages: ["Java"] });
    expect(interpretFreeText("let us go with a swift fix", [])).toBeNull();
  });

  it("returns null for unmatched text, and for a new-repo request with nothing on screen to exclude", () => {
    expect(interpretFreeText("anything in the snake language please", top)).toBeNull();
    expect(interpretFreeText("a different repository", [])).toBeNull();
  });
});
