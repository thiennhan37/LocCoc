# ADR-022: English visual queries and original-language fuzzy metadata search

Status: accepted, 2026-11-17. Requested by the user after Vietnamese/English ranking differences.

Preserve the user's query in Mobile and Post. Resolve date filters in Post before sending the remaining visual query to Python. Python translates the visual text to English with a configurable Gemini text model before embedding; image vectors and collections remain unchanged. Translation uses the explicitly configured embedding credential, never the image-enhancement key, and each outbound translation consumes the existing query RPM and daily/monthly provider budgets. Cache translations per owner, model and prompt version for 15 minutes. Bound concurrency, input/output and deadlines; treat source text as data. Translation errors use the existing metadata-only fallback (or fail when requireSemantic=true), without echoing provider errors.

Post matches the original, date-resolved query against caption/tags/place using case/accent normalization and bounded token-level edit distance. Exact matches outrank approximate ones; short tokens require exact matching. Scan eligible owner-scoped rows in bounded pages, retain the best 200 text matches, then retain existing fusion and final ownership/state/version rehydration. No SQL extension or database migration is needed.

Mobile retains query text/selection. Each newly submitted query resets the results scroll position after the new result is applied; loading more preserves position and stale responses cannot move it.

Validation: mocked translation/embedding calls verify English provider input, original-query preservation, owner-scoped caching, budgets, malformed output, timeout and fallback. Java tests cover accents, typos, short-token false positives, older matches and access/filters. Flutter regression covers scrolling, stale results and unchanged input. Quality improvement remains a hypothesis until measured on held-out images/queries; do not claim a universal language improvement from routing alone.

Provider API: [Gemini 3.1 Flash-Lite translation/structured output](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite).

## Recovery amendment — 2026-11-18

The reported 1 result for `người` and 0 for `people` exactly match current caption
counts, while all 33 active photos remain indexed and provider usage today is 0.
An IDE launch of Post missed the Node launcher's four protocol defaults. Spring
now loads only those missing defaults from the local AI `.env` for IDE/Maven too;
explicit Post/environment/blank values win, production profiles and an explicit
opt-out disable this convenience. Provider keys and budgets are never imported.

Translation is an optional query improvement. Timeout, malformed translation or
translation-model errors fall back to embedding the original text, preserving
image search. Hard quota/Redis budget failures remain closed. Cache completed
queries per owner and coalesce identical concurrent requests before translation
and embedding; original-language fallback cache expires after 30 seconds. Retain
metadata-only fallback when embedding/index access itself is unavailable, with
safe reason codes instead of silently collapsing all failures into one reason.
