# ADR-0004 Read-only, no accounts, session-only state
Status: accepted · 2026-10-29
Decision: no GitHub writes, no login, no persistence beyond a 7-day session Durable Object; a read-only public-scope token exists only to lift rate limits and its scope is checked in CI.
Consequences: trivially safe to run publicly; "claim" stays a human act, which matches governance norms.
