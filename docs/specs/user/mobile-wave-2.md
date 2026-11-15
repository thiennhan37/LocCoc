# Flutter wave 2 — avatars, design system, social UX and development tools

Date: 2026-11-11. Scope: MobileApp, related specs and PROJECT_CONTEXT.md.
Preserve all dirty wave-1/discovery/backend work. AGENTS.md and current context,
wave-1 report, ADR-012/013, profile/social/notification contracts were surveyed.
The referenced .agents directory remains absent. No new ADR is needed: no owning
service, authorization, Kafka contract, discovery/cache/privacy or session-policy
decision changes. Wave 3, super nodes and moments publishing stay deferred.

## Dependency-ordered plan recorded before implementation

| ID / priority | Current issue → expected behavior | Components/files | Contract / source | Dependencies and risks | Tests / done criteria |
|---|---|---|---|---|---|
| A2 / P0 | Separate permissive image loaders → shared UserAvatar with URL policy, bounded decoding and fallback | core/widgets/user_avatar.dart; Home/profile/Friends/mutual/inbox/chooser | avatarUrl/displayName from current API payloads | HTTPS release; reject missing scheme/invalid host/userinfo; never send app credentials; no image/base64 persistence | Valid URL, invalid URL, missing data, network failure, initials, decode bound and no Authorization |
| V2 / P1 | Remembered accounts lose avatar metadata → optional URL compatible with existing vault v1 | SavedAccount/AccountVault, chooser | GET /users/me avatarUrl; encrypted origin-scoped record | Retain policy and single-use credentials unchanged; sanitize metadata only | Old rows without avatar load; new URL survives restart; no image/base64/AT stored |
| E2 / P1 | Camera badge is inert → explicit supported URL editor | AvatarUrlScreen; profile badge; UserApiClient | PATCH /users/me {avatarUrl}; UpdateUserDto string max 1024 | No upload endpoint; never describe camera/upload; omit name so 30-day policy unchanged | Validation/preview, URL-only payload, busy guard, cancel/failure, update cached profile |
| T2 / P1 | Low-contrast colors and ad-hoc components → coherent Theme | AppColors/AppTheme, common buttons/form and responsive Home parts | Existing LocCoc coral identity | Preserve coral as brand; dark coral for white text and links; darken muted text; avoid fixed row widths/heights | Measured normal-text pairs >=4.5:1; 360px/200% text/long names/keyboard; dialogs/buttons/cards/chips/SnackBars/form |
| S2 / P1 | English labels, duplicate rows/full reloads and button-only profile entry → localized cards, clear search, retained pages | FriendsScreen, mutuals, UsernameProfileScreen | Existing discovery/social APIs and socialRevision/discoveryEpoch | Keep PostgreSQL authority, cooldown/privacy/pending/block/cursor semantics; Settings still opens initialTab:4 | IDs added to set per item; card tap vs action/menu/dismiss isolation; retain pages/cursor/scroll after single-card action and unchanged return; embedded blocked chip hidden |
| N2 / P1 | Inbox ignores timestamps/blank actors and duplicates pagination → local time and safe actor fallback | NotificationsScreen, notification presentation helper | actor snapshot, createdAt; no profile-enrichment request | displayName.trim → @username from payload → generic user; missing timestamp unknown | Local time, fallback names, no per-item profile reads; page dedupe; preserve pages when one notification changes |
| D2 / P0 | Home/profile expose technical details → isolated development-only Debug | developer_tools gate, DebugScreen/JWT helper, typed HomeTab/navigation; push diagnostics | AuthSession metadata; existing coordinator refresh; existing profile/count APIs | kDebugMode AND opt-in flag, never role/hidden button; JWT only observational; mask AT, never show RT/log tokens; split Firebase/permission/device states | Safe bounded decode Demo/malformed, busy guards, stale-session suppression, Force Refresh updates same API/vault/session; default build has no route/tab/actions |
| R2 / P0 | Release exclusion cannot be inferred from debug tests → build release with dev flag intentionally true and inspect artifact | Android release build and verification script/tests | Flutter installed toolchain | Build/signing may be environment-limited; do not edit secrets/config | Verify constant gate plus tree-shaken debug markers in actual release artifact; state device limits |
| Q2 / P0 | Historical results are insufficient → final validation and handoff | MobileApp tests; this spec/context | Current working tree only | Keep existing security assertions, no backend/live calls | dart format --output=none --set-exit-if-changed lib test; flutter analyze; flutter test; scoped diff check; actual counts/results |

