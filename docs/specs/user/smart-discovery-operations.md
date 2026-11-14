# Smart discovery: deployment and recovery

Implementation date: 2026-11-10. No existing local secrets or live business data
were changed during implementation. Super-node policy remains deferred.

## Configure and start

1. Set a new strong `NEO4J_PASSWORD` in the root local `.env` and the same value
   in `user-service/.env`. Do not commit either file. Keep `NEO4J_USER=neo4j` and
   `NEO4J_HTTP_URL=http://127.0.0.1:7474` for host-run UserService. Containerized
   UserService must use its private service address instead.
2. Run `docker compose up -d neo4j`. Compose pins Neo4j 5.26.33 Community, mounts
   `neo4j_data`, binds HTTP/Bolt to loopback, enforces authentication, and limits
   transaction execution to three seconds. It does not publish a public graph API.
3. Apply UserService migrations with `npm --prefix user-service run db:migrate`
   using the existing database configuration. The database owner needs permission
   to install trusted `unaccent` and `pg_trgm` extensions into `public`.
   Apply both SmartDiscovery1794355200000 and DiscoveryRefreshLeases1794441600000.
   The append-only migrations preserve existing names/relations,
   adds default-enabled flags, normalized names/indexes, pair versions, feedback,
   graph outbox, projection offsets, prioritized/leased refresh queue and expiring search sessions.
4. Build/restart UserService with its normal command. Set `DISCOVERY_ENABLED=true`
   (default), `SOCIAL_GRAPH_EVENTS_TOPIC=social.graph.events`,
   `GRAPH_CONSUMER_GROUP=user-service-graph-v1`,
   `DISCOVERY_CACHE_TTL_SECONDS=600`, `DISCOVERY_MAX_LAG_SECONDS=30`.
   Existing Kafka SSL/SASL settings are reused. The graph topic is created with
   three partitions and replication factor one for local development; provision
   production topics/ACLs/replication before rollout.
5. The runtime builds graph uniqueness constraints, pages source snapshots into
   Neo4j, and starts its independent graph/account consumer group from retained
   history. Pair/profile/account versions reject older replay. Recommendations
   stay in maintenance until initialization/progress checks succeed.
6. Ship the Flutter build with the existing Gateway base URL. Existing
   `SERVICE_ROUTES.users` covers all new routes; no additional public service
   address or trusted client header is needed. Home search and the new Friends
   tab use these authenticated routes.

Root `.env` is not automatically UserService's `.env`. Enabled discovery outside
tests requires an explicit valid NEO4J_HTTP_URL and nonempty NEO4J_PASSWORD at
startup; invalid TTL/lag/flags/topic/group values fail environment validation.
Use DISCOVERY_ENABLED=false to start without graph credentials. Empty credentials
cannot enable graph discovery. Text search remains available when graph/Redis is
unavailable; do not bypass final PostgreSQL checks to make a status turn green.

## API contract

| Route | Contract |
| --- | --- |
| `GET /users/search?username=an&page=1&limit=20` | Preserved legacy username-prefix mode |
| `GET /users/search?q=Nguyen%20Dang&limit=20&cursor=...` | NFC/unaccent name + username search; q and username are mutually exclusive; limit 1–50; first request omits cursor |
| `GET /users/recommendations?limit=20&cursor=...` | `state`: ready, cold_start, preparing or maintenance; data, hasMore, nextCursor |
| `POST /users/recommendations/:id/dismiss` | Authenticated idempotent one-way 90-day feedback; 204; active duplicate dismiss does not extend expiry |
| `GET/PATCH /users/me/privacy` | Boolean recommendable and mutualVisibility; caller ownership only |
| `GET /users/profiles/:id/mutual-friends?limit=20&cursor=...` | Available/hidden/unavailable state, nullable count, safe data, hasMore, nextCursor, optional partial |

Search/ready-recommendation cursors point to a two-minute PostgreSQL snapshot of
at most 500 ordered IDs, bound to viewer and normalized query. Every page hydrates
and filters current data again. Frozen ordering avoids offset shifts caused by
graph/cache refresh. Expired/foreign cursors return 400
`DISCOVERY_CURSOR_EXPIRED`; restart the query. The snapshot itself cannot disclose
candidate identities because clients receive only an opaque session ID/position.
The legacy search endpoint retains page/limit behavior. Mutual-detail cursors are
last-seen user UUIDs; use no `page` parameter in cursor endpoints.

