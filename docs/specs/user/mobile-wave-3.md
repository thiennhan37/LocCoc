# Flutter wave 3 — account actions against actual contracts

Follow-up, 2026-11-12: the historical URL-only photo editor below is extended by
[profile media](profile-media.md) and ADR-014 with library/camera avatar and cover
upload/removal. This wave's historical validation and other account contracts are
unchanged; current media validation and provisioning are recorded in that spec.

Date: 2026-11-11. Scope: MobileApp, this spec and related context/spec updates.
Preserve existing dirty wave-1/2/discovery work. No backend, .env/secrets, live data,
Kafka, discovery/privacy/cooldown or deployment mutation. AGENTS.md/context and
current Auth/User/Gateway/OTP source/DTOs/tests were surveyed. .agents is absent.
No new ADR: extend existing coordinator/session boundaries and owning-service APIs.

## Dependency-ordered plan (before implementation)

| ID / priority | Current issue → expected behavior | Components/files | API / data | Dependencies / risks | Tests / completion |
|---|---|---|---|---|---|
| C3 / P0 | Endpoint existence can mask missing contracts/infrastructure → record actual eligibility | This spec, context, existing Auth/User DTOs/policies/OTP binding | AuthController/AuthService/PasswordService/ConsoleOtpSender; User projection | Never infer readiness from old reports or a successful HTTP status | Actual baseline/final commands; explicit blockers below |
| E3 / P1 | EditProfile is name-only, avatar editing separate → edit supported name/avatar fields together with preview | EditProfileScreen, shared avatar field, UserApiClient | GET/PATCH /users/me; existing avatar string <=1024; ADR-013 30-day name policy | Omit unchanged name on avatar-only save; no upload or phone mutation | Avatar validation/preview/clear; exact payload; cooldown conflict/atomic failure preserves input; busy/keyboard tests |
| P3 / P0 | Phone is writable projection DTO but ownership is ambiguous → display account phone read-only | EditProfileScreen; this spec | Auth accounts.phone → AccountSnapshot/account.events → users.phone | SocialRepository.project overwrites on newer account_version; no distinct contactPhone contract | No phone field in PATCH; no verification badge/claim |
| M3 / P0 | No supported password UI/session replacement → current-password form with full known rules and server authority | password policy helper, ChangePasswordScreen, coordinator/UserApiClient, Settings | POST /auth/change-password {currentPassword,newPassword}; new TokenPair without user | Google login does not prove password absence; no hasPassword/set-first-password endpoint; no replay after ambiguous response | Form 401 probes session; no logout for wrong password; 400/409/429 safe errors; no raw errors; current identity merged into strict pair; retained/identity-only choice preserved |
| S3 / P0 | Password changes revoke all old sessions and issue new sid → invalidate old requests and replace authenticated client/navigation once | GoogleAuthService, SessionBoundary, Home, push drain, AccountVault | Existing rotation and new pair | Serialize against refresh/security actions; preserve other accounts; lost/malformed response is ambiguous; storage failures must be honest | Concurrent refresh/password; old request/refresh/logout cannot restore old session; new API/auth/vault consistent; stop/drain old push registration before fresh Home starts |
| L3 / P0 | No logout-all UI → confirmed server operation with busy guard and existing teardown | coordinator/UserApiClient, Settings | POST /auth/logout-all → {revokedSessions:number} | Current account only; no retain dialog after server revocation; network failure is not confirmed logout | Cancel/confirm/double tap, rejection retains session, success clears only current credential and routes once |
| O3 / P0 | ConsoleOtpSender is not email/SMS infrastructure → keep real signup/OTP closed and record prerequisites | Documentation; no public signup/OTP entry | AuthModule OTP_SENDER → ConsoleOtpSender; register/verify/resend DTOs | Production sender is a no-op; registration reveals userId only for new account; OTP responses lack structured cooldown/attempt codes | No live OTP claim, no manufactured AuthSession; future verified:true/tokenless login transition and generic errors/cooldown requirements recorded |
| Q3 / P0 | Historical green counts insufficient → current test and release regression | MobileApp/test, release verification, specs/context | Mocked contracts only | Preserve prior security assertions; device/native integration separate | format check; flutter analyze; flutter test default + opt-in Debug; release with dev flag true and AOT debug-marker inspection |

