# ADR-012: Smart friend search and recommendations

Date: 2026-11-10.
Status: Product design accepted, including follow-up confirmations on 2026-11-10;
implemented in source; existing-environment rollout pending configuration/migration. See [the specification](../specs/user/smart-friend-discovery.md).

## Context

LocCoc prioritizes real-world, trusted connections. The supplied
[design clarification](../specs/user/smart-discovery-input-2026-11-10.txt)
selects PostgreSQL + transactional outbox/Kafka + Neo4j + Redis. This ADR records
that direction; it does not replace it with a PostgreSQL-only proposal.

Existing social behavior remains governed by ADR-006/009. Legacy username-prefix search remains compatible. The extension now implements
Vietnamese q/cursor search, graph projection, recommendations, privacy and mutual APIs.

## Baseline decisions

- AuthService remains authoritative for account status; UserService owns profile
  attributes, privacy settings, relationships and feedback in its own PostgreSQL.
  Discovery accepts account-status projection lag. Existing authenticated-request
  checks and authoritative target checks on social writes are preserved.
- Neo4j is a rebuildable graph read projection, never the source for mutations.
  It serves graph-scoped search (1–2 hops), background recommendations (2–3 hops),
  and mutual-friend retrieval. PostgreSQL serves global Vietnamese text search.
- HTTP writes affect only owning-service PostgreSQL and transactional outbox.
  Kafka consumers apply idempotent, version-aware graph changes. Redis holds
  recommendation Top-K, generation guards, locks and optional fast-path state.
- Search merges both branches, then rechecks current text and visibility while
  hydrating profiles from UserService PostgreSQL. Recommendations read Redis then
  recheck self/friend/pending/block/status/privacy/feedback in PostgreSQL.
- Both directions of block are checked at the final database read. Redis and
  Neo4j are not authorization gates. Concurrent reads admitted before a block
  commit may complete; the client must discard stale responses after blocking.
- Inactive, viewer-blocked and mutual-visibility-disabled nodes
  are excluded as intermediate traversal nodes. A nonrecommendable user may
  remain a bridge but cannot be a recommendation target. Direct endpoint
  eligibility is distinct from traversal eligibility. Super-node handling is
  deferred at the user's request.
- Direct pair changes invalidate/refresh only the two participants. No neighbor
  fan-out invalidation. Surrounding recommendation rankings may remain stale
  until expiry/recompute after a bridge disables mutual visibility. Current
  names/avatars and count contributions of hidden bridges must be removed at the
  final PostgreSQL check, including verification of both current friendships.
- Both privacy flags default true. Recommendable=false leaves search available.
  A target disabling mutual visibility hides their whole mutual section across
  profile/search/suggestion cards; they may still view permitted mutuals on other
  profiles. Eligible authenticated viewers only; blocked viewer/target returns 404.
- Search ranks exact @username, name-match quality, then graph proximity. No
  tie-strength/contact upload. Recommendations prioritize 2-hop, filling sparse
  lists with 3-hop and connection-score ranking within each group.
- Durable suggestion cooldowns: dismiss 90 days one-way, reject 30 days bilateral,
  cancel 7 days bilateral, unfriend 30 days bilateral from the successful action.
  Search/manual invitations remain permitted; pending either way excludes suggestions.
  Blocking an existing friend also writes bilateral UNFRIEND feedback in the same
  transaction; repeated block without a friendship does not extend the 30 days.
  Dismiss changes only the viewer's cache/generation/refresh request. Pair actions
  and graph pair consumers prune participants' cached counterparts while preserving
  remaining candidates/TTL, then refresh through a prioritized leased queue.
- Initial configurable cache TTL is 10 minutes; graph-lag serving budget is
  30 seconds. Excessive lag or Redis failure shows recommendation maintenance.
  During Neo4j failure, unexpired Redis suggestions may serve within the freshness
  budget after final checks. Either dependency failure leaves PostgreSQL text
  search available with mutual data unavailable, never a false zero.
- Home retains top search; add a Friends tab with friends and suggestions, privacy
  settings and mutual-list access. Users without friends get search guidance,
  copy/share profile links and QR codes. Add local private Neo4j in Compose during
  implementation. Moments remain deferred.
- Q2 is resolved in ADR-013: rolling 30 days, free initial naming, unchanged
  trimmed/NFC names do not count; audited admin overrides preserve user cooldown.
  Low update frequency does not remove races or the need for profile versioning.

## Implementation requirements, not additional product approvals

Keep existing SERIALIZABLE social transactions and retry behavior. Add complete
graph events without breaking notification contracts. Version relationship state
per canonical pair and profile state per user; account versions remain owned by
AuthService. Commit projection changes and high-watermarks atomically; retain
deletion/unblock high-watermarks to reject stale replay. Kafka partition ordering
alone does not make PostgreSQL, Neo4j and Redis one atomic transaction.

Keep social.events notification-only with its current version-1 request-ID-keyed
contract. Use social.graph.events for canonical-pair-keyed PAIR_STATE_SNAPSHOT
and user-ID-keyed USER_PROFILE_SNAPSHOT with independent profileVersion. Preserve
account.events/accountVersion and consume account state with independent offsets.
Keep durable pair watermarks even when all live edges disappear; placeholder
nodes must not infer active status or enabled privacy from missing properties.

Cache publication compares captured rec:gen:{userId} and publishes rec:{userId}
atomically. Do not couple generation to projection watermarks or persist it in
PostgreSQL. Rare stale publication after graph lag or Redis reset is accepted;
mandatory PostgreSQL filtering protects endpoint eligibility. Old ranking influence
and underfilled slots are accepted freshness costs. Bound worker lifetime and
monitor source-to-projection lag separately: a new cache TTL does not make old
graph data fresh. Do not claim generation equality establishes graph freshness.

Bootstrap from owning-service snapshots with a replay boundary, resume live
events, support reconciliation/rebuild, and expose lag/failure metrics. Existing
outbox retention is not a permanent reconstruction source.

## Consequences

More infrastructure and eventual consistency are explicit trade-offs. Final
filtering protects direct relationships but cannot automatically remove all
ranking influence from an obsolete intermediate path. That temporary influence
is accepted in the supplied clarification; public explanations require their own
current checks. Bounded retrieval/pruning does not guarantee 100% recall.

Implementation is documented in the specification and
[operations guide](../specs/user/smart-discovery-operations.md). Local secrets and
live business data remain unchanged; configure Neo4j credentials, apply the new
migration and restart UserService to roll out. Workload tuning, real-device/iOS
checks and super-node policy remain deferred.
