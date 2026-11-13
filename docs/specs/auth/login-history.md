# Login history

Implement migration/transactional projection -> history endpoint -> settings entry
and mobile screen -> isolated PostgreSQL/Flutter checks -> deployment/build.

GET /auth/sessions/history?limit=20&cursor=... is authenticated and owner scoped.
Uses the existing Gateway /auth mapping, no-store, limits 1–50 and stable creation
timestamp/UUID pagination. Each item has the safe session API fields plus status
(ACTIVE, REVOKED, EXPIRED) and revokedAt (UTC ISO or null). Revoked takes precedence
over expired. History and active-list cursor purposes cannot be interchanged.
No tokens/hashes are returned. Existing DELETE /auth/sessions/:id handles logout.

login_history mirrors session ID, owner, device hints, IP, created/last-used/expiry/
revocation timestamps in the session transaction. No FK from history to sessions;
session cleanup must not erase history. Retain 90 days from creation, plus any older
still-active sessions. Hourly cleanup purges older inactive history. Migration
backfills available sessions. Previously deleted sessions cannot be reconstructed.
Run migration before enabling reader/cleanup (normal migrationsRun configuration).

Mobile path: Profile -> Settings and Privacy -> Login History. Show successful
login time, last session use, expiry, IP and platform (hints, not verified hardware
identity). Current-session and state badges are distinct. Inactive rows have no
logout button. Active rows require confirmation; current logout warns it returns
to login. Other-session logout refreshes history; self logout clears the local
credential while keeping remembered identity and disposes old push/navigation.
Final 401 after token-refresh handling returns the user to authentication. API,
storage and revoke failures must not invent a success. No passwords/tokens in UI.

Verification on 2026-11-02: AuthService builds, 75 unit tests and 43 API/integration
tests passed (18 real PostgreSQL session/history cases). Flutter analyzer clean,
full suite 99 passed, Android debug APK built. Live Gateway history returned 200,
marked the current verification session and reflected selected revocation with
status REVOKED and revokedAt. Verification sessions were revoked afterwards.
AuthService was restarted to apply the additive migration with existing
TYPEORM_MIGRATIONS_RUN=true; it backfilled available sessions. Runtime output is
in logs/auth-login-history.stdout.log and matching stderr.log. Previously deleted
sessions were not reconstructed. Native iOS and physical-device UI/push checks
were not run in this Windows session.

Verification: history survives session deletion, backfill, TTL and active exception,
projection updates/rollback, owner/cursor controls, UI navigation/loading/error/
pagination/revoke confirmation/self logout and refresh-token rotation.
