# Smart friend discovery

Updated: 2026-11-10. State: implemented in source; deployment configuration/migration required.

References: [ADR-012](../../adr/ADR-012-smart-friend-discovery.md),
[original user clarification, preserved verbatim](smart-discovery-input-2026-11-10.txt),
[existing social contract](social.md), [existing home/search](home-and-search.md),
[outbox publisher](social-outbox-publisher.md).

This document records the supplied baseline and the user's subsequent product
confirmations, separately from implementation requirements. It is not a claim
of live deployment. Implementation and operations are described below; super-node handling remains deferred.

## 1. Confirmed design direction

| Component | Responsibility |
| --- | --- |
| UserService PostgreSQL | Profile, normalized name, privacy, friendship/request/block, feedback, transactional outbox, final hydration/filtering |
| AuthService PostgreSQL | Authoritative account status; UserService accepts lag in its account projection for discovery |
| Kafka | At-least-once asynchronous projection/invalidation events |
| Neo4j | Minimal User nodes; FRIEND, directional REQUESTED/BLOCKED; graph-scoped 1–2-hop search, background 2–3-hop recommendations, mutual retrieval |
| Redis | Top-K cache, rec_generation, stampede locks, optional feedback cache, search rate limits; optional 1-hop cache |

Suggestion feedback/cooldowns are durable PostgreSQL state, not Redis-only state.

No HTTP-to-Neo4j dual writes. No neighbor-wide cache invalidation. PostgreSQL
block checks are mandatory even when Redis fast guards say the pair is visible.
Recommendable=false excludes a destination, not an intermediate bridge.
Mutual visibility=false excludes that user as an intermediate bridge in new
computations. Existing surrounding cache rankings may expire naturally.

Graph node naming must be mapped once: PostgreSQL snake_case privacy fields to
Neo4j camelCase properties. A default must never be silently inferred from a
missing property during migration or replay.

## 2. Implementation status

| Area | Implemented source |
| --- | --- |
| Schema | SmartDiscovery1794355200000 adds discovery state; DiscoveryRefreshLeases1794441600000 adds priority, request revision, token leases and retry availability to the refresh queue |
| Writes | Existing SERIALIZABLE social transactions lock canonical pairs; relationship triggers snapshot full state; profile triggers normalize/version/snapshot all write paths, including admin/onboarding |
| Projection | DiscoveryRuntime publishes graph-only events, consumes graph/account topics with independent group offsets, bootstraps source users/pairs and applies version-protected Neo4j transactions |
| Reads | DiscoveryRepository/Service implement Vietnamese text+graph search, frozen cursor order, final filtering, cooldowns, privacy and current mutual intersections |
| Cache | Top-500 IDs, generation-checked Lua, ownership-token locks, scheduled/on-demand refresh, 10-minute TTL and conservative 30-second serving budget |
| Infrastructure | Private Neo4j 5.26.33 Community Compose service, authenticated HTTP adapter, persistent volume, health check and three-second database transaction timeout |
| Client | Home search, a separate Friends tab, suggestions/dismiss, privacy settings, mutual detail, cold-start copy/share link and QR; old in-flight responses are rejected after local block |
| Gateway | Existing SERVICE_ROUTES.users covers every route; authenticated HTTP tests verify static routing, identity, safe output and cooldown behavior |

Source: `user-service/src/discovery/`, `user-service/src/social/`,
`user-service/src/database/migrations/1794355200000-SmartDiscovery.ts`,
`MobileApp/lib/features/users/` and Home/settings integration.
The existing `.agents/rules/` and `.agents/skills/` paths were absent during
inspection. Rename policy remains separately documented under ADR-013.
See [deployment, API and recovery instructions](smart-discovery-operations.md).
Local service secrets and live business tables were not modified by verification.

## 3. Read flows and boundaries

### Search

Normalize query once; run graph-scoped 1–2-hop and PostgreSQL global retrieval
in parallel with per-branch budgets. Ensure exact username has a reserved route
through retrieval. Merge IDs, deduplicate, hydrate current fields and recheck
text matching. Filter self, inactive/deleted/unnamed accounts and either block
direction. Apply any future search-discoverability rule only if explicitly added.
Rank eligible candidates, fetch permitted mutual data in bounded batches, and
apply a final visibility check to public mutual evidence. Refill after filtering
within a bounded budget. Text-index and graph pruning limits imply finite recall.

Existing friends and pending requests can remain search results with current
relationship state; recommendation exclusions must not be copied blindly here.
Recommendable=false explicitly leaves name/username search enabled under the
existing visibility and block rules. Rank exact @username first, then name-match
quality, then graph proximity. Do not add tie-strength or address-book signals.

### Recommendations

