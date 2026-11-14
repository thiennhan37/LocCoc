# Smart Friend Discovery: follow-up verification

Date: 2026-11-10. Branch: feature/friend-suggestions.

All eight requested follow-up categories are implemented. Architecture decisions,
the notification event contract and Gateway routes remain intact. No live .env,
secret or business table was modified. Super-node handling remains deferred.

| Item | Finding and change | Evidence |
| --- | --- | --- |
| 1 — High | DEL-based invalidation removed every suggestion after send/dismiss; pair consumers could repeat the wipe. Lua now prunes only the counterpart, increments generation and preserves PTTL. Dismiss touches the viewer only. Flutter removes/updates one card, retaining the other cards, scroll and pagination. | Real Redis tests verify TTL, empty JSON arrays, generation rejection and untouched target cache. Authenticated HTTP verifies ready lists survive send, dismiss and delayed pair events. Multi-card widget tests verify no preparing flash or extra reload. |
| 2 — High | Search reran global PostgreSQL retrieval when graph candidates existed. It now retrieves global IDs once, then ranks the union through a separate current PostgreSQL filter. | HTTP spies assert one global retrieval and one ranking call with actual Neo4j candidates; exact username, graph distance and real mutual evidence are checked. |
| 3 — High | FIFO sweep jobs delayed on-demand reads; unconditional acknowledgement could discard locked/newer work. Added priority, request revision, lease token/expiry and retry availability via an additive migration. Three workers claim concurrently with SKIP LOCKED and perform network I/O after claim commit. Monitoring runs independently of refresh. | Real PostgreSQL tests verify disjoint claims, demand promotion, replacement ownership, newer revision survival and no open transaction during computation. Redis-lock skips retain their queue row and later publish successfully. |
| 4 — Medium | Mixed 2/3-hop path counts inflated two-hop scores and always expanded three hops. Two-hop score now counts valid distinct common bridges; three-hop fill runs only for remaining slots and excludes two-hop IDs. | Real graph verifies one two-hop bridge plus multiple longer paths still scores 1, below two valid bridges. Unit tests verify no three-hop query at 500 and correct remaining limit/exclusions. |
| 5 — Medium | @a passed raw-length validation; repeated spaces were not canonicalized. DTO, repository and Flutter now strip @ and collapse whitespace before checking two-character minimum. | Unit tests cover NFC/NFD, @a, @@ab, @ab and repeated whitespace. HTTP validates @a=400/@ab=200 and Vietnamese spaced search; widget confirms no request for @a. |
| 6 — Medium | Bootstrap used a concatenated key, topic creation retried existing topics, discovery settings were unvalidated, and block/unblock bypassed unfriend cooldown. Added UUID tuple keyset, listTopics check, typed/conditional configuration validation, and transactional non-extending bilateral unfriend feedback when block actually deletes a friendship. | Build/configuration tests reject invalid settings without exposing values. Authenticated Neo4j bootstrap and Kafka startup pass. PostgreSQL verifies repeated block does not extend cooldown, unblock does not restore friendship, and manual invitations remain permitted. |
| 7 — Medium/Low | Home recreated FriendsScreen; profile return reset loaded pages; profile action placement and zero mutual chips were noisy. FriendsScreen remains mounted with lazy first activation; successful mutations record a revision, profile return refreshes only changed peers, action buttons sit below names, and zero/hidden/unavailable mutual chips are omitted. | Widgets verify subtab/row retention across bottom navigation, multi-page profile return, positive mutual navigation, omission of every nonpositive/unavailable chip, and
rejection of reads started before or during an in-flight block. |
| 8 — High quality | Neo4j tests assumed disabled authentication and lacked live graph HTTP/lifecycle coverage. Added environment-aware credentials, real Gateway/PostgreSQL/Neo4j/Redis/Kafka lifecycle coverage, queue tests and additional widgets. | The disposable runner uses generated credentials, UUID names/topics/keys and invokes the complete npm E2E script with zero skips. |

## Required verification results

| Command | Result |
| --- | --- |
| `pnpm --filter @loccoc/common build` | PASS |
| `pnpm --filter api-gateway --filter auth-service --filter user-service --filter notification-service build` | PASS, all four services |
| `npm --prefix user-service run lint` | PASS, no lint errors/warnings |
| `npm --prefix user-service test` | PASS, 91 tests |
| `npm --prefix auth-service test` | PASS, 77 tests |
| `npm --prefix api-gateway run test:e2e` | PASS, 16 tests |
| `npm --prefix user-service run test:e2e` via `node scripts/verify-discovery-e2e.mjs` | PASS, 94 tests, 0 skipped |
| `flutter analyze` in MobileApp | PASS, no issues |
| `flutter test` in MobileApp | PASS, 121 tests |
| `git diff --check` | PASS |

The E2E runner creates disposable PostgreSQL 17 and authenticated Neo4j 5.26.33
containers and cleans them in finally. Existing Redis/Kafka are used only for
UUID-scoped test keys/topics. Test logs may include expected rejection/failure
cases and the existing KafkaJS timer advisory; all assertions pass.

## Deployment state and limits

- Verified with actual temporary PostgreSQL/Neo4j/Redis/Kafka and authenticated
  Gateway requests; Flutter verification is automated widget/analyzer coverage.
- Current local root/UserService environment files have no Neo4j password; the
  UserService Neo4j URL is also absent. No project Neo4j container is running.
  Enabled discovery will now fail validation early until configured, as requested.
- Apply DiscoveryRefreshLeases1794441600000 after SmartDiscovery1794355200000
  before running this source against the existing database. Configure credentials
  locally and start/restart services according to the operations guide; this
  follow-up deliberately performs no live migration or environment modification.
- No physical Android/iOS UI validation, new APK build or workload/SLA claim is
  included in this follow-up. The 30-second conservative progress policy is
  unchanged. Further workload tuning should follow measured latency/backlog data.

See [operations](smart-discovery-operations.md) and [product specification](smart-friend-discovery.md).
