# ADR-019: Post image context in direct messages

Status: accepted by user on 2026-11-16.

A reply initiated from a feed post must retain the post image in chat history. Store nullable `{postId, mediaKey}` JSON metadata with the message in chat-service, using an additive migration. Media remains owned by post-service/SeaweedFS; no database cross-access or image copying.

Mobile submits only postId, never an arbitrary URL. Chat verifies the post via JWT-protected GET /posts/{id}/chat-reference and checks that the owner is the conversation peer. Every new reply verifies visibility and deletion. Source validation is deferred until after deduplication under the message lock, so retrying a committed send still succeeds if its source disappears. Idempotency compares text, conversation and postId.

History, inbox and realtime expose the same metadata. Mobile resolves a validated /posts/media/UUID path against configured gateway origin and displays an unavailable-image placeholder on failure. Existing messages have null metadata. The attachment is cleared from the composer after queueing one reply and retained on the queued message for retry.