Background computation prioritizes eligible 2-hop candidates and uses 3-hop
candidates to fill sparse results; rank by connection score within each group.
Fine weights remain engineering follow-ups. Capture rec:gen:{userId} before
computing; Lua atomically compares the captured generation before publishing
rec:{userId} with a configurable initial TTL of 10 minutes. Serve cached IDs through current PostgreSQL filters for
self, accepted friendship, pending either direction, block either direction,
account status/deletion/onboarding, recommendable, active dismissal/cooldown.
No per-request synchronous graph traversal is implied by a cache miss.

No complex coupling of Redis generation to graph projection watermarks is
required, and generations are not persisted in PostgreSQL. A stale worker may
publish after a Redis reset or from a lagging graph; final filtering preserves
endpoint eligibility, while stale ranking influence and underfilled slots are
accepted. TTL is cache lifetime, not a bound on source-data age. Use bounded job
lifetimes and projection-lag monitoring; stop serving recommendations when lag
exceeds the configurable initial 30-second budget. This is an operational policy,
not a latency guarantee. Lag measurement must account for unpublished outbox
work and source-to-projection progress, rather than treating idle consumers as lagging.

Neo4j failure permits existing unexpired Redis recommendations only while graph
freshness remains within that budget, always with PostgreSQL final filtering.
Redis failure or excessive graph lag shows a temporary-maintenance state for
recommendations. Search remains PostgreSQL-only and mutual data is unavailable
during either dependency failure; never represent unavailable mutuals as zero.
Authentication/final PostgreSQL failures remain errors. A cache miss schedules
background refresh and shows a retryable preparing state, not an expensive
synchronous graph fallback or random global suggestions.

Users without friends receive search guidance, copy/share profile-link actions
and a QR code. Search remains at the top of Home; a separate Friends tab contains
the friends list and suggestions. Privacy switches belong in privacy settings.

State lifetime, refresh scheduling and freshness are different: a TTL alone
does not schedule recompute or bound Kafka lag. Periodic refresh/on-demand queued
refresh is needed even for users with no new direct relationship events.

### Mutual friends

Neo4j retrieves candidate mutual IDs in a bounded batch or detail-page query.
PostgreSQL checks current eligibility of each publicly exposed intermediary,
including mutual visibility, status/deletion and viewer block in either direction.
Verify current friendships supporting explanations when exposing them. Return
404 for a blocked viewer/target pair. Authenticated eligible users may open the
permitted mutual list. Hidden intermediaries contribute neither identity nor
count at the final check; verify both current friendships supporting each mutual.
When target C disables mutual visibility, hide the entire mutual section about C
on C's profile and search/recommendation cards, including counts and avatars.
C may still view permitted mutuals on other profiles. The flag also excludes C
as an intermediate bridge in new graph computations. Never present an unfiltered
graph total beside filtered samples or label a partial candidate count as exact.
Super-node-specific handling is deferred.
Stable pagination may legitimately underfill when permissions change.

### Cache invalidation and admitted staleness

Persist business state/outbox first. Pair changes invalidate participants only;
include unfriend/unblock/cancel in the event coverage even though the source's
example list is shorter. Participant cache changes are optimizations, never a
dependency for visibility. Final database reads reject now-ineligible pairs even
while Kafka is unavailable.

After a bridge hides mutual visibility or becomes blocked, old rankings in
third-party caches may still reflect that path. This is the source's accepted
TTL trade-off, not an immediate-erasure guarantee. Removing a hidden avatar/name
does not remove its score influence. Public counts/reasons must obey the final
visibility and current-friendship checks above.

Graph/Redis updates are not atomic across stores. Use independently retryable
steps or separate consumer checkpoints; acknowledge Kafka only with a recoverable
strategy. A duplicate event must not mark invalidation complete before it happens.
Do not claim generation equality guarantees graph freshness. Stale graph-derived
rankings are accepted within the serving policy; PostgreSQL checks remain mandatory.

Account-status projection lag does not weaken caller authentication or existing
target authority checks for send/accept. This distinction preserves ADR-006.
For block, define server visibility at a database snapshot taken after commit,
not retroactive cancellation of reads started earlier. Flutter must suppress
previous in-flight search responses after a local block action.

## 4. Confirmed product decisions

The user supplied the follow-up design and then accepted review questions 1, 2,
4 and 5, choosing 30 days for question 3 (unfriend). Those five review question
numbers are distinct from the historical Q1–Q10 identifiers below.
Q2 remains separately implemented in [display-name-cooldown.md](display-name-cooldown.md).