## Evidence and implementation boundaries

### Phone belongs to IAM, not a second contact field

AuthService Account has phone; normalizePhone/register own its international format.
UserService GET /users/me synchronizes AccountAuthorityClient's AccountSnapshot
through SocialRepository.project. That SQL inserts/updates users.phone from
EXCLUDED.phone when account_version advances. The account.events consumer uses
the same projection. UsersRepository.updateProfile currently accepts dto.phone,
but a later account projection can overwrite that edit. No separate contactPhone
or authenticated phone-change/phone-verification contract exists. Therefore this
wave sends no phone mutation and asserts no verified-phone status.

Possible follow-up decisions: (1) Auth-owned phone change with recent reauthentication,
OTP delivery, unique-number checks and account.events versioning; or (2) a separately
named User-owned contactPhone column/DTO with no IAM verification meaning. Both
require backend scope/product approval before implementation.

### Password policy and provider gap

ChangePasswordDto requires currentPassword length 1–128 and newPassword 10–128.
PasswordService additionally blocks normalized common passwords, built-in common
prefix variants up to prefix+8 characters, email/local-part matches, and deployment
COMMON_PASSWORDS / COMMON_PASSWORDS_PATH entries. It does not require invented
uppercase/digit/symbol rules. UI checks known deterministic rules and explains that
the server may reject additional common passwords; server remains final authority.
The global exception filter does not forward policy error arrays, so 409 gets a
safe general policy message, not string-parsed exceptions.

publicAccount only exposes id/email/phone/role/status/emailVerifiedAt. A Google
login may link to an existing password account, so neither login method nor JWT
claims establish hasPassword. A Google-only account has no valid current password;
the form explains this limitation and does not offer a fake first-password/reset
action. Future Auth-owned security capabilities (hasPassword/providers) plus a
recent-Google-reauthenticated set-first-password contract need separate scope.

### Replacement, ambiguous response and saved session consent

AuthService.changePassword locks the account, verifies current password, validates
policy, updates the hash, revokes all old sessions/refresh tokens and creates a new
session in one transaction. Response is {message,...TokenPair}, no complete user.
Merge only the strict token fields with the current identity; reject mismatched
identity if unexpectedly supplied. Do not decode JWT claims for authority.

The shared coordinator serializes security mutations and existing single-flight
refresh. A protected mutation 401 probes GET /auth/sessions?limit=1 for the password
form; 200 means form error, 401 permits one coordinated refresh before the guarded
request retry. Do not retry an ambiguous password POST. On lost/malformed successful
response the client cannot know whether the password changed; preserve access
state, mark the old refresh credential nonretryable and erase it from the vault, show an
uncertain-result message and offer explicit reauthentication. Never report success.
If device storage itself fails, the in-memory replay fence still applies, but
durable credential erasure cannot be confirmed; this is not a storage-recovery
guarantee. A later server rejection remains authoritative.

On a strict successful pair, advance the lifetime generation, keep saved identity
and current retain selection, replace only that account's saved credential, reject
all old API results and publish one shared replacement event. Rebuild ProfileGate /
Home with a fresh UserApiClient. Stop old listeners/timer and drain any in-flight
device registration before the new Home registers the installation for its new
sid. Old push cleanup must not attempt refresh with revoked tokens. If saving the
new retained credential fails, continue with the new in-memory session and report
that persistence is not confirmed; never restore the revoked credential or tell
the user to retry a password change already acknowledged by the server.

The client drains the known pending registration future; this is not proof of
server write order if an old HTTP PUT times out while its server transaction keeps
running. NotificationRepository currently upserts installation ownership without
a conditional binding version. Delivery workers check authoritative session
revocation, so the old revoked sid must not receive new delivery. Strong ordering
of such late writes needs a separate backend binding contract; native push and
that timeout race are not claimed as integration-verified here.

Logout-all uses the existing authoritative revocation teardown, preserving identity
and all other saved accounts. No new independent logout/navigation mechanism.

### Signup / OTP is not eligible for live UI yet

AuthModule binds OTP_SENDER to ConsoleOtpSender unconditionally. In production,
ConsoleOtpSender.send performs no delivery; outside production it logs a code.
No actual SMTP/SMS provider binding or delivery confirmation exists in this source.
Do not expose a public flow or claim a message was sent in this wave.

