# ADR-007: Notification inbox, transactional outbox and push

Status: Accepted for implementation, 2026-10-30.

NotificationService owns a separate PostgreSQL database. UserService emits friend-request
received/accepted events through a transactional outbox. Kafka social.events carries
version-1 envelopes keyed by friendRequestId. Delivery is at least once; database
uniqueness deduplicates notifications. A durable push job is saved atomically with
notification creation. FCM sends notification+data payloads to authenticated session-bound
device registrations. External push delivery cannot guarantee exactly once.

Opening the inbox advances a per-recipient high-water mark, not per-row seen flags.
A server-signed, user-bound marker from the first page is acknowledged after display.
The marker never moves backwards. Recipient row locking serializes sequence allocation
and notification commit. Count actual nonexpired, unread rows after the marker.
Individual readAt updates do not advance the inbox marker.

Inbox retention is 90 days; push expires 24 hours after the source event. Replay
of events older than 90 days is ignored. Dedupe tombstones remain 180 days and event
age validation prevents old notifications returning after tombstone cleanup.
Actor name/avatar are event-time snapshots. Cancel/block retains the historical row;
UserService rechecks current entity state when opened. Account-deletion anonymization
policy remains open; no automatic destructive deletion policy is introduced here.

See ../specs/notification/inbox-and-push.md and ../../quest.txt section 6.

## Publisher optimization (2026-11-03)

UserService publishes up to 20 locked outbox rows with one Kafka send and marks
the acknowledged IDs with one SQL update. Both remain inside the original
publishing transaction. Retention cleanup runs independently every five minutes
and removes at most 500 rows published more than seven days ago. Cleanup failures
cannot roll back publication. Moving Kafka I/O outside transactions and introducing
leases are deferred. Delivery remains at least once; consumer deduplication is unchanged.
See [publisher spec](../specs/user/social-outbox-publisher.md).