Safe profiles may include `mutual` evidence. Neo4j supplies a bounded batch of
candidate mutual identities; PostgreSQL rechecks both supporting friendships,
privacy, account state and blocks against either endpoint. Count is the exact
current permitted PostgreSQL intersection. Samples/list entries are graph-derived
and may lag; `partial=true` reports a gap or the 500-candidate bound. Hidden target
sections and unavailable dependencies never become a numeric zero.

Query validation strips a leading @, NFC-normalizes, trims/collapses whitespace
and requires at least two remaining characters; @a is rejected, while @ab and
Nguyễn   Đặng are canonicalized. Flutter checks the same length before requesting.
The global PostgreSQL text retrieval executes once in parallel with graph search;
a separate bounded merge/rank query rechecks current text/visibility.

Search order is exact username, text-match category, trigram similarity, graph
distance, username, UUID. PostgreSQL pg_trgm's default similarity threshold is
used through its indexable `%` operator. Recommendations use shortest eligible
distance first (2 before 3), score descending within that distance, UUID.
Two-hop score counts eligible distinct common bridges only. Three-hop expansion
runs only if fewer than 500 two-hop candidates exist, excludes those IDs and
fills just the remaining slots with its own path count.
The latter is an initial connection score, not an interaction/tie-strength signal.

Blocking an existing friend removes the friendship and writes bilateral UNFRIEND
30-day feedback in the same transaction. Repeated block without another friendship
does not extend that cooldown; unblock restores no relationship. Manual invitations
remain permitted after unblock, while suggestions remain suppressed until expiry.

Flutter keeps FriendsScreen mounted in Home's IndexedStack, loads it on first
activation, and preserves the selected subtab/loaded pages. Successful sends or
dismissals remove just that suggestion; search updates the affected row in place.
Returning from an unchanged profile does not reset pages; a changed relationship
refreshes that peer. Zero/hidden/unavailable mutual chips are all omitted.

## Refresh, degradation and diagnosis

- Runtime ticks every two seconds. Graph outbox publishes at most 100 records per
  transaction; notification-only `social_outbox` and its publisher are unchanged.
  Graph snapshots can publish out of order across publishers; durable entity
  versions protect the projection. Malformed graph events fail closed and retry;
  they are never redirected into the notification topic or silently acknowledged.
- Runtime compares Kafka partition high-water offsets to PostgreSQL projection
  offsets and includes pending graph-outbox age. The serving budget is a
  conservative time since confirmed catch-up; sustained uncaught-up processing
  may enter maintenance even if individual events are newer. It is an operational
  budget, not a precise per-event latency SLA. Failure of progress monitoring
  itself expires readiness, rather than keeping a stale healthy flag indefinitely.
- With a Neo4j heartbeat failure and no unprocessed events, cache can serve only
  within the configured outage/progress budget and its normal TTL. Redis failure
  immediately prevents cache serving. Neither dependency failure permits mutual
  evidence, but PostgreSQL text search stays available. Local per-process search
  limiting replaces Redis search limiting during failure; Gateway limits remain.
- Monitoring/publishing and recommendation refresh run independently every two
  seconds; a graph computation does not hold up the health/progress loop. Every
  minute a sweep enqueues active accounts at priority 0. Underfilled reads request
  priority 1; misses, direct mutations and applied graph events request priority 2.
  Upserts raise priority and request revision without moving the first queue time,
  so repeated on-demand requests retain their position ahead of idle sweep jobs.
- Each refresh pass claims up to three jobs with a short SKIP LOCKED UPDATE/SELECT,
  gives them 30-second token leases and computes concurrently outside any open
  PostgreSQL transaction. Only a matching lease/revision is acknowledged after a
  successful publication (or a valid periodic cache hit). Locked, rejected or
  failed jobs are retained with a two-second retry delay; new requests survive an
  older worker completing. An expired lease can be claimed by another instance.
