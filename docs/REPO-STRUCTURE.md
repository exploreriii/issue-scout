# Repository structure

```
issue-scout/
├── README.md
├── LICENSE                    # Apache-2.0
├── docs/                      # SPEC, REQUIREMENTS, ARCHITECTURE, DECISIONS-LOG, adr/
├── orgs.json                  # organisation registry (FR-13), schema-checked in CI
├── package.json               # pnpm workspace root: dev, test, lint, typecheck, check-orgs, deploy
├── wrangler.jsonc             # bindings: Durable Object (IssueScoutAgent), AI, KV (CACHE), assets (ui/dist)
├── packages/
│   ├── core/                  # pure: schema, profile, candidates, ranker, registry, whyNot; test/fixtures/
│   ├── sources/               # IssueSource and ProfileSource, GitHub implementation, cache, rate limit, fixture source
│   ├── explainer/             # prompt, schema, Workers AI call
│   └── worker/                # router, IssueScoutAgent, tools, commands, health
├── ui/                        # Vite and React; cards and chat strip; Playwright and axe
├── scripts/
│   ├── record-fixtures.sh     # records a snapshot into packages/core/test/fixtures (needs gh and jq)
│   ├── check-orgs.mjs         # validates orgs.json against orgs.schema.json
│   └── orgs.schema.json
└── .github/workflows/         # ci.yml, deploy.yml, codeql.yml
```

## Conventions
- TypeScript strict; conventional commits.
- Pure packages use plain Vitest. Only `worker/` uses the Workers test pool.
- Every public function in `core` documents its reason strings, which are part of the contract.
- `orgs.json` label aliases follow the analytics platform's label taxonomy so both systems agree.
- Secrets (`GITHUB_TOKEN`, AI Gateway id) are set with `wrangler secret`, never in `wrangler.jsonc`.
