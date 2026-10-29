# Decisions log

Implementation decisions where the specification was silent.

| # | Area | Decision | Status |
|---|---|---|---|
| D1 | Ranking: claim rule | `RawIssue.lastComment?: string` added. "Nobody has asked to take it" (+1) applies when the last comment is absent or not a claim phrase. Sources fill it from `comments(last:1)`. | Accepted |
| D2 | Ranking: tier mismatch | firstIssue at band 2 gives "may be too small". helpWanted at band 0 gives "may be too large". helpWanted at band 1 is neutral. | Accepted |
| D3 | Profile recency | `profileFromGithub` takes no `now`. Recency is relative to the newest `pushed_at` (1 / 0.5 / 0.25 within 1 / 3 / more than 3 years). Forks are skipped. Weights sum to 1. | Accepted |
| D4 | Diversity | The walk continues until five are chosen. With only two repos the top five holds four (covered in tests). | Accepted |
| D5 | Sources: merged-PR date | Query includes `pullRequests(states:MERGED, first:1, orderBy:UPDATED_AT)`. Nulls are omitted. Not yet checked against live GitHub. | Verify on first deploy |
| D6 | Sources: page cap | 3 pages per label-alias search, so up to 6 per org. Matches `scripts/record-fixtures.sh`. | Accepted |
| D7 | Sources: snapshot key | One KV entry per org, `snap:{org}:{labelsetHash}:all`. `recordedAt` is checked against `now` as a second TTL. | Accepted |
| D8 | Rate limiter | KV read-then-write is not atomic, so bursts may overshoot slightly. | Accepted for v0.1 |
| D9 | KV TTL | Clamped to ≥60 s, the KV minimum. | Accepted |
| D10 | Explainer: model | `DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.6"`. `response_format` is passed. JSON-mode support is unconfirmed, so retry and zod validation are the guard. | OQ-3 open: test on a live call |
| D11 | Explainer: AI Gateway | No documented `env.AI.run` gateway option. `gatewayId` is accepted but not forwarded. | Open |
| D12 | UI types | Response types are declared in `ui/src/api.ts`, mirroring the core schema, to keep zod out of the bundle. | Accepted; keep in sync |
| D13 | Platform | `wrangler.jsonc` at the root. `agents ^0.31`, React 19. Worker tests use vitest 4 with `@cloudflare/vitest-pool-workers` and `remoteBindings: false`. | Accepted |
| D14 | Fixtures | 36 issues recorded (hiero-ledger 26, hiero-hackers 10), 16 assigned. `repoLastMergedPrAt` not recorded. | Accepted |

## Open
| # | Item | Detail |
|---|---|---|
| O1 | Ranking oracle fixtures | Expected rankings for the three fixture profiles are not yet recorded, so there are no golden ranking tests. |
| O2 | LFDT-CLPR label aliases | The org has 12 open issues and none carry good-first-issue or help-wanted labels. Its aliases in `orgs.json` are unconfirmed. Confirm the labels in use before relying on the org. |
