import { describe, expect, it } from "vitest";
import { labelSets, loadRegistry } from "../src/index.js";
import { org } from "./helpers.js";

describe("loadRegistry (FR-13)", () => {
  it("accepts an array or {orgs}", () => {
    expect(loadRegistry([org])).toHaveLength(1);
    expect(loadRegistry({ orgs: [org] })).toHaveLength(1);
  });
  it("filters disabled orgs unless asked", () => {
    const list = [org, { ...org, login: "off", enabled: false }];
    expect(loadRegistry(list).map((o) => o.login)).toEqual(["hiero-ledger"]);
    expect(loadRegistry(list, { includeDisabled: true })).toHaveLength(2);
  });
  it("rejects a bad org", () => {
    expect(() => loadRegistry([{ ...org, labels: { firstIssue: "nope" } }])).toThrow();
    expect(() => loadRegistry([{ login: "x" }])).toThrow();
    expect(() => loadRegistry([{ ...org, enabled: "yes" }])).toThrow();
    expect(() => loadRegistry("not an array")).toThrow();
  });
  it("rejects duplicate logins", () => {
    expect(() => loadRegistry([org, { ...org, login: "HIERO-LEDGER" }])).toThrow(/duplicate/);
  });
  it("labelSets lower-cases aliases", () => {
    const s = labelSets(org);
    expect(s.firstIssue.has("good first issue: beginner")).toBe(true);
    expect(s.exclude.has("epic")).toBe(true);
  });
});
