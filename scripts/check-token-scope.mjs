// Fails if GITHUB_TOKEN carries any write scope. Classic tokens expose scopes in the
// x-oauth-scopes header; fine-grained tokens expose none and must be read-only by construction.
const token = process.env.GITHUB_TOKEN;
if (!token) { console.log("check-token-scope: no GITHUB_TOKEN set, skipping"); process.exit(0); }
const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, "User-Agent": "issue-scout" } });
const scopes = (res.headers.get("x-oauth-scopes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const write = scopes.filter((s) => /^(repo|write:|admin:|delete|workflow|gist|notifications)/.test(s) && s !== "public_repo:read");
if (write.length) { console.error(`check-token-scope: token has write scopes: ${write.join(", ")}`); process.exit(1); }
console.log(`check-token-scope: ok (scopes: ${scopes.length ? scopes.join(", ") : "fine-grained / none"})`);
