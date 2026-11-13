# ADR-011: Login history and settings UI

Accepted 2026-11-02. Add Settings and Privacy -> Login History to mobile. The active
session API is not relabeled as history: GET /auth/sessions/history reads a separate
AuthService login_history projection retained for 90 days after session creation
(still-active older sessions remain visible). A transactional session insert/update
trigger captures successful logins, refresh metadata and revocation. It never stores
tokens/hashes. History survives expired-session cleanup; hourly retention removes
only old inactive history. Account deletion cascades history on physical deletion.

Backfill existing session records, without inventing already-deleted history.
Ownership, pagination, safe response fields and no-store rules reuse ADR-010.
This does not record failed login attempts or establish online presence. Timestamps
come from the server; mobile formats in device local time.

History shows active/revoked/expired and current-session badges, pagination, refresh,
errors/retry/empty state and confirmed targeted logout. Self-revocation clears local
credentials, retains remembered identity, disposes push listeners and navigation,
then returns to the account chooser without offering to save the revoked session.
