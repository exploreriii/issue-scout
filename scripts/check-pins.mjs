// Fails if any `uses:` line in .github/workflows is not pinned to a full
// 40-hex commit SHA followed by a `# v…` version comment.
// Local actions (./path) and docker:// refs are checked separately: local is allowed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = ".github/workflows";
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const pinned = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d[\w.+-]*\s*$/;
const bad = [];
let count = 0;

for (const file of files) {
  readFileSync(join(dir, file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(/^\s*(?:-\s*)?uses:\s*(.+)$/);
      if (!m) return;
      const ref = m[1].trim();
      if (ref.startsWith("./")) return;
      count++;
      if (!pinned.test(ref)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

if (bad.length) {
  console.error("Unpinned actions (need @<40-hex sha> # vX.Y.Z):");
  for (const b of bad) console.error("  " + b);
  process.exit(1);
}
console.log(`check-pins: ${count} action reference(s) pinned across ${files.length} workflow(s).`);
