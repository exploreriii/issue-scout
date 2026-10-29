# Requirements

## Functional
| ID | Requirement | Verified by |
|---|---|---|
| FR-1 | Accept a GitHub handle matching `^[A-Za-z0-9-]{1,39}$` or free text ≤500 characters. Reject anything else with a 400 and a message. | unit |
| FR-2 | Build a profile: languages (primary language of public repos, weighted by repo count and recency), experience band from merged-PR count, optional time budget and preferences. | unit, fixture |
| FR-3 | Fetch open issues for every enabled org: labels, assignees, comment count, created and updated dates, repo primary language and topics, last merged PR date. | contract test on recorded responses |
| FR-4 | Candidate filter: open; no assignee; no label in the org's `claimed` set; a label in its `firstIssue` or `helpWanted` set; none in its `exclude` set (epic, discussion, tracking). | unit |
| FR-5 | Deterministic scorer per ARCHITECTURE §5. Each score returns its reason strings. Identical inputs give identical outputs. | golden tests |
| FR-6 | At most two issues per repository in the top five. | unit |
| FR-7 | One model call per shortlist, returning JSON that matches `Explanation`. Retry invalid JSON once, then serve the shortlist with `explanations: "unavailable"`. | unit, schema test |
| FR-8 | Session state (profile, snapshot id, shortlist, rejections, preferences, watches) survives reconnects for 7 days. | DO state test |
| FR-9 | Refinement re-ranks from the cached snapshot. No network call unless the snapshot is past its TTL. | zero-fetch assertion |
| FR-10 | "Why not" for any issue URL in a registry org returns the reasons or the excluding filter. | unit |
| FR-11 | Repo context: CONTRIBUTING summary (≤120 words, model-generated, cached 24 h), last CI conclusion on the default branch, last merged PR date. | contract test |
| FR-12 | Watch: schedule a re-check at N days (1-14) and post the result into the session. Cancel when the session expires. | DO scheduling test |
| FR-13 | The org registry is configuration (`orgs.json`): login, display name, label alias sets (`firstIssue`, `helpWanted`, `claimed`, `exclude`), default languages, enabled flag. Adding an org needs no code change. | registry validation |
| FR-14 | `GET /health` reports per-org snapshot age, GitHub rate-limit remaining and AI Gateway reachability. | integration |
| FR-15 | No GitHub writes. The token, if any, has read-only public scope. The code has no write endpoints. | code review, CI scope check |
| FR-16 | Organisation filter: the user can restrict the shortlist to chosen registry orgs. `orgs` is a hard filter applied before ranking; per-org candidate counts (before the org filter) are returned so the UI can show them. Refining by org makes no GitHub calls. | unit, UI test |

## Non-functional
| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-1 | Latency | Shortlist ≤4 s p95 warm; refinement ≤1 s p95 | manual timing |
| NFR-2 | Cost | ≤1 Workers AI call per shortlist; inside the free tier at 200 shortlists a day | AI Gateway logs |
| NFR-3 | Freshness | Issue snapshot TTL 1 h; profile 24 h; CONTRIBUTING 24 h | config |
| NFR-4 | Rate limiting | 30 shortlists per IP per hour; 429 with `Retry-After` | unit |
| NFR-5 | Prompt-injection resistance | Issue text passed as data; system prompt says to ignore embedded instructions; output schema-validated; only declared tools callable | adversarial fixture |
| NFR-6 | Privacy | No storage beyond the session DO; sessions expire at 7 days; no handles in logs | code review |
| NFR-7 | Observability | AI Gateway logs; structured logs with request id; `/health` | integration |
| NFR-8 | Testability | Ranker and filters are pure with no I/O; sources are injected interfaces | architecture |
| NFR-9 | Accessibility (UI) | Keyboard-navigable cards, visible focus, contrast ≥4.5:1, axe clean | Playwright, axe |
| NFR-10 | Scale path | On-demand up to 60 repos; scheduled snapshots beyond that (ADR-0005) with no API change | design review |
| NFR-11 | Licence and attribution | Apache-2.0; README credits the analytics platform's label taxonomy | review |
