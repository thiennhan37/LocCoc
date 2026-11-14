# ADR-010: Account-owned session management

Accepted 2026-11-02. AuthService owns session listing and targeted revocation;
Gateway reuses SERVICE_ROUTES.auth (/auth/*). No database migration or mobile UI
change is needed. Existing session expiry remains absolute, 30 days by current
configuration; token refresh does not extend it.

GET /auth/sessions returns only caller-owned, nonrevoked, unexpired sessions with
explicit safe fields and a current-session flag. Stable keyset pagination uses
creation timestamp and UUID, not mutable last-used time. User agent/platform are
unverified client hints; no assertion of a unique physical device or location.

DELETE /auth/sessions/:id locks an owned row, revokes it and all its refresh-token
records in one database transaction. Lock ordering matches refresh (session before
refresh-token records), preventing concurrent refresh from reviving a revoked
session. Publish the existing Redis revocation marker only after commit. Database
authority remains decisive if Redis is unavailable. Never touch another service's
database; NotificationService rechecks session authority before sending push.

Missing/foreign UUIDs share 404. Repeat deletion of an owned revoked/expired session
is a successful no-op. The current session can be revoked; its subsequent requests
receive 401. Both endpoints require an active authenticated account, including for
admins, who receive no access to other accounts' sessions. Existing logout/logout-all
remain available for suspended accounts. This feature is not a long-term audit log.
