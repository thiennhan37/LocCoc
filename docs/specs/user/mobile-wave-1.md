# Flutter wave 1: data correctness and session lifecycle

Date: 2026-11-11. Scope: MobileApp plus this spec and PROJECT_CONTEXT.md.
Baseline has uncommitted discovery/profile/backend work; preserve it. No backend,
secrets, environment files, live data, Kafka contracts or deployment changes.
The referenced .agents directory is absent in this checkout. Read AGENTS.md,
PROJECT_CONTEXT.md, ADR-008/010 session policies, ADR-012/013 and existing
auth/session, remembered-account, social/home/profile-link and notification specs.
No new architectural decision: extend the existing rotation/revocation mechanism.

## Dependency-ordered execution plan

| ID / priority | Current problem → desired behavior | Files/components | API / source | Dependencies and risks | Tests / completion |
|---|---|---|---|---|---|
| D1 / P0 | Older reports are not current evidence → survey code/tests/Git and document scope before code | This spec; PROJECT_CONTEXT | Auth/User/Notification/Gateway source and tests | Preserve dirty worktree; no .agents files available | Record actual final commands/results; distinguish device/integration evidence |
| S1 / P0 | Generic 401 triggers rotation; old refresh can clear a newer session → shared coordinator, generation fences and one terminal event | GoogleAuthService, UserApiClient, AccountVault, session boundary, ProfileGate/Home/link entry | POST /auth/refresh; GET /auth/sessions?limit=1 | Existing single-use rotation and remembered-account rules; no backend error code for password-vs-session 401 | Single flight across clients; form 401 stays signed in; 403/network/5xx remain nonterminal; lost rotation never replayed; late responses cannot restore/change accounts |
| S2 / P0 | Revocation cleanup is screen-specific → reuse one revocation flow for all authenticated screens | Shared session boundary, Home timers/push, ProfileLinkSession, NotificationApi | DELETE owned session isCurrent:true; refresh rejection | Keep identity, clear only affected credential; push deregistration must bypass refresh and cannot block revoked cleanup | One navigation, stop listeners/timers, invalidate API reads; concurrent revoke/refresh/account switch; other accounts untouched |
| L1 / P0 | Email-or-phone label, broad Demo error action/raw exceptions → Email validation, typed categories, safe messages and Retry-After | AuthResult, AuthApiClient, LoginForm | LoginDto @IsEmail; POST /auth/login/social/google; 429 headers | Do not infer categories from message strings; no password-policy invention in login | Validation, 400/401/403/429, network/timeout/5xx; no Demo shortcut in failure SnackBars; standalone Demo retained |
| P1 / P1 | Header Share pretends copied; duplicate link button → one share entry opens QR/link sheet | Home, ProfileShareCard | GET /users/me username; APP_LINK_HOST | Demo/missing/invalid username cannot fabricate links; clipboard/system share can fail | Clipboard success/failure, system share, missing username, Demo; no false success |
| H1 / P1 | Static avatar/stats/sample feed appear real → profile/avatar/friendCount from API, explicit preview labels | Home | GET /users/me; GET /users/me/social-summary; notification counts | No moments backend; image load failures need fallback; full shared avatar/design system remains wave 2 | Real avatar/fallback; static stats absent for real sessions; previews labeled; narrow/large text |
| H2 / P1 | Profile friends opens duplicate route → retained embedded tab; returning from inbox misses friend count | Home, retained FriendsScreen | Existing socialRevision, cursors and loaded rows; notifications/counts | Preserve subtab/cursor/scroll if no mutation; no discovery eligibility/cache changes | Retained state after profile/inbox/tab navigation; both counts refreshed on return; meaningful mutation still updates affected data |
| V1 / P0 | Historical checks are insufficient → final verification and handoff | MobileApp/test; this spec; PROJECT_CONTEXT | Mocked contracts, local Flutter toolchain | Android/iOS/network push remain unverified unless explicitly run | dart format --output=none --set-exit-if-changed lib test; flutter analyze; flutter test |

## Session contract and safe fallback

AuthService refresh returns 401 for invalid/expired/revoked/reused refresh tokens.
Generic downstream access 401 is ambiguous. It permits a single shared rotation,
not immediate logout. A second access 401 remains nonterminal; it does not on its
own prove revocation. 403, transport failures, timeout and 5xx
are not revocation signals.

POST /auth/change-password returns 401 for Invalid current password without a
machine code. Before rotating for that route, probe GET /auth/sessions?limit=1:
200 means preserve the original form error; 401 allows the normal shared refresh.
Other probe failures remain nonterminal. Do not parse exception message strings.
Future backend-specific error codes would remove this extra probe; backend changes
need a separate decision and are not part of this wave.

