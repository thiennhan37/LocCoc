# Email registration and OTP

## Flow and API

1. Flutter opens registration from Login and submits `POST /auth/register` with email/password. Response: generic message, random `registrationId`, `expiresIn: 300`, `retryAfter: 60`. No tokens or account-existence indicator.
2. Auth creates/reuses a pending account, binds the candidate password to a Redis challenge, and enqueues encrypted `EMAIL_OTP_REQUESTED` in `auth_email_outbox`.
3. Auth publisher sends to `auth.email-otp.v1`. Notification consumer validates the envelope and writes `email_otp_jobs` with event-ID uniqueness. Delivery worker calls `https://api.brevo.com/v3/smtp/email`.
4. Flutter submits `POST /auth/verify-otp` with email, registrationId and six-digit otp. Only `verified: true` means activation succeeded. Return to login; credentials are never persisted by registration.
5. Resend uses `POST /auth/resend-otp` with email and registrationId. New code replaces the old one; challenge lifetime is one hour. Expired/missing challenge requires a new registration.

All endpoints already use the `/auth` gateway route, including the Spring gateway. No new public notification endpoint or direct mobile-to-service connection is introduced.

Compatibility: email OTP verification/resend now needs `registrationId`; update clients together with auth. Legacy unbound email OTPs cannot activate an account: start a fresh registration. Active accounts, passwords and sessions retain their existing behavior. The Flutter registration UI and Postman collection use the new contract.

## Configuration

Auth and notification read their local `.env` then root `.env`. Reuse `BREVO_MAIL_API_KEY` in root. Set `BREVO_SENDER_EMAIL` to an active verified Brevo sender, or omit it if Brevo has exactly one active sender (discovered through the authenticated senders API). Optional `BREVO_SENDER_NAME` defaults to LocCoc. Email delivery starts automatically when the key exists; `EMAIL_OTP_ENABLED=false` disables it and `true` explicitly enables it. Configure `OTP_EVENTS_TOPIC` identically (default `auth.email-otp.v1`). Existing `KAFKA_BROKERS`, `KAFKA_SSL` and SASL credentials apply. Empty service-local values override root values, so omit `BREVO_MAIL_API_KEY` in the service file when using the root key.

`OTP_EVENT_SECRET` is optional (at least 32 characters); otherwise encryption and OTP HMAC keys are purpose-derived from the shared `INTERNAL_SERVICE_TOKEN`. Both services must resolve the same secret. Keep a key stable while unexpired jobs exist. Restrict Kafka topic ACLs/retention and database access even though payloads are encrypted.

Run auth migrations using `npm run db:migrate:auth`. Notification startup applies migrations when `TYPEORM_MIGRATIONS_RUN=true`; disable the flag again after the controlled migration. Email jobs/outbox are cleaned after expiry; poison Kafka payloads are quarantined using metadata only. Logs never include Brevo response bodies, OTPs, passwords or API keys.

## Verification checklist

- Registration → pending login denied → OTP verification → password login succeeds.
- Wrong/expired/replayed OTP denied; parallel verification succeeds once.
- Pending re-registration binds the verified attempt's password; active accounts are never overwritten.
- Resend cooldown, per-email/IP quotas, challenge ownership and old-code invalidation.
- Encrypted outbox, Kafka envelope validation, duplicate ingestion, worker retry/expiry and Brevo error handling.
- Flutter form validation, OTP errors, resend countdown, retry after network failure and email-prefilled return to login.

Run the isolated real-infrastructure integration test from `auth-service` in PowerShell:

```powershell
$env:EMAIL_OTP_INTEGRATION='1'
pnpm exec vitest run --config vitest.config.e2e.ts test/email-registration.integration.e2e-spec.ts
```

It reads existing local database/broker settings, creates random schemas in both service databases plus a private Redis namespace/Kafka topic, and cleans only those test resources. Provider delivery uses a controlled test sender; no real email is sent. Other database suites retain their own disposable-database requirements.

## Delivery diagnostics

From repository root run `node scripts/inspect-email-otp.mjs`. It reads queue metadata, masks recipient addresses and checks Brevo's transactional event history without sending email or exposing codes/credentials. `result=sent` means Brevo accepted the HTTP request; the provider's `delivered` event confirms the recipient mail server accepted it. This does not guarantee placement in the main inbox.

If auth has published an event but the notification email-jobs table is missing, the notification process is still running old code. Rebuild/restart notification-service and verify the `notification-email-otp-v1` consumer joins `auth.email-otp.v1`. A delayed OTP retains its original expiry; request a new code through the app when it has expired.