Prerequisites before opening it: install/configure a real provider without committing
secrets; verify owned-domain email/SMS delivery and production binding/failure paths;
normalize generic registration/resend outcomes (including userId leakage); provide
structured Retry-After/cooldown/attempt semantics instead of parsing exception text;
verify throttling and enumeration behavior. Backend OTP policy is 300-second TTL,
5 attempts, 60-second resend interval, 5 sends/destination/hour and 20 sends/IP/hour.
Some OTP limits currently become unstructured HTTP 429 messages; verifier returns
HTTP 200 with verified:false for wrong/expired/exhausted codes.

Future UI must read verified === true, never treat HTTP 200 alone as verification,
never create AuthSession from this tokenless response, then return to login. Its
60-second countdown is UX only; server limits/Retry-After prevail. Wrong/expired /
attempt-exhausted/resend errors must stay generic and reveal no account existence.
No new signup/OTP screen is counted as implemented in this wave.

## Implemented behavior

- E3/P3: EditProfile combines display name and avatar URL with shared validation,
  preview and clear-to-initials. Avatar-only updates omit displayName and phone;
  a combined rename rejected by cooldown preserves input and has no partial UI
  success. IAM phone is read-only. Existing name-policy tests remain intact.
- M3/S3: password form validates the actual known policy, handles wrong current
  password as a form error after session probing, and honors Retry-After. The
  shared coordinator serializes password/logout-all against refresh. Strict new
  pairs retain current identity and saved-session consent, invalidate old API
  responses and rebuild the authenticated route once. Old Home work stops and
  pending push registration drains before new Home registration. Malformed/lost
  responses never report success or automatically replay a password POST/old RT.
  Acknowledged changes with storage failure continue in memory with an explicit
  persistence warning; optional profile metadata caching cannot hide that session.
- L3: Settings exposes confirmed logout-all, blocks repeat actions and uses the
  existing terminal-session boundary. Success removes only the current credential;
  other saved accounts and remembered identity remain. Failed/ambiguous requests
  do not fabricate successful logout.
- O3: no public signup/OTP flow, phone edit, upload or first-password action was
  added. Conditions above remain required. No backend contract/configuration was
  changed and no new ADR is necessary for the implemented client behavior.

## Actual verification / handoff — 2026-11-11

- Baseline actually rerun before implementation: 202 Flutter tests passed.
- Added 43 account-security domain/coordinator and UI tests (31 + 12), including
  password policy, strict identity merge, known/unknown errors, refresh/security
  serialization, ambiguous rotation safety, storage failure, account switching,
  old request rejection, push registration order, one replacement navigation,
  logout-all confirmation/consent, avatar payload/cooldown and 360px/200% text with
  keyboard. Existing security assertions were preserved.
- `dart format --output=none --set-exit-if-changed lib test`: PASS, 71 files,
  0 changed. `flutter analyze`: PASS, no issues.
- `flutter test`: **245 PASS**. `flutter test
  --dart-define=LOCCOC_DEV_TOOLS=true`: **248 PASS**, no failed/skipped cases.
- `flutter build apk --release --dart-define=LOCCOC_DEV_TOOLS=true`: PASS.
  `python tool/verify_release_debug.py`: PASS; AOT libraries for arm64-v8a,
  armeabi-v7a and x86_64 contain none of the development UI/action markers.
  This complements compile-time release gating; it is not a real-device UI test.
  Artifact: `MobileApp/build/app/outputs/flutter-apk/app-release.apk`, 56,026,254
  bytes, SHA-256 `10aa678385223ca2048c3149c0a6ee16850153d256e9c36c718f5649fced0a08`.
  Existing local signing is used, not store signing. Java native-access and
  firebase_core Kotlin migration advisories remain; dependencies were not upgraded.
- No live API mutation, OTP delivery, real-device Android/iOS UX, external image,
  native push, secure-storage or iOS signing/integration claim. Test transport and
  storage are controlled fixtures. Google-only password capabilities, IAM phone
  changes and OTP delivery require the separate contracts/infrastructure above;
  none is presented as completed merely because an endpoint exists.