Consume retained refresh credentials before sending rotation. If delivery/response
is ambiguous, clear only that durable refresh credential and mark its in-memory
token nonretryable. Keep the access session on transient errors; require fresh
login when further refresh is needed. Never retry a possibly consumed token.
Generation fences apply before/after durable writes and API responses. Ending or
replacing a session invalidates old work before async cleanup; old failures must
not clear a newer account, including another login to the same account.

Revocation reuses the current-session-revoked path and preserves remembered
identity. Push unregister uses the existing AT without refresh; confirmed
revocation does not wait for it. Strict detach on voluntary retained logout remains
required by the existing remembered-account policy.

## Explicitly deferred

Wave 2 design system/shared UserAvatar/vault avatar metadata/debug/social polish;
wave 3 profile phone/password/logout-all/registration/OTP UI. No new ADR, upload
endpoint, OTP delivery claim, super-node work or moments publishing. PostgreSQL
eligibility, privacy, pending/block/cooldown, discovery cursor/cache rules stay intact.

## Implemented outcome

- D1/S1/S2/L1/P1/H1/H2 implemented in MobileApp. All production UserApiClient
  constructors bind the existing GoogleAuthService coordinator. SessionBoundary
  reuses revocation cleanup for Home, onboarding and warm profile links, claims
  navigation once and stops Home timer/push work. History only treats a typed
  refresh rejection as terminal, never an arbitrary protected endpoint 401.
- Rotation and vault writes use generation checks; concurrent revocation cleanup
  coalesces too. Late successful/failed refreshes (including same-account relogin),
  reads and logout responses cannot overwrite a newly accepted account. An
  ambiguous refresh keeps the access session but cannot be refreshed or retained
  again with the old single-use credential. Other saved accounts remain intact.
- Header Share is the single own-profile entry. It opens ProfileShareCard with
  validated username, configured-domain link, QR, clipboard and native sharing.
  Demo/missing username cannot invent a public link. Clipboard failures are caught.
- Real Home/profile avatars use HTTPS URLs from the API profile with bounded
  decode size and initial fallback; no application authorization header. This is
  local correctness work, not the shared UserAvatar/vault metadata of wave 2.
- Real profiles no longer show the 128/24 sample statistics or sample biography.
  Moments/feed/gallery content has explicit preview labels. Friend count stays
  unknown on error. Inbox/push-open return refreshes notification and friend counts.
  The profile friend entry activates the retained tab without resetting its subtab.
- Login follows Email LoginDto and accepts the server's password validation rather
  than inventing a six-character login policy. Errors have typed categories, bounded
  safe messages and numeric/date Retry-After support. Demo has a standalone entry,
  no failure SnackBar action, no asserted authenticated/verified status and no use
  of the user's typed email as a pretend Demo identity.
- Fixing the 360px/200% text/keyboard login test required wrapping the Google
  button label and allowing its height to grow. Design-system work remains deferred.
  Whole-tree dart format also normalized existing formatting in theme, text-field,
  divider/logo and account-deletion test files; their behavior is unchanged.

## Verification log — 2026-11-11

| Check | Actual result |
|---|---|
| `dart format --output=none --set-exit-if-changed lib test` | PASS, 53 files, 0 changed |
| `flutter analyze` | PASS, no issues |
| `flutter test` | PASS, 171 tests, no failures/skips |
| Scoped `git diff --check` | PASS |

Tests cover clipboard success/failure, native share invocation, invalid username
and Demo, real-avatar URL/fallback, typed login errors/Retry-After/no Demo bypass,
shared rotation, password-401 probe, nonterminal 403/network/5xx, lost rotation,
late reads/logout/refresh after account replacement, coalesced revocation and
one navigation, retained search pages/cursor/scroll and both counts on inbox return.
Existing discovery/privacy/block, account deletion, login history and secure-vault
tests remain. No assertions were removed to bypass security checks; tests expecting
raw internal exceptions or Demo in failure actions now assert the requested safe
behavior. The deep-link fixture distinguishes social-summary from profile reads.

The first ordinary Flutter command could not write its SDK cache under workspace
permissions and was stopped; subsequent checks ran with approved SDK-cache access.
That first command did not establish a pre-change baseline. Counts above are from
the actual final suite, not PROJECT_CONTEXT's historical reports.

API/native channels are mocked by Flutter tests. No live backend calls, project
data, migration, real .env, secret or backend source changes were made in this wave.
No new Android APK/release build or iOS build was made. Device clipboard/share
sheets, deep-link associations, FCM/APNs delivery and Keychain/Keystore behavior
still require real Android/iOS checks. Layout evidence is the login widget at
360px, 200% text and visible keyboard; a complete device UI/accessibility audit
belongs with wave 2. No release/debug exclusion claim in wave 1.

## Remaining contract gap / decisions

No product or backend decision blocks wave 1. AuthService's password-vs-session
401 ambiguity is handled by the existing-session probe above; exact machine
codes are a possible future backend improvement requiring separate scope.
Wave 2/3 and their production OTP/phone/password-provider checks remain deferred.
