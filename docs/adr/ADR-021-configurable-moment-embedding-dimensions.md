# ADR-021: Versioned embedding dimensions

Accepted for controlled evaluation, 2026-11-17.

Allow Gemini Embedding 2 output dimensions 768/1536/3072. Dimension determines
`gemini2-d{dim}-imgv1-queryv1` and `moments_gemini2_d{dim}_v1`. Python validates
profile/collection consistency, returned vector length and Qdrant schema. Java
validates the same selected profile for index and search responses. Defaults stay
768 until evaluation supports a change. Runtime environment overrides can select
an experimental profile without editing secrets or destroying prior collections.

Use separate collections for comparison/rollback. Preserve authenticated owner,
asset-version fences and authoritative metadata/date checks. Dimension changes
require reindexing/backfill; database ready state alone does not prove presence
in a newly selected profile. Never silently switch dimensions on provider error.
