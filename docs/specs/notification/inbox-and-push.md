# Notification inbox and push

Implementation sequence: migrations -> outbox -> Kafka -> inbox repository/service ->
controllers -> gateway -> durable push worker -> Flutter -> verification.

Authenticated API through /notifications:
- GET /notifications?limit=20&cursor=...: items, pageInfo(nextCursor,hasMore), seenCursor.
  Cursor sorts createdAt DESC,id DESC and preserves database timestamp precision.
- GET /notifications/counts: unseenCount, unreadCount (both exclude expired rows).
- PATCH /notifications/seen {seenCursor}: acknowledge server boundary monotonically.
- PATCH /notifications/:id/read: first read timestamp, idempotent, ownership-scoped 404.
- PUT /notifications/devices/:installationId {token,platform}: register FCM token for
  current account and session. DELETE removes only current account/session registration.

Data: recipient inbox_state(latest_sequence,last_seen_sequence,last_seen_at);
notifications(event_id,type,recipient_id,inbox_sequence,actor,data,created_at,occurred_at,
expires_at,read_at); dedupe tombstones; push jobs; devices; quarantine.
UNIQUE(event_id,recipient_id,type), UNIQUE(recipient_id,inbox_sequence).
Indexes: recipient/time/id; unread partial recipient/sequence; expiration; pending jobs.
Signed cursors are scoped by purpose/user with expiration and a deployment-provided key.
Read first page and high-water mark in one repeatable-read snapshot. GET never mutates.
Read notification implies seen individually, even if sequence exceeds the inbox marker.

Events: eventId, eventType (FRIEND_REQUEST_RECEIVED/FRIEND_REQUEST_ACCEPTED),
aggregateId=friendRequestId, timestamp, version=1, data(recipientId, actor snapshot,
friendRequestId). UUIDs and payload bounds validated. No public create endpoint.
Invalid payloads persist to quarantine before offset acknowledgement; infrastructure
errors retry. Outbox publisher claims rows with FOR UPDATE SKIP LOCKED and marks after
broker ACK. Kafka replay may duplicate delivery; dedupe happens in local transaction.
Consumer restarts after crashes. Workers have bounded network calls and shutdown cleanup.

Push job and notification commit atomically. Worker checks the bound auth session
before delivery, retries temporary failures with backoff, deactivates invalid tokens,
and stops at event+24h or bounded attempt limit. Missing FCM setup leaves jobs pending
until expiration and does not break the inbox. Registration token is never logged.
Do not deploy plaintext broker traffic outside a trusted private network; KafkaJS SSL/
SASL options configured from service environment. Broker topic ACLs restrict producers.

Flutter: cursor pagination; acknowledge seen only after successful first-page display;
refresh counts on resume and push; tap reads a single item then fetches current request
status from UserService. Cancellation/block shows unavailable. Current authorization
and session must match push recipient. Firebase is optional until configured; inbox works
without push permission. Re-register token on refresh; unregister on logout/account change.

Verification: actual PostgreSQL tests for marker races/multiple devices, expiry/read counts,
ownership, cursor ties, replay/dedupe/push-job atomicity; gateway routing; Flutter behavior.
Live FCM/APNs delivery requires user-owned Firebase project, native app configuration,
server credentials and physical-device checks. Never invent or commit credentials.
