import { loadRegistry, type OrgConfig } from "@issue-scout/core";
import orgs from "../../../orgs.json";

let cached: OrgConfig[] | undefined;

/** Enabled orgs from orgs.json, validated once per isolate (FR-13). */
export function getRegistry(): OrgConfig[] {
  cached ??= loadRegistry(orgs);
  return cached;
}
