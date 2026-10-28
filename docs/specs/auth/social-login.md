# Mobile social login

## Contract

POST `/auth/social/google` accepts `{ "idToken": "<provider JWT>", "nonce": "<optional exact provider nonce>" }`.

POST `/auth/social/apple` accepts the same body and optional `name` (max 200 characters). Apple name is an untrusted display suggestion, captured only when the Apple identity is first created. Do not send separate email, userId, providerUserId, role or status fields; DTO validation rejects these.

Success: HTTP 200, `{ authenticated: true, user: { id, email, phone, role, status, emailVerifiedAt }, accessToken, refreshToken, tokenType, expiresIn, refreshExpiresIn }`, identical to password login. Sessions and refresh tokens use the existing AuthService/TokenService implementation.

Errors: 400 for invalid/unknown fields; 401 for invalid tokens, nonce mismatch, replay or unavailable accounts; 403 with `code: SOCIAL_VERIFICATION_REQUIRED` when additional verification is needed; 429 after five requests per provider endpoint per IP per minute; 503 for missing provider configuration or unavailable verification infrastructure. Responses never expose provider errors or tokens.

## Configuration and storage

`GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_IDS` are comma-separated exact allowed client IDs (no wildcards). Configure the IDs actually present in your mobile ID token's `aud`; if a mobile SDK also emits a different `azp` (authorized party), include that application's client ID too. Empty configuration disables that provider. Configure existing signing keys, accounts database and Redis as for password login. Never configure JWKS from mobile input.

Migration `CreateIdentities1710000001200` creates `identities`: user_id (FK accounts), provider, provider_user_id, email (nullable signed claim snapshot), created_at, display_name (nullable), is_private_email. Its composite provider/subject primary key enforces uniqueness. It also makes accounts.password_hash nullable for social-only accounts. Run with `TYPEORM_MIGRATIONS_RUN=true` in the auth deployment. Rollback refuses to drop the migration while social-only accounts still exist.

## Android SDK configuration (2026-10-26)

The Flutter app passes the public `GOOGLE_SERVER_CLIENT_ID` build define to
`GoogleSignIn.initialize(serverClientId: ...)`. This must be a **Web application**
OAuth client ID from the same Google Cloud project as the Android OAuth client;
register the Android package name and signing SHA-1 separately. The web client ID
must also be in the backend `GOOGLE_CLIENT_IDS` allowlist. Without a build define,
leave the SDK value null so native `google-services.json` configuration can work.

Android Gradle also resolves the public web client ID from the
`GOOGLE_SERVER_CLIENT_ID` environment variable, root `.env`'s explicit ID, or its
single `GOOGLE_CLIENT_IDS` entry (in that order). It generates only the
`default_web_client_id` string resource consumed by the SDK, so an ordinary
`flutter run` or IDE build does not depend on the PowerShell launcher. The
complete `.env` must never be added to mobile assets. If several backend IDs are
configured, select the web client explicitly for this native fallback.

`scripts/run-mobile.ps1` reads only the required public configuration from root
`.env` and forwards it as build defines. It accepts a single `GOOGLE_CLIENT_IDS`
entry as the server client ID for existing local setups; with multiple allowed
IDs, select the web client explicitly using `GOOGLE_SERVER_CLIENT_ID` or the
script's `-ServerClientId` argument. Never pass the complete backend `.env` to a
mobile build. Missing SDK configuration produces a readable configuration error
instead of displaying the native exception to the user.

## Android USB development and bounded login requests (2026-10-27)

- Local mobile API defaults to `http://127.0.0.1:8080`. Android debug builds
  establish `adb reverse tcp:8080 tcp:8080` for connected authorized devices,
  including emulators, so ordinary `flutter run` reaches the host gateway.
  `10.0.2.2` is an emulator-specific host alias and must not be the default
  for physical phones. A custom `API_BASE_URL` still takes precedence.
- Allow HTTP only in the Android debug manifest for local development; release
  builds must use an explicit HTTPS API URL. Declare INTERNET in the main
  manifest so network access does not depend on a debug-only permission.
- Bound password and Google token exchange requests to 15 seconds, including
  reading the response body. A timeout returns a readable connection error and
  releases the loading state. Never automatically resend a Google ID token:
  retry must obtain fresh credentials and preserve nonce/replay checks.
- Regressions cover stalled requests, retry, late responses after timeout,
  and disabled duplicate login submissions. Native account selection remains
  user-controlled; the network deadline starts at the backend exchange.

## Verification rules

1. Validate input, rate limit and verify JWKS signature/RS256 before trusting claims. Require issuer, audience, subject, issuance and expiry. Reject a future issuance time and a conflicting `azp`.
2. Compare nonce whenever it appears on either side. When the SDK hashes a raw nonce, send the resulting value used in the provider authorization request. Mobile must keep nonce associated with its own outstanding sign-in attempt; do not choose it from a returned token.
3. Atomically consume a SHA-256 digest of the verified JWT signing input in Redis with NX and expiry. Hashing the signed header/payload also rejects alternate encodings of the same signature. No raw ID token is stored.
   Android must request a fresh ID token with a cryptographically random nonce for each interactive login, including retries and login after an app rebuild. Send that same locally generated nonce with the exchange. Use a separate Android platform adapter instance per attempt because the high-level Google singleton accepts its nonce only at one-time initialization. Keep replay rejection enabled; never clear replay markers to make a login pass. A consumed token returns `SOCIAL_TOKEN_REPLAY` with HTTP 401, and mobile must not describe a generic 401 as a locked account.
4. Resolve existing provider/subject first. For a new identity require a verified email from the token. Auto-link only an active, nondeleted account, or create a passwordless active account. Never link using the optional Apple name or a separately supplied email. An unverified email requires an explicit additional-verification flow; this change returns a structured refusal, not an unverified session.
5. Preserve Apple private relay addresses as provided and persist optional first-login name only on insertion. Later email/name changes never remap an existing identity.
6. Create identity/account/session/hashed refresh-token history atomically, using the existing local token signer.

## Implementation checklist

- Entity/migration and transactional identity repository.
- Fixed provider JWKS resolvers and verified-claim model.
- Strict DTOs, social login orchestration and reused session issuance.
- Public controllers and existing gateway prefix.
- Tests with locally signed ID tokens and mocked JWKS HTTP, covering valid tokens, wrong audience/issuer/signature, expiration, nonce, replay, verified linking, blocked accounts, Apple relay/name and normal refresh-token compatibility.

The repository currently has no `.agents/` rules/skills directory; implementation follows root AGENTS.md and existing service conventions.

## Verification commands

```powershell
npm --prefix libs/common run build
npm --prefix auth-service run build
npm --prefix auth-service test
npm --prefix auth-service run test:e2e
npm --prefix api-gateway run test:e2e -- test/social-routing.e2e-spec.ts
```

Tests generate local RSA keys and mock provider JWKS responses; they do not need Google/Apple credentials or live provider access. The HTTP tests use in-memory infrastructure. Deployments still need to apply the migration to their accounts database and configure real mobile client IDs before live sign-in.

Verified locally: common/auth builds; 75 auth unit tests, 22 auth HTTP/E2E tests, 2 gateway social-route tests, and 25 user-service regression unit tests passed. These checks do not claim a live provider or PostgreSQL migration integration test.
