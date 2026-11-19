# Search recovery after IDE restart — 2026-11-18

## Diagnosis

User reported `người` returning one result and `people` none. PostgreSQL still
contained 33 active/ready photos, and Qdrant still contained 33 points. The
caption counts were exactly one for `người` and zero for `people`. At 08:10 +07,
today's provider request usage was zero, daily cap 100, and AI readiness returned
`PROVIDER_NOT_VERIFIED`; expired temporary budget was not the cause.

Post was running its main class from an IDE. Root/Post environment files lacked
the semantic flag and service credentials, while AI's environment contained
them. The existing application configuration defaults semantic search to false;
only the Node launcher previously inherited the four local AI protocol values.
A regression reproduces the exact one/zero result pattern with
`metadata_only`/`SEMANTIC_DISABLED`. This was loss of the image-retrieval branch,
not deletion of image vectors or a translated date/place filter.

## Changes

- Spring EnvironmentPostProcessor mirrors local launcher defaults for IDE/Maven
  starts: only missing `SEMANTIC_SEARCH_ENABLED`, `AI_SERVICE_TOKEN`,
  `AI_ACTOR_SECRET`, `EMBEDDING_DIM`. Explicit/blank settings win. Production
  profiles and `post.local-ai-config-enabled=false` opt out. No provider keys,
  budgets, `.env` values or secrets were changed.
- Semantic enablement/profile/credential-presence are logged without values.
  Safe unavailable reasons survive to Post's existing search response; unknown
  provider messages/codes are discarded. Mobile's caption-only empty state no
  longer implies a successful search of image contents.
- Optional translation failures/timeouts fall back to embedding the original
  query. Hard quota/Redis budget failures remain closed. Completed-query caching
  runs before translation and concurrent identical queries share both provider
  calls; fallback results expire after 30 seconds.

## Verification and rollout

- Python: 107 passed; focused Ruff clean. Java: 83 total, 81 passed, 2 optional
  integration tests skipped, no failures/errors after correcting a Mockito
  restubbing fixture. Flutter: 7 related tests passed, analyzer clean.
- Built a full JAR in the isolated build directory, verified its copy by SHA-256,
  and restarted only the verified Post and AI processes. Post startup now logs
  `enabled=true`, expected 768 profile, credentials configured.
- Authenticated live internal AI searches, same owner/current 33-photo index:
  `người` HTTP 200 (2576 ms), `people` HTTP 200 (1834 ms). Both returned 33
  candidates; this is candidate retrieval, not a claim that all photos depict
  people. Existing ranking/relevance limitations remain.
- A date-filtered `people` request returned 6 candidates, exactly matching the
  authoritative Qdrant owner/profile/date payload filter (19 ms). Repeating the
  unfiltered query returned in 11 ms. Date-filtered/repeated requests reused the
  query vector; provider reservations increased only from 0 to 4 for the two cold
  queries. AI readiness then returned HTTP 200.
- No images were sent again, no reindexing, account changes, counter resets or
  budget increases. Evidence: ignored `logs/search-availability-20261118.json`,
  `logs/search-recovery-live-20261118.json` and `logs/search-recovery-*`.

The live checks cover the authenticated internal AI API and Post startup
configuration. The public mobile session was not used by this diagnostic harness;
existing Java tests cover final ownership/state/version rehydration.
