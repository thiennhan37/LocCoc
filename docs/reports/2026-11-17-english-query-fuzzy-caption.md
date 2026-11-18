# English visual queries, original fuzzy captions, and search scroll

Implemented ADR-022 at the user's request. Public route contracts and image
vectors/collections are unchanged; no database migration or media reupload.

- Mobile sends the original query, preserves text/selection, and scrolls new
  successful search results to zero after layout. Epoch checks exclude stale
  requests; pagination does not reset scroll position.
- Python translates visual text to English using configurable
  `gemini-3.1-flash-lite`, schema-constrained output, bounded concurrency and
  owner/model/prompt-version cache (512 entries, 15 minutes). Each cold
  translation consumes one existing query-budget reservation, followed by the
  existing embedding reservation. No budgets, keys or `.env` values were changed.
- Generation initially returned HTTP 400: provider requires at least a 10-second
  HTTP deadline. Per-call transport now advertises 10 seconds while the local
  application timeout remains unchanged. A real translation then returned
  `người -> person`. Three prior configuration-error requests remain reserved;
  no counters were reset/refunded. Total extra provider reservations in this
  work: four translation attempts and two query embeddings. Model listing was
  read-only. No photos were sent for these checks.
- Post fuzzy-matches the original date-resolved query with normalized
  caption/tags/place. Matching folds case/accents, supports bounded edits and
  transpositions, requires all query tokens and exact short-token matches.
  Eligible rows are read in pages of 200 and the best 200 matches retained;
  older photos beyond the first page are included. Existing fusion and final
  ownership/lifecycle/version rehydration remain in force. Translation failures
  use metadata-only fallback unless semantic search is explicitly required.

## Verification

Python: **105 passed**; focused Ruff checks pass. Java: **76 total, 74 passed,
2 integration tests skipped**, no failures/errors. Flutter: **7 related tests
passed**, focused analyzer clean. All automated tests use mocked providers or
isolated H2/in-memory dependencies, with no paid requests.

Live exact-vector comparison used the same existing 20-image evaluation album,
current 768 collection and two native-768 query embeddings:

| Query | Top three labels | Precision@3 for person as main subject |
| --- | --- | ---: |
| người | mountains, food_table, cat_home | 0/3 |
| person | mountains, person_man, person_outdoors | 2/3 |

This small diagnostic shows improvement for this query; the mountain false
positive still ranks first. Translation is not a complete relevance fix or a
general multilingual benchmark. Ranking evidence is retained in ignored
`logs/query-routing-ranking.json`; translation transport evidence is in
`logs/query-translation-live.json`. Caption-aware hybrid API quality and held-out
query quality have not been measured in this change.

The first normal Maven package attempt wrote a plain JAR but could not repackage
it while the running JVM held the file. Rebuilt a full runtime JAR in isolated
`post-service/target/query-routing-build/output/`, stopped only the verified
Post/AI processes, copied the full JAR to the standard path and verified its
SHA-256 against the isolated build. Post and Python were restarted through the
existing launchers. Verified AI `/health/live`=200 and Post unauthenticated
`/moments`=401 after restart. IAM, Gateway, databases and media were not restarted.
Rebuild/hot-restart Mobile to activate the scroll behavior. Updated backend is
already running; current provider readiness still requires a successful normal
query/canary as designed.