| Historical ID | Agreed behavior |
| --- | --- |
| Q1 | Backend and Flutter discovery flows; prioritize 2-hop suggestions, use 3-hop to fill sparse results, connection score within each group. Moments remain deferred. |
| Q2 | Rolling 30-day rename policy, free initial naming, unchanged trimmed/NFC names do not count; audited admin overrides preserve cooldown. See ADR-013. |
| Q3 | Recommendable and mutual visibility default true for new/existing users; disabling recommendations still permits name/username search unless blocked. |
| Q4 | Hide a hidden intermediary's identity and count contribution immediately at the final check. Target privacy hides the entire mutual section about that target across profile/search/suggestions, but does not prevent that user viewing permitted mutuals elsewhere. Authenticated eligible viewers only; blocked pairs return 404. Old ranking influence may remain until refresh. |
| Q5 | Search: exact @username, name-match quality, graph proximity. No tie-strength/contact upload. Users without friends get search guidance and copy/share profile link plus QR. |
| Q6 | Dismiss 90 days one way; reject 30 days both ways; cancel 7 days both ways; unfriend 30 days both ways. These suppress suggestions only; search/manual invitations remain available under existing authorization. Pending either way excludes suggestions. |
| Q7 | Initial configurable cache TTL 10 minutes and graph-lag budget 30 seconds. Excessive lag puts suggestions into temporary maintenance; TTL alone does not guarantee source-data freshness. |
| Q8 | Neo4j/Redis failure: PostgreSQL text search remains available, mutual data hidden/unavailable. During Neo4j failure, unexpired Redis suggestions may serve only within the freshness budget and after final checks. Redis failure/excessive graph lag puts suggestions into maintenance. |
| Q9 | Keep the Home top search bar; add a Friends tab with friends and suggestions, plus privacy settings and profile mutual list. Preserve existing username links. |
| Q10 | Add a local private Neo4j Docker Compose service during implementation. Super-node policy is deferred; hosting sizing, image pinning, Top-K and score weights remain engineering follow-ups. |

Cooldown direction for UNFRIEND is bilateral, matching the reviewed pair-level
proposal; the 30-day interval starts at the successful unfriend operation.

### Event and cache contracts selected in the follow-up

- Preserve social.events for notification-service only: version 1
  FRIEND_REQUEST_RECEIVED/FRIEND_REQUEST_ACCEPTED, keyed by friendRequestId.
  Do not send graph snapshots there or replay graph history into notifications.
- Preserve account.events from AuthService, keyed by accountId and carrying
  accountVersion/status. A graph consumer must receive account state independently
  of the existing UserService account-projection consumer's offsets.
- Add social.graph.events with a dedicated UserService graph-projection consumer
  group. PAIR_STATE_SNAPSHOT keys are '<user_low_id>:<user_high_id>'. Canonical
  pair_states rows enforce user_low_id < user_high_id and allocate increasing
  pair_version under a row lock, including safe initialization of absent rows.
  Send/accept/reject/cancel/unfriend/block/unblock snapshot the full pair state
  and write outbox records in the same PostgreSQL transaction.
- USER_PROFILE_SNAPSHOT keys are userId, carrying username, displayNameNorm,
  recommendable, mutualVisibility and independent increasing profileVersion.
  Account/profile versions update only their own fields. Placeholder nodes have
  only id; missing status/privacy never implies active or visible.
- Neo4j retains PairWatermark {pairKey,lastVersion} independently of live edges,
  including after all edges are deleted. Ignore versions <= lastVersion. Apply
  edge changes and watermark atomically with concurrent-writer protection.
- Direct pair mutations and graph pair consumers atomically prune the counterpart
  from each participant's JSON cache, increment rec:gen and preserve remaining PTTL.
  Remaining ready candidates stay visible; refresh runs in the background. Dismiss
  touches only the viewer's cache/generation/queue, never the target. Never fan out
  invalidation to neighbors; durable PostgreSQL feedback and final checks remain
  authoritative if Redis operations fail.

## 5. Implemented discovery APIs and rename policy

- Keep legacy `GET /users/search?username=...&page=...&limit=...` for existing clients.
  Add a separate `q`/cursor mode with mutually exclusive validation and a defined
  stable ordering. First q request omits cursor; later requests reuse nextCursor.
- `GET /users/recommendations` with cursor/limit budget and explicit cache/degraded
  state; `POST /users/recommendations/:id/dismiss` as an idempotent viewer action.
- `GET /users/profiles/:id/mutual-friends` with a bounded cursor and safe profiles.
- `GET/PATCH /users/me/privacy` for the agreed flags.
- Existing profile update enforces Q2 atomically and reports next allowed rename
  time to the client. No extra endpoint is required solely for rename.

Route static names before `:id` catch-alls. All endpoints need authenticated
ownership/visibility checks and tests through Gateway; current `/users/*` mapping
covers them and is verified by HTTP tests against `SERVICE_ROUTES`. No email/phone fields in
public results; recommendations/reasons cannot reveal who blocked whom.