- Sending, resolving, blocking, unfriending and unblocking prune the counterpart
  from participant caches with Lua, increment generations and keep the remaining
  JSON IDs/metadata and remaining PTTL. The graph consumer uses the same pruning,
  so delayed/replayed pair events cannot wipe a ready list. Source pair snapshots
  and applied graph events queue participant refreshes; no neighbor invalidation.
  Dismiss prunes/increments/enqueues only the viewer, never the dismissed target.
  Privacy changes may fully invalidate the owner's cache and enqueue refresh.
  PostgreSQL remains the final gate throughout. Cache misses return preparing.
- Workers hold a 15-second Redis lock with an ownership token, capture generation
  before traversal, and compare/publish atomically with Lua. They discard jobs
  taking over ten seconds. Redis generation loss/old graph reads can still admit
  stale rankings; final PostgreSQL eligibility/feedback checks remain authoritative.
- Session/expired-feedback cleanup runs even when graph discovery is disabled or
  unavailable. Published graph outbox rows are retained seven days. Source users
  and durable pair state, not retained outbox history alone, support rebuilding.
- Inspect `graph_outbox` unpublished counts/oldest time and
  `graph_projection_offsets` per topic/partition alongside broker high waters.
  Watch runtime retry/graph-unavailable logs, Neo4j transaction timeouts and Redis
  availability. Logs do not contain event payloads or credentials.

## Rebuild, replay and rollback

Restart UserService to reconcile from current source snapshots. For a lost graph
volume, stop all graph runtimes, provision an empty replacement graph, then
restart every runtime so each finishes bootstrap before serving. Keep PostgreSQL
pair states/watermarks and original event versions; never reset versions or
replay graph events through `social.events`. Independent account/profile versions
must keep their separate ownership. Check readiness/candidate behavior before
allowing graph-backed presentation again.

For a poison event, investigate/fix the producer or event contract and replay via
the graph-only path with valid source versions. Do not skip/commit an unknown
state without reconciliation. PostgreSQL final filters continue to protect reads.

To disable graph discovery, set `DISCOVERY_ENABLED=false` and restart UserService.
Keep the additive schema and migrations: social mutations now use pair locking,
cooldowns and snapshot triggers. Do not run the destructive down migration on
live data to disable a UI. Text search remains available, suggestions report
maintenance (or cold-start guidance for users without friends), and mutual
evidence is unavailable. Existing notification consumers are unaffected.

## Verification

`test/discovery.postgres.e2e-spec.ts` uses a disposable PostgreSQL database with a
unique schema, an isolated Neo4j instance, unique Kafka topics/group and
UUID-scoped Redis keys. Optional inputs: `DISCOVERY_TEST_DB_URL`,
`DISCOVERY_TEST_NEO4J_URL`, `DISCOVERY_TEST_NEO4J_PASSWORD`,
`DISCOVERY_TEST_REDIS_URL`, `DISCOVERY_TEST_KAFKA_BROKERS`.
The Neo4j test instance must be disposable; do not point it at a production graph.
Run `node scripts/verify-discovery-e2e.mjs` from the repository root. It starts
UUID-named disposable postgres:17 and authenticated neo4j:5.26.33-community
containers with generated process-only credentials and random loopback ports,
sets every integration-test environment variable, invokes
`npm --prefix user-service run test:e2e`, then removes both containers even on a
failed test. It does not read/write live .env or business tables. Existing
PostgreSQL/Gateway and notification-outbox tests remain separate within the run.
Flutter tests cover Vietnamese q/cursor behavior, cold-start QR, maintenance,
dismiss, failed privacy saves, hidden/unavailable mutuals, block-response races
and the real Home Friends tab, preserved multi-card suggestions/pagination,
canonical queries and tab retention. Authenticated Gateway tests cover both real
search branches, actual mutual evidence, preparing/ready/maintenance, and
send/dismiss preserving remaining candidates. Queue tests cover concurrent
claims, lease replacement, newer request revisions and Redis-lock skips.
iOS/device interaction and workload benchmarks
remain separate deployment verification.

References: [Neo4j release notes](https://neo4j.com/release-notes/),
[HTTP transactions](https://neo4j.com/docs/http-api/current/query/),
[KafkaJS consuming](https://kafka.js.org/docs/consuming),
[Redis expiry](https://redis.io/docs/latest/commands/expire/).
