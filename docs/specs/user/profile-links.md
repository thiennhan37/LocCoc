# Username profile links

Links have the form https://<configured-domain>/<username>. Opening a link only
navigates and reads a profile; sending or resolving a request requires an explicit
button press. The existing authenticated API policy applies: unauthenticated
visitors sign in and finish username onboarding before the original profile opens.

GET /users/profiles/by-username/:username performs an exact lowercase lookup and
returns id, username, displayName, avatarUrl, relationshipStatus, friendRequestId.
States: SELF (no friend action), NONE (send), FRIENDS (Friends), OUTGOING_PENDING
(Request Sent, cancel), INCOMING_PENDING (accept/reject). Hidden, blocked in either
direction, deleted, inactive, or unknown users return the same generic 404.
Read requests never insert requests or friendships. Existing mutation endpoints
remain authoritative; after a mutation or 409 the client reloads the profile.

Flutter handles cold and warm links through its built-in named-route handler,
retains the destination through sign-in/onboarding, and displays a profile screen.
The chosen host is loccoc.bus-ticket.xyz (Cloudflare Pages). APP_LINK_HOST configures the Dart host; Android uses the appLinkHost Gradle property
and iOS uses APP_LINK_HOST plus associated-domains entitlements. The default
host in all three configurations is loccoc.bus-ticket.xyz.

Deployment requires a real owned domain, HTTPS, Android /.well-known/assetlinks.json
with the release package/signing fingerprints, and iOS
/.well-known/apple-app-site-association with the Apple Team ID/bundle ID and single-segment /username
paths. These identifiers are not invented or published by this implementation.
The static browser fallback and association generator live in deploy/profile-links.
The user deployed Pages at loc-coc.pages.dev and configured the custom domain.
On 2026-10-30, HTTPS checks confirmed 200 application/json on the custom domain's
assetlinks.json, matching the current debug APK package and certificate. /nhan_nguyen
serves the browser fallback with HTTP 200. Android association JSON does not encode
URL paths, so changing /@username to /username only requires the rebuilt Android app.

## Cloudflare Pages deployment

1. Obtain the SHA-256 signing certificate fingerprint for the APK being distributed
   (apksigner verify --print-certs <apk>, or Gradle signingReport). Debug and release
   certificates differ; regenerate this file for the actual distributed certificate.
2. From the repo root run:
   `node deploy/profile-links/build.mjs --sha256 "AA:BB:...actual 32-byte SHA-256..."`.
   For iOS append `--team-id ACTUALTEAMID`. The Android package currently is
   com.example.mobile_app, the iOS bundle is com.example.mobileApp; update the
   generator if app identifiers change. Fingerprints/Team IDs are public metadata.
3. Upload the CONTENTS of .codex-output/profile-links-site to a Pages project
   (Direct Upload), including .well-known and _headers. Use a new output folder
   with --output for subsequent builds; existing output folders are rejected.
4. In Pages > Custom domains add loccoc.bus-ticket.xyz. When the DNS zone is managed
   by Cloudflare it can add the CNAME; for external DNS create a CNAME named loccoc
   targeting the exact <project>.pages.dev hostname Cloudflare supplies. Do not use
   localhost or a LAN IP. Register the domain with Pages before creating DNS.
5. Confirm HTTPS 200 and application/json (without redirects/login) on
   https://loccoc.bus-ticket.xyz/.well-known/assetlinks.json and, when generated,
   https://loccoc.bus-ticket.xyz/.well-known/apple-app-site-association.
6. Reinstall the matching Android APK and verify on an actual device, for example:
   `adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://loccoc.bus-ticket.xyz/an"`.
   On iOS enable Associated Domains in the Apple Developer profile and sign a build
   containing Runner.entitlements; test from a message on a real device. Windows
   builds cannot verify iOS signing or universal links.

Default builds now use the chosen host. If changing it, keep Dart APP_LINK_HOST,
Android -PappLinkHost (or gradle.properties), and iOS APP_LINK_HOST in sync.
The profile site makes no API calls and creates no friendship mutations. It does
not contain store download links because the app has no confirmed public store URLs.
The mobile API base URL remains separately configured through the existing auth
client settings; hosting profile links does not expose or deploy the backend API.

References:
- https://docs.flutter.dev/ui/navigation/deep-linking
- https://docs.flutter.dev/cookbook/navigation/set-up-app-links
- https://docs.flutter.dev/cookbook/navigation/set-up-universal-links
