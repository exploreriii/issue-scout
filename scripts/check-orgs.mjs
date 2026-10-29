// Validates orgs.json against scripts/orgs.schema.json using a small built-in
// subset validator (type, required, properties, items, minItems, minLength).
// Skips (exit 0) when orgs.json is absent.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const orgsPath = join(root, process.env.ORGS_FILE ?? "orgs.json");

if (!existsSync(orgsPath)) {
  console.log(`check-orgs: ${orgsPath} not found, skipping.`);
  process.exit(0);
}

const schema = JSON.parse(readFileSync(join(root, "scripts/orgs.schema.json"), "utf8"));
const data = JSON.parse(readFileSync(orgsPath, "utf8"));
const errors = [];

function typeOf(v) {
  return Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
}

function check(value, s, path) {
  if (s.type && typeOf(value) !== s.type) {
    errors.push(`${path}: expected ${s.type}, got ${typeOf(value)}`);
    return;
  }
  if (s.minLength !== undefined && value.length < s.minLength) errors.push(`${path}: shorter than ${s.minLength}`);
  if (s.minItems !== undefined && value.length < s.minItems) errors.push(`${path}: fewer than ${s.minItems} items`);
  if (s.type === "object") {
    for (const k of s.required ?? []) if (!(k in value)) errors.push(`${path}: missing required "${k}"`);
    for (const [k, sub] of Object.entries(s.properties ?? {})) if (k in value) check(value[k], sub, `${path}.${k}`);
  }
  if (s.type === "array" && s.items) value.forEach((v, i) => check(v, s.items, `${path}[${i}]`));
}

check(data, schema, "orgs");
if (Array.isArray(data)) {
  const seen = new Set();
  for (const o of data) {
    const k = String(o.login).toLowerCase();
    if (seen.has(k)) errors.push(`duplicate login: ${o.login}`);
    seen.add(k);
  }
}

if (errors.length) {
  console.error("check-orgs: FAILED\n" + errors.map((e) => "  " + e).join("\n"));
  process.exit(1);
}
console.log(`check-orgs: ok (${data.length} orgs)`);
