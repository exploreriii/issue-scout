# ADR-0002 Deterministic ranking; the model only explains
Status: accepted · 2026-10-29
Context: the recommendation must be defensible to a maintainer and reproducible in tests; LLM ranking is neither.
Decision: a rule-based scorer with reason strings is the source of truth; Workers AI produces explanations from the top five only, schema-validated, degradable.
Consequences: explainability and golden tests; weaker on semantic intent (for example, interest in wallets) until Vectorize (v0.2).
