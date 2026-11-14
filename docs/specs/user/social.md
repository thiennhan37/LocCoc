# User profiles, search and friendship

Discovery extension (2026-11-10): see [smart friend discovery](smart-friend-discovery.md)
and [ADR-012](../../adr/ADR-012-smart-friend-discovery.md). Product behavior is
agreed and implemented in source. See the linked spec/operations guide for new
q/cursor, recommendations, mutual and privacy APIs; legacy routes below remain supported.

Implementation checklist: migrations → authority/outbox → projection → repository
transactions → services/DTO/controllers → gateway → Flutter onboarding/search → verification.

Authenticated API, under existing /users gateway prefix:
- GET /users/me: synchronize own account snapshot and return private profile.
- POST /users/me/username: {username, displayName?}; one-time lowercase username claim.
- PATCH /users/me: {displayName?, avatarUrl?, coverUrl?, phone?}; username cannot be changed.
- PUT/DELETE /users/me/media/avatar|cover: authenticated own-account image upload/removal.
  See [profile media](profile-media.md) for raw-body format, storage provisioning,
  approved URL origins, image limits and post-commit cleanup.
- GET /users/search?username=an&page=1&limit=20: prefix search, exact match first,
  stable username/id order; 2–30 chars, max limit 50; no sensitive fields.
- GET /users/profiles/:id: safe profile and relationship; unavailable/blocked is 404.
- GET /users/friends: paginated visible friends.
- GET /users/friend-requests?direction=incoming|outgoing: paginated visible pending requests.
- POST /users/friend-requests: {receiverId}; never accept a client-supplied sender.
- POST /users/friend-requests/:id/accept|reject|cancel: authorized PENDING transition.
- DELETE /users/friends/:id: remove friendship without reopening old requests.
- PUT /users/blocks/:id: block, unfriend and cancel pending in one transaction.
- DELETE /users/blocks/:id: remove only caller's block; restore nothing.
- GET /users/blocks: own blocks only, safe profile fields.

Safe profile: id, username, displayName, avatarUrl, coverUrl, relationshipStatus
(NONE/FRIENDS/OUTGOING_PENDING/INCOMING_PENDING), friendRequestId when pending.
Request DTO: id, senderId, receiverId, status, createdAt, resolvedAt, peer safe profile.
Terminal requests cannot be reopened. Existing administrator APIs stay restricted.
Account deletion goes through AuthService (self/admin authorization); its event updates
UserService. Status moderation is an AuthService admin API. Gateway supplies no trusted
identity from client headers and never forwards the internal service credential.

Admin moderation: PATCH /auth/accounts/:id/status with {status: "active"|"suspended"}.
Only a current active admin may use it; self-suspension and activation of an unverified
account are rejected. UserService verifies a target synchronously for social writes.

Config: INTERNAL_SERVICE_TOKEN shared by the three Node services; KAFKA_BROKERS
(default 127.0.0.1:9092); ACCOUNT_EVENTS_TOPIC (default account.events);
AUTH_SERVICE_URL in Gateway/UserService. No real secrets are changed by this work.
These settings must be in each service's own .env (or process environment), not
only root .env. Service-local .env.example files list the new settings.
Apply Auth and User migrations before enabling the feature; TYPEORM_MIGRATIONS_RUN=true.
Run services on private interfaces by default (SERVICE_BIND_HOST=127.0.0.1); container
deployments must explicitly bind and restrict ingress to internal callers/Gateway.

Flutter: after real login fetch /users/me; require username completion before home.
Username links and Cloudflare Pages deployment: see profile-links.md.
Search debounces 350 ms, invalidates older responses immediately on input change,
supports load-more, and refreshes after graph actions/conflicts. Existing demo has
no social API access. Requests refresh expired access tokens through existing auth API.

Verification: builds; existing Auth/User/Gateway suites; real PostgreSQL integration
for migrations, immutable claims, safe search, authorization, state transitions,
send/send, accept/cancel, accept/block and send/accept races; Kafka projection replay;
Flutter analysis/tests for onboarding, debounce, stale responses and pagination.

Run real infrastructure checks with SOCIAL_TEST_DB_URL pointing to a disposable
PostgreSQL database and SOCIAL_TEST_KAFKA_BROKERS to a disposable broker, then:
`npm --prefix user-service run test:e2e -- social.postgres`.
The suite creates and removes unique schemas/topics and never uses project tables.
