# ADR-023: Chronological feed with bounded image prefetch

Date: 2026-11-18. Status: accepted by the user's newest-first clarification.

The physical phone still waits for each image after the preview change. The
mobile controller has no lookahead downloads. Existing own/friend/unseen ranking
also interrupts chronology, particularly for seeded photos with different capture
and upload dates.

Order the complete authorized feed by `coalesce(captured_at, created_at) DESC,
id DESC`. Seen state remains informational and never changes this order. Keep
`createdAt` in responses and add `capturedAt`; mobile displays capture time when
available. Snapshot exclusion still uses insertion/creation time, so newly
published records wait for refresh. A versioned cursor uses the same capture-time
key as SQL; old ranked cursors fail with 400 and mobile restarts traversal using
its existing recovery behavior. This supersedes ADR-009's ranking decision.

After a feed page arrives, mobile asynchronously warms the current and next two
images using its session-scoped preview cache. Only one batch of at most three
background requests runs at a time. Rapid swipes update the desired window;
completion follows the latest window. Errors do not fail metadata or mark posts
seen. Refresh/disposal stop stale work from scheduling further downloads. Start
metadata pagination four posts before the loaded boundary.

No batch media endpoint, persistent image cache, public storage access or relaxed
friend/block checks is introduced. Each uncached image still uses an authenticated
request; lookahead starts it before the user reaches the image. Backend and mobile
must both be updated to apply the complete change.
