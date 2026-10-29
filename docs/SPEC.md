# Issue Scout: specification (v0.1)

## Problem
New contributors to LF Decentralized Trust projects cannot tell which issue to start with. Labels vary between organisations, issues go stale, and nothing matches person to issue.

## Users
- **Newcomer** (primary): has a GitHub account, some languages and limited time.
- **Maintainer** (secondary): wants fewer "where to start" questions.
- **Programme owner** (later): wants claimable-issue counts per organisation.

## Scope
- v0.1: configurable organisations (hiero-ledger, hiero-hackers, LFDT-CLPR); handle or free-text input; top five issues with score, reasons, explanation, effort and first step; next five with "why not"; refine, explain, repo context, watch; no GitHub call on a warm cache.
- v0.2: scheduled snapshots (ADR-0005), maintainer view.
- Non-goals: GitHub writes (claiming stays human), accounts, persistence beyond a session, usage analytics, replacing the hiero.org explorer, semantic search.

## User stories
| ID | Story | Acceptance criteria |
|---|---|---|
| US-1 | Newcomer enters a handle and gets a shortlist | **AC-1.1** A public handle with ≥1 repo returns five issues (fewer, with a message, if fewer exist) in ≤4 s on a warm cache.<br>**AC-1.2** Each has `score`, `reasons[]` (≥1), `repo`, `url`, `labels`, `updatedAt` and an explanation with `fit`, `first_pr_looks_like`, `effort_hours`, `first_step`.<br>**AC-1.3** At most two come from one repository.<br>**AC-1.4** All are open, unassigned and not labelled claimed or in progress at fetch time. |
| US-2 | Newcomer describes themselves instead | **AC-2.1** Text ≤500 characters yields a profile (languages, experience band, time budget), echoed for confirmation, then a shortlist as in US-1. |
| US-3 | Newcomer refines ("only Rust") | **AC-3.1** Re-ranks cached candidates with no GitHub call, in <1 s on a warm cache.<br>**AC-3.2** Excluded issues and repositories never reappear in the session. |
| US-4 | Newcomer asks why an issue is missing | **AC-4.1** For any issue URL in a configured organisation, returns the scorer's reasons or "not a candidate: <filter>". |
| US-5 | Newcomer asks what a repository expects | **AC-5.1** Returns a CONTRIBUTING summary of ≤120 words (or "none found"), the last CI status on the default branch, and the last merged external PR date. |
| US-6 | Newcomer asks to be reminded in N days | **AC-6.1** A scheduled check at N days; the session then shows still open, now assigned or closed. No email, no GitHub write. |
| US-7 | Maintainer sees which labelled issues the scorer rejects (v0.2) | Deferred. |

## Success measures
- Golden test: for 40 recorded issues and three fixture profiles, the top five match the recorded expected rankings.
- Live: for three volunteers, ≥4 of 5 recommendations judged startable.
- Cost: ≤1 Workers AI call per shortlist; no GitHub calls on refinements.

## Open questions
- OQ-1 Experience band thresholds (0 / 1-5 / 6+ merged PRs): confirm against the analytics platform's contributor ladder.
- OQ-2 Is "help wanted" without "good first issue" a first-timer candidate? Default: no, unless band ≥2.
- OQ-3 Which Workers AI model is current for JSON-mode explanations?
