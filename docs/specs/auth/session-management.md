# Active sessions and targeted logout

Implementation: spec -> DTO/repository -> service/controller/module -> Gateway
verification -> isolated PostgreSQL/concurrency tests -> builds and live smoke.

All calls use Authorization: Bearer <accessToken> through the Gateway. Identity is
derived exclusively from verified authentication. Responses carry Cache-Control:
no-store. No public userId filter and no administrator override.

## GET /auth/sessions?limit=20&cursor=...

Limit 1–50, default 20. Returns only revoked_at IS NULL AND expires_at>now() rows
for the current user, ordered by created_at DESC,id DESC. A session may remain
valid while its access token needs refresh; this is not an online-presence API.

```json
{
  "items": [{
    "id": "session-uuid",
    "device": {"platform": "android", "userAgent": "client hint"},
    "ip": "127.0.0.1",
    "createdAt": "2026-11-02T10:00:00.000Z",
    "lastUsedAt": "2026-11-02T11:00:00.000Z",
    "expiresAt": "2026-12-02T10:00:00.000Z",
    "isCurrent": true
  }],
  "pageInfo": {"hasMore": false, "nextCursor": null}
}
```

Dates are UTC ISO strings. lastUsedAt reflects session creation/refresh, not every
API request. Platform/userAgent are bounded, sanitized unverified hints; unknown
platform is "unknown". No tokens, hashes, emails or other users' data are returned.
Cursor is base64url JSON containing version, caller ID, exact database timestamp
and last UUID. It is unsigned and not a secret; validation and ownership-scoped
SQL remain mandatory on every page. Timestamp precision is preserved internally.
New sessions are picked up on refresh; expired/revoked rows may disappear between
pages. Page size does not represent the total number of physical devices.

## DELETE /auth/sessions/:id

200: {"sessionId":"session-uuid","revoked":true,"isCurrent":false}.
After a successful first revocation, repeats return revoked:false using another
still-valid session. An owned expired session is also a successful no-op. Missing
and foreign sessions both return 404. Invalid UUID/query returns 400. Invalid,
expired or revoked caller credentials return 401; inactive account returns 403.

Revokes all refresh-token records, including rotated historical tokens, atomically
with the session. A concurrent refresh either finishes before revocation or is
rejected; it cannot leave a usable token afterwards. Redis marker uses the existing
auth:revoked:sid namespace with access-token TTL, after commit. A Redis failure
does not roll back database revocation or expose credentials in logs. Requests
admitted before revocation may complete; already delivered pushes cannot be recalled.
Revoked sessions fail NotificationService's existing session-authority check.

Deleting the current session returns isCurrent:true; the app must clear its local
credential and return to login. Remotely revoked saved sessions require login on
next use. Remembered-account identity can remain on the device. No client UI is
introduced by this API task. Existing POST /auth/logout and /auth/logout-all remain.
Expired session cleanup still runs hourly; no historical-login API is included.

Subsequent history/UI extension: GET /auth/sessions/history and a 90-day retained
projection are documented in login-history.md (ADR-011). The active-list contract
above is unchanged. Active and history cursors now carry a purpose; preexisting
active cursors without a purpose remain valid for the active list only.

Verification: safe fields/filtering, pagination/timestamp ties, bad cursors and
query/UUID validation, missing/foreign ownership, expired/repeat/current revocation,
Redis failure, refresh/revoke races and push authority, through real Gateway/guards
and isolated PostgreSQL schema. No project tables are truncated by tests.

## Verification on 2026-11-02

- AuthService builds successfully. Existing unit suite: 75 passed. Full AuthService
  HTTP/integration suite: 37 passed, including 12 new isolated PostgreSQL/Gateway
  cases for session management, rollback and concurrent revocation/refresh.
- Enable the database cases with SESSION_TEST_DB_URL, then run
  `pnpm --filter auth-service test:e2e`. The suite creates/removes a unique schema;
  its truncations are confined to that schema. With no URL, those cases skip.
- Restarted only the running AuthService to load the new controller; no migration
  or secret/configuration change. Service stdout/stderr is captured under logs/
  as auth-session-management.stdout.log and auth-session-management.stderr.log.
- Live Gateway smoke using newly created verification sessions: list 200 and
  correct isCurrent; foreign session 404; selected revoke 200; revoked access and
  refresh both 401; repeat revoke 200/revoked:false; self-revoke 200/isCurrent:true.
- All verification sessions were revoked afterwards (cleanup of already revoked
  sessions returned 401 as expected). Existing application sessions were not
  targeted. No mobile session-management screen was added.
