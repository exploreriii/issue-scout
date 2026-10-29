import { describe, expect, it } from "vitest";
import { RawIssueSchema, loadRegistry } from "@issue-scout/core";
import { FixtureIssueSource, FixtureProfileSource, ProfileNotFoundError } from "../src/index.js";
import orgsJson from "../../../orgs.json";
import snapshot from "../../core/test/fixtures/issues.snapshot.json";
import profiles from "../../core/test/fixtures/profiles.json";

describe("fixture sources", () => {
  it("returns schema-valid RawIssues filtered by org", async () => {
    const src = new FixtureIssueSource(snapshot);
    const registry = loadRegistry(orgsJson);
    let total = 0;
    for (const org of registry) {
      const issues = await src.fetchOpenIssues(org);
      for (const i of issues) {
        expect(RawIssueSchema.safeParse(i).success).toBe(true);
        expect(i.org).toBe(org.login);
      }
      total += issues.length;
    }
    expect(total).toBe(snapshot.issues.length);
  });

  it("looks profiles up by handle, case-insensitively", async () => {
    const src = new FixtureProfileSource(profiles);
    expect((await src.fetchProfile("ExplorerIII")).handle).toBe("exploreriii");
    await expect(src.fetchProfile("nobody")).rejects.toThrow(ProfileNotFoundError);
  });
});
