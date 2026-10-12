# LocCoc IAM Level 1

This repository now contains the IAM Level 1 platform foundation: an API gateway, auth-service, user-service and shared NestJS security library. Business authentication flows can be added behind the gateway without changing the security bootstrap.

## Monorepo layout

```text
api-gateway/      # public edge: Helmet, CORS, validation, request IDs, Redis throttling
auth-service/     # identity boundary (scaffold for login/token flows)
user-service/     # user boundary
libs/common/      # config schema, filters, guards, decorators and shared interfaces
```

## Local infrastructure

The Compose stack contains PostgreSQL, Redis, Kafka, Kafbat UI and an optional Kafka CLI container. Copy `.env.example` to `.env`, then provide your own database passwords and key paths:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d
```

Install and run the gateway:

```powershell
pnpm install
pnpm --filter @loccoc/common build
pnpm dev:gateway
```

Sau khi dependencies đã được cài, có thể chạy gateway bằng `npm start` trong thư mục `api-gateway`, hoặc chạy từ root bằng `npm start`. Các service còn lại dùng `npm start` trong thư mục tương ứng; từ root có thể dùng `npm run start:auth` và `npm run start:user`.

The gateway listens on `http://localhost:8080`; auth-service defaults to `http://localhost:8000`; user-service defaults to `http://localhost:8081`. `GET /health` on the gateway returns only `{ "status": "ok" }`.

## Gateway routing

Routing is defined in [api-gateway/src/service-routes.ts](api-gateway/src/service-routes.ts) and implemented by `ServiceProxyController`:

| Gateway prefix | Upstream | Configuration |
| --- | --- | --- |
| `/auth/*` | auth-service | `AUTH_SERVICE_URL` |
| `/users/*` | user-service | `USER_SERVICE_URL` |

For example, `POST /auth/login` is forwarded to `POST http://127.0.0.1:8000/auth/login`, while `GET /users/me` is forwarded to user-service. The gateway forwards the method, query string, body, authorization header and `x-request-id`; upstream failures return a sanitized `502` response.

## JWT key setup

Keep keys outside Git (the example uses `../secrets` from each service directory):

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out secrets/jwt-private.pem
openssl pkey -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
```

This implementation uses an RSA key pair and fixed RS256. Set `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH` (or the inline PEM variables with `\\n`) in `.env`; `auth-service` requires the private key to sign, while other services need only the public key to verify.

## Verification

```powershell
pnpm --filter api-gateway test:e2e
```

The e2e contract covers unknown-field rejection (400), route throttling (429), and sanitized 500 responses with `requestId`. Redis must be running for the gateway test.

PostgreSQL is exposed on `127.0.0.1:5433` by default. The initialization script creates the `users` and `accounts` databases with their service roles on a fresh PostgreSQL volume. Redis is exposed on `127.0.0.1:6379`; Kafka is exposed on `127.0.0.1:9092`, and Kafbat UI on `127.0.0.1:9080`. The CLI container uses the `tools` profile.

The initialization script does not re-run on an existing PostgreSQL volume. This cleanup does not remove existing volumes or databases.

If you already have a local `.env`, remove entries that no longer appear in `.env.example`. The ignored `.env` file is not edited by this cleanup; `.env.example` contains the current template.

## Applications

- [user-service](user-service/README.md) starts on port 8081 and currently exposes no application API.
- [MobileApp](MobileApp/README.md) shows a basic login form. It does not authenticate users yet.

## Basic auth flow

`auth-service` now implements email/password registration with email OTP verification:

- `POST /auth/register` creates a pending account and sends a six-digit OTP.
- `POST /auth/verify-otp` activates the account after a valid OTP.
- `POST /auth/resend-otp` applies per-destination and per-IP resend limits.
- `POST /auth/login` accepts only active accounts and returns a generic error for invalid credentials.

Passwords use Argon2id (19 MiB, two iterations, one lane by default). OTP state is stored as a Redis hash with a five-minute TTL. The OTP security policy is versioned in [auth-service/src/auth/config/otp-policy.ts](auth-service/src/auth/config/otp-policy.ts); change its version when changing OTP behaviour so releases remain auditable. Set `TYPEORM_MIGRATIONS_RUN=true` for a deployment that should run the checked-in users migration, and provide a 10k–100k breached-password list through `COMMON_PASSWORDS_PATH` (or `COMMON_PASSWORDS`) for the full password denylist.

Run the auth tests with:

```powershell
pnpm --filter auth-service test
pnpm --filter auth-service test:e2e
```

## Next identity work

Before implementing login and token flows, define:

- JWT signing algorithm and key rotation; public JWKS endpoint and cache policy.
- Exact `iss` value, accepted `aud` values, token lifetime, and standard claims (`sub`, `exp`, `scope`, `roles`).
- Login, refresh token rotation, and logout endpoints, including request and response formats for the mobile app.
- A provider-neutral `AuthenticatedUser` shape (`userId`, `roles`, `scopes`) and JWT verification for services that later expose protected APIs.
- Role and scope names. No service currently checks any role or scope.

The mobile app currently calls no authentication endpoint. Its login button validates input and displays an unavailable message. There is no development authentication bypass.


## Token authentication

`auth-service` issues a 15-minute RS256 access token and a 30-day opaque refresh token. Refresh tokens are generated from the CSPRNG, stored only as SHA-256 hashes in the `accounts` database, and rotated inside a transaction on every refresh. Each device login has its own server-side session, so `/auth/logout` revokes one device while `/auth/logout-all` revokes every device. Changing a password revokes all existing sessions and creates a new session for the current device.

Access tokens are returned in the JSON response. Mobile clients must store the access and refresh tokens in iOS Keychain or Android Keystore; do not write tokens to logs or ordinary app storage. Other services need only `JWT_PUBLIC_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`, and the fixed `RS256` algorithm to verify access tokens.

Refresh-token history is stored in `refresh_tokens`: one row per issuance, containing only a SHA-256 hash, the session ID, expiry, and used/revoked timestamps. Replaying a used token revokes that session and all of its refresh-token history; the revocation commits before the API returns 401. Other device sessions remain active. Concurrent refresh requests with the same token count as replay: only one succeeds, and the resulting session is then revoked. The client must serialize refresh requests and sign in again after a failed refresh; do not retry a consumed token.

Run migration `CreateRefreshTokens1710000001100` on the accounts database. It backfills the current hash of existing sessions. Tokens issued before this migration that were already rotated cannot be reconstructed. Used history is retained until session expiry so ancestor replay can be detected. This change revokes refresh access; JWT access tokens still remain valid until expiry unless the API guard also checks session revocation.
