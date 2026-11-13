# ADR-008: Remembered accounts and device sessions

Status: Accepted, updated 2026-11-02 to match the requested logout interaction.

Account identity is always remembered on mobile. Ask for consent to retain the
server session at logout when no valid retained session already exists. Login has
no remember/retain checkboxes. Home and username onboarding use the same dialog.

Retained logout keeps the server session, detaches device push, atomically saves
its refresh credential with no active account, clears profile/navigation state,
and returns to the chooser. Declining retention revokes the server session while
keeping identity. Cancellation changes neither credentials nor push registration.
A saved account skips the prompt. The chooser separately offers revoking just the
saved session and removing the entire local account entry. Deletion forgets both.

Persist one versioned encrypted vault per API origin using platform secure storage
(Android Keystore-backed encryption / iOS device-only Keychain). Never persist
passwords, Google ID tokens, access tokens or demo credentials. Disable Android
backup; an installation marker prevents iOS Keychain surviving uninstall from
restoring a prior installation's login.

Validate retained credentials with AuthService rotating refresh before entering
ProfileGate. Serialize vault operations/refresh. Consume stored credentials before
rotation and await replacement persistence. Interrupted rotation requires a new
login instead of replaying a possibly consumed token. Detach push strictly when
leaving a server session valid; filter in-flight deliveries by recipient.

No backend endpoints/database changes. Existing server session validation,
rotation and revocation remain authoritative. Biometrics are separate future work.

References: https://cheatsheetseries.owasp.org/cheatsheets/Mobile_Application_Security_Cheat_Sheet.html
and https://github.com/juliansteenbakker/flutter_secure_storage.
