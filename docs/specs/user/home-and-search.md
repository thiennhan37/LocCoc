# Social home, friendship count and account search

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
