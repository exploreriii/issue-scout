# ADR-0001 Spec-first, pure core
Status: accepted · 2026-10-29
Decision: each milestone is specified (stories, acceptance criteria, numbered requirements) before code. Ranking, filter and profile logic live in a pure package with no Workers imports, so they are unit-testable and portable.
Consequences: a slower start. The ranker can be reused outside the Worker.
