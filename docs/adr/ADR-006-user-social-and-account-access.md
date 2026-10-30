# ADR-006: User social graph and authoritative account access

Status: Accepted for implementation, 2026-10-28.

AuthService owns account status. Gateway checks every protected request through
an authenticated internal AuthService endpoint, without an active-status cache.
UserService repeats this check so direct requests cannot bypass suspension checks.
Internal endpoints require a deployment-provided INTERNAL_SERVICE_TOKEN (32+ chars),
are not routed publicly, and must use a private network/TLS in deployment.
Requests admitted before suspension may complete. Failure to contact the authority
returns 503; suspended accounts return 403; invalid/revoked sessions return 401.
Logout remains available for suspended accounts; login/refresh enforce status themselves.

Account changes generate a transactional PostgreSQL outbox using triggers, including
existing accounts at migration. Kafka account.events carries versioned snapshots.
UserService applies only newer versions; replay and out-of-order delivery are safe.
The projection filters search; social writes verify the target with AuthService too.

Username is lowercase ASCII [a-z0-9_], 2–30 chars, assigned once after authentication.
NULL represents incomplete onboarding; all social endpoints require completion.
Database checks, unique index and an update trigger enforce this invariant. Renaming
full_name to display_name preserves existing profile names. Deleted names stay reserved.

Requests, friendships and directional blocks are separate PostgreSQL tables. All graph
writes use SERIALIZABLE transactions with bounded retries for 40001/40P01. Partial
uniqueness allows at most one PENDING request per unordered pair; friendship pairs
are canonical and unique. Accept changes request and inserts friendship atomically.
Blocking deletes friendship and cancels pending requests in the same transaction.
This implements correctness without adopting the deferred pair advisory-lock proposal.
Resolved_at is set for every terminal request. Audit reason/actor fields and new spam,
cooldown and idempotency policies remain deferred in quest.txt.

References: [PostgreSQL isolation](https://www.postgresql.org/docs/17/transaction-iso.html),
[KafkaJS producer](https://kafka.js.org/docs/producing).
