# ADR-024: Email registration with Kafka and Brevo

Status: Accepted — 2026-11-18

## Decision

Keep password login separate from registration. Auth owns pending accounts, password hashes and single-use OTP verification in Redis. Notification owns email delivery through Brevo's transactional HTTP API. Reuse the root `.env` variable `BREVO_MAIL_API_KEY`; never expose it to mobile or Kafka.

Auth queues an encrypted email event in its PostgreSQL outbox before acknowledging registration. A publisher retries Kafka delivery. Notification persists each event once in its own database before committing the Kafka offset, then retries Brevo delivery until the OTP expires. Events contain AES-256-GCM ciphertext, not readable email addresses or OTPs. A dedicated encryption key can be configured; otherwise derive a purpose-specific key from the existing shared internal service token.

Each registration has an unpredictable `registrationId`. Bind the code, candidate password hash and pending account to that challenge. Resend requires the same challenge. Successful verification applies that challenge's password under an account row lock, so a password chosen by an earlier unverified registration cannot take over the verified account. Existing active/suspended accounts receive the same public registration response with an inert challenge. Verification does not issue a session: mobile returns to login with the email prefilled.

## Consequences

- OTPs expire after 300 seconds, allow five failures, and are consumed atomically; destination/IP limits are atomic across auth replicas.
- Delivery is at least once. Database deduplication and a stable Brevo idempotency key suppress ordinary replays; an ambiguous provider timeout can still require retry. Expired events are never sent.
- A pending account may remain if Redis/outbox enqueue fails; starting a fresh registration is safe. There is no distributed transaction across PostgreSQL and Redis.
- Root `.env` is read as fallback after service-local `.env`; existing service settings take precedence. Secrets are not changed by this implementation.
- Kafka and Brevo outages delay email delivery without dropping a successfully queued job. Migrations are required in both service databases.
