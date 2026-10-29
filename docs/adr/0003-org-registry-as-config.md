# ADR-0003 Organisation registry as configuration
Status: accepted · 2026-10-29
Context: label conventions differ across LF Decentralized Trust projects ("good first issue", "skill: good first issue", "help wanted", "beginner"). Hard-coding Hiero would make the tool Hiero-only.
Decision: `orgs.json` lists organisations with label alias sets, default languages and an enabled flag. It is seeded with hiero-ledger, hiero-hackers and LFDT-CLPR. Adding an org is a configuration change.
Consequences: other LFDT projects can be added without code changes. Scale is governed by ADR-0005.
