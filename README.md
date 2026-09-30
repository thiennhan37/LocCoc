# LocCoc

This repository is a small starting point for a NestJS user service and a Flutter app. Authentication and application APIs have not been implemented yet.

## Local infrastructure

The Compose stack contains PostgreSQL, Kafka, Kafbat UI and an optional Kafka CLI container. Copy `.env.example` to `.env` and replace the sample PostgreSQL passwords before starting:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d
```

PostgreSQL is exposed on `127.0.0.1:5433` by default. The initialization script creates the `user` database and `user_service` role on a fresh PostgreSQL volume. Kafka is exposed on `127.0.0.1:9092`, and Kafbat UI on `127.0.0.1:9080`. The CLI container uses the `tools` profile.

The initialization script does not re-run on an existing PostgreSQL volume. This cleanup does not remove existing volumes or databases.

If you already have a local `.env`, remove entries that no longer appear in `.env.example`. The ignored `.env` file is not edited by this cleanup; `.env.example` contains the current template.

## Applications

- [user-service](user-service/README.md) starts on port 8081 and currently exposes no application API.
- [MobileApp](MobileApp/README.md) shows a basic login form. It does not authenticate users yet.

## TODO: future identity service contract

The identity service will be designed separately. Before connecting it, define:

- JWT signing algorithm and key rotation; public JWKS endpoint and cache policy.
- Exact `iss` value, accepted `aud` values, token lifetime, and standard claims (`sub`, `exp`, `scope`, `roles`).
- Login, refresh token rotation, and logout endpoints, including request and response formats for the mobile app.
- A provider-neutral `AuthenticatedUser` shape (`userId`, `roles`, `scopes`) and JWT verification for services that later expose protected APIs.
- Role and scope names. No service currently checks any role or scope.

The mobile app currently calls no authentication endpoint. Its login button validates input and displays an unavailable message. There is no development authentication bypass.