## Implementation constraints

Avatar editing is a dedicated URL-only editor using the already-supported DTO;
it does not implement phone/name/password/OTP expansion from wave 3. Clear URL
uses an empty string supported by the current backend string contract.
UserAvatar permits HTTP only in debug for local development, and requires HTTPS
in profile/release. URL metadata is optional and never contains image data.

Debug is an optional fifth bottom item guarded by compile-time
`kDebugMode && bool.fromEnvironment('LOCCOC_DEV_TOOLS')`. Keep compatibility with
legacy Home initialTab:2 by converting once into a meaningful enum; internal
navigation uses that enum. No named Debug route. DebugScreen defensively checks
the gate before rendering or invoking actions. It uses a bounded JWT decoder
only for observation; decoded claims never authorize actions or prove a live
session. Mask AT by default and clear any revealed AT on session/token change.
Force Refresh must call UserApiClient's coordinator-backed operation, not
AuthApiClient.refreshSession directly. Generation fences also protect debug
profile/count reloads and vault metadata writes.

Push diagnostics distinguish Firebase initialization, permission status and
successful current-device registration. Existing ready only describes Firebase
setup. A failed registration, disabled setup, denied permission and unknown state
must not be represented as one successful readiness flag.

## Implemented outcome

- A2/V2: all network-backed person avatars now use UserAvatar (Home, profiles,
  Friends/request/suggestion cards, mutual list, inbox and saved-account chooser).
  It validates absolute scheme/DNS host/port/userinfo/length, rejects inline/local
  URLs, bounds cacheWidth/cacheHeight by display pixels (maximum 1024), sends no
  application Authorization and falls back to grapheme initials or a person icon.
  Release/profile accepts HTTPS; debug also accepts HTTP for local development.
  Version-1 vault rows read without avatarUrl; new metadata stores only a sanitized
  URL and retains existing per-account credential/retention behavior.
- E2: the edit badge uses an edit icon and opens AvatarUrlScreen, labeled as a
  URL editor. Preview and validation use the same avatar policy; PATCH submits only
  avatarUrl, including empty-string clearing. The returned complete profile updates
  Home, ProfileLinkSession and vault metadata with current-session fences. No
  display-name timestamp/name/phone/password or upload behavior changes.
- T2: Theme now covers card/dialog/chip/filled/elevated/outlined/text buttons,
  SnackBar and form styles. Brand coral #FF6B5F remains available with dark text;
  interactive white-text backgrounds use dark coral #B63B32/#963026. Secondary and
  muted text are darker. Common buttons allow wrapping/growing height. Home has
  responsive greetings, sample author/title/gallery/statistics/settings layouts;
  large-text Friends filters scroll horizontally to leave room for the keyboard.
- S2/N2: relationship labels are Vietnamese, search has a clear button, card-body
  taps open profiles while child actions retain their own gestures. Embedded mode
  hides the blocked chip; Settings still opens the standalone initialTab:4 screen.
  A shared merge adds each ID to its set immediately, removing duplicates within
  and across pages in Friends, mutuals and inbox. Single-card social updates and
  notification reads preserve other pages/cursors; unchanged profile returns do
  not reset lists. Authoritative hidden/unavailable mutual responses or 404 remove
  earlier mutual identities. Notification actor labels use trimmed payload fields
  and createdAt is shown in local time, with no profile-enrichment requests.
- D2: Home no longer renders account IDs, role/status badges, token snippets or
  TTL. HomeActionsHeader and HomeNavigation were extracted; navigation uses HomeTab
  internally, with legacy initialTab:2 mapped once to profile. Optional fifth
  Debug item uses flexible equal-width layout. No named Debug route was added.
- Debug requires the compile-time debug+opt-in gate and defensively checks it in
  its screen and action runner. AT is masked until explicit reveal/copy, RT is
  never rendered, token-like claims are redacted and JWT decoding is bounded with
  try/catch. Claims remain explicitly unverified observations. Force Refresh uses
  the existing coordinator, updates API/auth/vault consistently and shares its
  single flight. Profile/count reloads have one busy gate, actual server-result
  validation, generation fences and honest success/failure messages.
- PushDiagnostics separately tracks successful Firebase initialization, nullable
  permission status and server device registration state. It never derives all
  three from ready. Cleanup is idempotent; existing strict retained-session detach
  and no-refresh unregister behavior are preserved. No tokens are added to logs.

