# Social home, friendship count and account search

Flutter wave 2 (2026-11-11): shared avatars, accessible component themes, retained
social pagination and development-only Debug are documented in
[the implementation plan/report](mobile-wave-2.md). Existing API/discovery and
moment-publishing boundaries below remain unchanged.

Flutter correctness/session follow-up (2026-11-11): see the dependency-ordered
[wave 1 plan and verification](mobile-wave-1.md). Profile friend navigation now
activates the retained Friends tab, inbox return refreshes both counts, and sample
content is labeled as preview instead of appearing as real profile statistics.

Smart search/recommendations are documented in
[smart friend discovery](smart-friend-discovery.md). Product behavior is agreed;
the extension is implemented in source, including name search and a Friends tab.
The legacy behavior below remains supported; see the linked spec for deployment.

Implementation: summary repository/service/controller -> Gateway verification ->
home count/search entry -> profile design -> PostgreSQL/Flutter checks.

GET /users/me/social-summary requires authentication and username completion,
returns {friendCount: integer}. The count matches visible accepted friends, with
no pagination; pending, blocked, suspended, deleted and unnamed users are excluded.
Existing SERVICE_ROUTES.users proxies this through Gateway; no new origin/config.

Home/profile use an unknown placeholder on initial loading or failure, never a
sample count or silent zero. Refresh on resume, pull-to-refresh, profile-tab entry
and return from account/social screens. Tapping the number opens the friends list.

A prominent home search bar opens existing account search with autofocus and
username-prefix validation, debounce, stale-response suppression and pagination.
Results link to a redesigned safe profile. Safe-profile API never returns email,
phone, birth date, auth state or other private account fields. Relationship writes
reuse current server authorization and refresh the displayed state.

Plus indicates adding content later and does not open account search. All moments
APIs, content schemas and publishing are deferred at the user's explicit request.

Verification (2026-11-02): UserService builds; 25 unit tests passed; real PostgreSQL
social/Gateway suite 24 passed, one Kafka-dependent test skipped. Schemas were
isolated and removed after testing. Live Gateway checks using authorized test
accounts antony2 and antony4 returned friendCount=1 each; verification sessions
were logged out. Flutter analyzer clean; full Flutter suite 90 passed, including
exact counts, zero/error/retry, return-from-friends refresh, home search, profile
opening and friend-request action. Android debug APK built successfully at
MobileApp/build/app/outputs/flutter-apk/app-debug.apk. iOS/device UI checks were
not run in this Windows session.
