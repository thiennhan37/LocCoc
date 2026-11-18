# NotificationService

NestJS service on port 8084. Read [ADR-007](../docs/adr/ADR-007-notifications.md),
[contract](../docs/specs/notification/inbox-and-push.md), and
[learning/setup guide](../docs/specs/notification/setup-and-learning.md).

Copy .env.example to a service-local .env and supply real configuration locally.
No real .env or project databases were modified by the implementation.
Email registration now uses a Kafka consumer and a Brevo delivery queue. See
[email registration](../docs/specs/auth/email-registration.md) and
[ADR-024](../docs/adr/ADR-024-email-registration-kafka-brevo.md). Service-local
`.env` takes precedence over root `.env`, where `BREVO_MAIL_API_KEY` can remain.
The email consumer enables automatically when that key exists; a single active
Brevo sender is discovered automatically, or set `BREVO_SENDER_EMAIL` explicitly.
Apply the new email-jobs migration on restart with `TYPEORM_MIGRATIONS_RUN=true`.
Build from repository root: `pnpm --filter notification-service build`.
Run from root: `pnpm start:notification` (builds, then starts compiled ESM).
Run from this directory: `npm run dev` (builds common and the service once, then
starts the server without watch mode).

Tests require NOTIFICATION_TEST_DB_URL pointing to a disposable PostgreSQL database.
The integration suite creates tables/migrations and truncates test tables: NEVER point
it to a project or production database. NOTIFICATION_TEST_KAFKA_BROKERS enables the
real Kafka test, which creates/deletes only its random verification topic.
Run `pnpm --filter notification-service test`. Without DB URL, these tests skip.