## Measured contrast

WCAG relative-luminance formula is exercised by an automated test; values below
are rounded from the actual constants, with a >=4.5:1 assertion for ordinary text.

| Foreground / background | Ratio |
|---|---:|
| White / primary coral #B63B32 | 5.74:1 |
| White / dark coral #963026 | 7.64:1 |
| Secondary text #68615C / main background #FAF8F5 | 5.74:1 |
| Muted text #706A65 / main background | 5.03:1 |
| Muted text / input background #F2F3F5 | 4.80:1 |
| Primary text #24211E / brand coral #FF6B5F | 5.73:1 |

## Actual verification — 2026-11-11

The pre-wave baseline was run from the current worktree: 171 tests passed.

| Command / check | Result |
|---|---|
| `dart format --output=none --set-exit-if-changed lib test` | PASS, 66 files, 0 changed |
| `flutter analyze` | PASS, no issues |
| `flutter test` | PASS, 202 tests, no skipped cases |
| `flutter test --dart-define=LOCCOC_DEV_TOOLS=true` | PASS, 205 tests, no skipped cases |
| Scoped `git diff --check` | PASS |
| `flutter build apk --release --dart-define=LOCCOC_DEV_TOOLS=true` | PASS on final source; APK 55,993,178 bytes |
| `python tool/verify_release_debug.py` | PASS on final APK; no development markers across three ABI libraries |

The default suite executes disabled-gate construction tests; the opt-in suite
instead executes positive panel/reveal/copy/single-flight/busy/stale-response and
five-item-navigation tests, hence the different totals. No tests were removed or
security assertions weakened. Old UI assertions expecting technical Home text now
verify the same underlying session identity and assert that technical text is
absent. English-label expectations were updated to the new Vietnamese labels.

Widget checks cover 360px at 200% text with long names across all four Home tabs,
the five-item development navigation, URL editor/Friends/Demo with keyboard,
avatar fallback and failed image loading, old vault rows, URL-only writes,
deduplication, action/card tap isolation, retained page/cursor/scroll behavior and
notification timestamps/actors without per-item profile enrichment.

## Release exclusion evidence and reproducible commands

The gate is `kDebugMode && bool.fromEnvironment('LOCCOC_DEV_TOOLS')`, with no role
or hidden-button bypass. The release build deliberately passes the opt-in flag.
`tool/verify_release_debug.py` requires AOT libapp.so libraries and no kernel blob,
then checks UTF-8/UTF-16 markers for the Debug screen, navigation content and all
token/reload controls in every packaged ABI. Positive debug widget tests establish
that those controls exist when the development gate is legitimately enabled.
Artifact inspection complements the source gate and tests; it is not a physical
device interaction test. The APK uses the repository's existing release signing
configuration (debug key), not a store distribution signing setup.

Final APK: `MobileApp/build/app/outputs/flutter-apk/app-release.apk`.
SHA-256: `e3fc71b40dbeefa33dfc8ff6c658d925bc24a5176d4f7848b44daf50764264b8`.
Final inspection passed for `lib/arm64-v8a/libapp.so`,
`lib/armeabi-v7a/libapp.so` and `lib/x86_64/libapp.so` with no development markers.
The final rebuild includes the authoritative-hidden mutual-pagination hardening.

Run development tools explicitly with
`flutter run --dart-define=LOCCOC_DEV_TOOLS=true`. Default debug builds hide them;
profile/release builds cannot enable them with this define. API_BASE_URL and FCM
configuration remain as before. Native build emits existing Java native-access and
firebase_core Kotlin migration advisories; no dependency upgrade is included.

## Integration limits / handoff

No backend source/contracts, secrets/.env, live data, Kafka messages or discovery
eligibility/privacy/cooldown/cache policy were changed by this wave. API, native
clipboard/share and Firebase behavior in tests is mocked; no live-user integration
is claimed. Real image-host loading/redirects, Android/iOS device UI, TalkBack /
VoiceOver, push permission/delivery, native secure storage and iOS builds still
require device verification. This Windows checkout cannot establish iOS signing.
The measured palette and widget checks are not a complete accessibility audit.

No new architecture/product approval is needed. Wave 3 phone/IAM ownership,
Google-only password handling, password/logout-all and real OTP-delivery readiness
remain outside this wave. Super-node and moments publishing remain deferred.
