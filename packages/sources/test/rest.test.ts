import { describe, expect, it } from "vitest";
import { profileFromGithub } from "@issue-scout/core";
import { GithubProfileSource, InvalidHandleError, ProfileNotFoundError, isValidHandle } from "../src/index.js";
import user from "./recorded/rest-user.json";
import repos from "./recorded/rest-repos.json";
import prs from "./recorded/rest-search-prs.json";
import { mockFetch } from "./helpers.js";

const route = (url: string): unknown => {
  if (url.includes("/search/issues")) return prs;
  if (url.includes("/repos")) return repos;
  return user;
};

describe("profile mapping", () => {
  it("requests user, repos and merged-PR count, then calls profileFromGithub", async () => {
    const { fetch, calls } = mockFetch((c) => route(c.url));
    const profile = await new GithubProfileSource({ fetch }).fetchProfile("exploreriii");
    expect(calls.map((c) => c.url).sort()).toEqual([
      "https://api.github.com/search/issues?q=type:pr+is:merged+author:exploreriii&per_page=1",
      "https://api.github.com/users/exploreriii",
      "https://api.github.com/users/exploreriii/repos?per_page=100&sort=pushed",
    ]);
    expect(calls.every((c) => (c.init.method ?? "GET") === "GET")).toBe(true);
    expect(calls.every((c) => c.headers["User-Agent"] === "issue-scout")).toBe(true);
    expect(profile).toEqual(profileFromGithub({ login: "exploreriii" }, repos, 9));
    expect(profile.source).toBe("github");
    expect(profile.experienceBand).toBe(2); // 9 merged PRs
    expect(profile.languages[0]).toMatchObject({ name: "TypeScript" });
    expect(profile.languages.map((l) => l.name)).not.toContain("Rust"); // fork ignored
  });

  it("maps 404 to ProfileNotFoundError", async () => {
    const { fetch } = mockFetch(() => new Response("{}", { status: 404 }));
    await expect(new GithubProfileSource({ fetch }).fetchProfile("nobody-here")).rejects.toThrow(ProfileNotFoundError);
  });
});

describe("handle validation", () => {
  const bad = ["", "a b", "a/b", "../etc", "a".repeat(40), "name_with_underscore", "dot.name", "name\n", "é", "a?b=1"];
  it.each(bad)("rejects %j without any request", async (h) => {
    const { fetch, calls } = mockFetch(() => ({}));
    await expect(new GithubProfileSource({ fetch }).fetchProfile(h)).rejects.toThrow(InvalidHandleError);
    expect(calls).toHaveLength(0);
  });

  it("accepts the documented shape", () => {
    expect(isValidHandle("a")).toBe(true);
    expect(isValidHandle("a".repeat(39))).toBe(true);
    expect(isValidHandle("Hiero-Ledger-1")).toBe(true);
    expect(isValidHandle(undefined)).toBe(false);
  });
});
