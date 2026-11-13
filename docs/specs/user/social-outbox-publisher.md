# Social outbox publisher batching

Scope (2026-11-03): retain the existing transactional polling model while reducing
Kafka calls and separating retention cleanup. No API or schema changes.

- Poll every two seconds, locking at most 20 pending rows with `FOR UPDATE SKIP LOCKED`.
- Send nonempty batches with one Kafka `send`, preserving each aggregate key and payload.
- After acknowledgment, mark all selected IDs published with one SQL update in the
  same transaction. Send/update/commit failure leaves rows retryable. At-least-once
  delivery and notification consumer deduplication remain required.
- Run cleanup independently every five minutes, deleting at most 500 published rows
  older than seven days per run. Pending rows are never removed. Cleanup failure
  must not roll back publishing or prevent subsequent publishing attempts.
- Prevent overlapping cleanup runs within one instance; stop both timers and await
  scheduled work before disconnecting the producer during shutdown.

Kafka network I/O remains inside the publishing transaction in this iteration.
Leases and moving publication outside transactions are deferred.

Verify nonempty/empty batches, send and DB failure retries, independent cleanup,
polling cadence, overlap prevention and shutdown; run UserService build and tests.

Verification: UserService build and lint passed; 35 unit tests passed (including
10 publisher tests); 5 publisher integration tests passed using a disposable
PostgreSQL 17 database and mocked Kafka. The integration suite uses an isolated
random schema, removed after the suite. It covers the 20-row boundary, send
failure, actual SQL rollback, retention boundaries/500-row limit and cleanup errors.
This verification does not exercise a live Kafka broker.

Run `npm test`, `npm run build`, `npm run lint` from user-service. For the
PostgreSQL suite, set OUTBOX_TEST_DB_URL to a disposable PostgreSQL database and
run `npm run test:e2e -- test/social-outbox.postgres.e2e-spec.ts`.
