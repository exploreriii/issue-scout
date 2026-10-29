import { z } from "zod";
import { OrgConfigSchema, type OrgConfig } from "./schema.js";

export interface LabelSets {
  firstIssue: Set<string>;
  helpWanted: Set<string>;
  claimed: Set<string>;
  exclude: Set<string>;
}

/**
 * Validate an org registry (FR-13). Accepts a bare array or `{ orgs: [...] }`.
 * Throws a ZodError on any invalid org or on duplicate logins.
 * Disabled orgs are filtered out unless `includeDisabled` is set.
 */
export function loadRegistry(json: unknown, opts: { includeDisabled?: boolean } = {}): OrgConfig[] {
  const input =
    json !== null && typeof json === "object" && !Array.isArray(json) && "orgs" in json
      ? (json as { orgs: unknown }).orgs
      : json;
  const orgs = z
    .array(OrgConfigSchema)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((o, i) => {
        const k = o.login.toLowerCase();
        if (seen.has(k)) ctx.addIssue({ code: "custom", path: [i, "login"], message: `duplicate org login: ${o.login}` });
        seen.add(k);
      });
    })
    .parse(input);
  return opts.includeDisabled ? orgs : orgs.filter((o) => o.enabled);
}

/** Lower-cased alias sets for case-insensitive label matching. */
export function labelSets(org: OrgConfig): LabelSets {
  const lc = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));
  return {
    firstIssue: lc(org.labels.firstIssue),
    helpWanted: lc(org.labels.helpWanted),
    claimed: lc(org.labels.claimed),
    exclude: lc(org.labels.exclude),
  };
}

export function findOrg(registry: OrgConfig[], login: string): OrgConfig | undefined {
  const l = login.toLowerCase();
  return registry.find((o) => o.login.toLowerCase() === l);
}