## 6. Implementation checklist

1. Done: product decisions and concrete API/event contracts recorded.
2. Done: append-only migrations for normalized name/backfill/indexes, independent
   profile/privacy version, name timestamp, flags, feedback and relation versions.
   Preserve existing data, usernames, account versions and notification consumers.
3. Done: versioned profile and pair snapshot events in the owning transaction,
   including delete/unblock tombstones; preserve SERIALIZABLE retries.
4. Done: private Neo4j adapter/infrastructure, uniqueness, durable watermarks,
   bootstrap/replay and source reconciliation on service restart, health/progress checks.
5. Done: PostgreSQL final filters + text search, graph search/mutual retrieval,
   bounded workers, atomic Redis generation guards and safe filtering after reset.
6. Done: authenticated controllers/DTOs/Gateway and Flutter screens/feedback/settings.
7. Disposable infrastructure and client verification completed; deployment/rebuild/rollback
   instructions are in the operations guide. Configure secrets/apply the migration
   before enabling this build in the existing running environment.

## 7. Required verification

- Vietnamese accents/đ/Unicode, exact username, common-name recall, renames with
  stale graph names, short queries, empty queries and legacy client compatibility.
- Simultaneous rename attempts, onboarding/admin bypass, monthly boundary; profile
  event cannot overwrite newer AuthService account status or vice versa.
- Existing send/send, accept/cancel, accept/block races and idempotent feedback.
- Duplicate/reordered graph events; deletion/unblock replay; consumer crash between
  graph/cache writes; poison events, multiple publishers and snapshot/live overlap.
- Redis stale worker, lock expiry, generation key loss/restart, stampede, TTL miss;
  stale cache publication cannot bypass final PostgreSQL filters. Verify maintenance
  over the 30-second lag budget and that new cache TTL cannot disguise old source data.
- Dismiss 90-day unilateral, reject/unfriend 30-day bilateral and cancel 7-day
  bilateral cooldown boundaries, durable feedback after Redis restart, and manual
  search/invitations remaining available. Prioritize 2-hop before 3-hop fill.
- Hidden intermediary count/name/avatar/reason, block both ways, recommendable-only
  endpoint filtering, accepted stale third-party rankings and suppressed client
  responses after block. Each 3-hop intermediate must satisfy pruning.
- Target-hidden mutual sections across profile/search/suggestions, viewer access
  to other permitted lists, current supporting friendships and no false-zero counts.
- Fallbacks for each dependency, query timeouts/result budgets, cache-hit/miss
  latency and memory; baseline recall/accept/dismiss/block rates. No 100% recall
  or <50 ms claim before measurement.

## 8. Technical reference checks

### Follow-up hardening implemented (2026-11-10)

The completed follow-up preserves the product decisions and adds: TTL-preserving
candidate pruning (dismiss affects only its viewer), a single global text-search
retrieval followed by PostgreSQL merge/ranking, priority/leased refresh requests,
separate 2-hop scoring and optional 3-hop fill, normalized query validation, and
persistent Flutter tab/pagination state. Refresh claims use short transactions;
Neo4j/Redis computation runs outside PostgreSQL transactions. A request revision
and lease token prevent a stale worker from deleting newer work. On-demand jobs
outrank the periodic sweep; failed/locked computations are retried.

Blocking an existing friend also starts the bilateral UNFRIEND 30-day cooldown;
repeated block does not extend it. Manual search/invitations remain available
after unblock under the existing authorization rules. Validation must reject
queries shorter than two characters after stripping @ and collapsing whitespace.
Environment validation fails early for enabled discovery without Neo4j URL and
password outside tests. No live environment/secrets/data changes are in scope.

- [PostgreSQL 17 pg_trgm](https://www.postgresql.org/docs/17/pgtrgm.html): GIN/GiST
  similarity filtering and GiST nearest-neighbor considerations; choose indexes
  against real query plans, not the extension name alone.
- [Kafka delivery design](https://kafka.apache.org/40/design/design/): partition
  ordering and delivery semantics do not provide cross-store atomicity.
- [Neo4j 5 operators](https://neo4j.com/docs/cypher-manual/5/planning-and-tuning/operators/operators-detail/): inspect expansion/sort cost; LIMIT output is not a graph-work budget.

Implementation verification uses isolated PostgreSQL schemas/database, a disposable
Neo4j instance, private Kafka topics/group and UUID-scoped Redis keys, plus Gateway
HTTP and Flutter tests. Results are recorded in PROJECT_CONTEXT.md. iOS/device
interaction, workload benchmarks and production rollout are not claimed.
