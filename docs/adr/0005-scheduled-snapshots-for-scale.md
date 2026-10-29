# ADR-0005 On-demand fetch now, scheduled snapshots at scale
Status: proposed · 2026-10-29
Context: three orgs (about 80 repos) fit a 4 s budget with KV caching. All of LFDT (hundreds of repos) does not.
Decision: v0.1 fetches on demand behind the `IssueSource` interface. v0.2 adds a cron or Workflow refresher that writes hourly snapshots to KV or R2; the agent then reads storage only.
Consequences: wider rollout is an operations change, not an API change.
