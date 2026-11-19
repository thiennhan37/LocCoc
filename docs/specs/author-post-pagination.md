# Author post pagination

GET `/posts/feed?ownerId={uuid}&limit=10&cursor={opaque}` returns the existing
`{data, nextCursor}` contract. Without ownerId the home feed uses capture time (falling back to creation time).
Author pages are newest first, ordered by `(created_at DESC, id DESC)`, exclude
soft-deleted and non-active posts and check the current viewer's audience on every request.
Private gallery items are visible only to their owner; peer pages require FRIENDS
visibility. Author order remains creation time even when capture time differs.
An inaccessible author returns 404. Limits remain 1..50; the mobile author view
requests 10. Cursors bind the author and snapshot, expire after one hour, and
prevent newly created posts or seen updates from disturbing a traversal.

Use a composite index `(owner_id, deleted_at, created_at DESC, id DESC)` so the
database can select active posts for one author in page order. Keep the existing
index for compatibility. Supply an idempotent concurrent SQL migration for
existing PostgreSQL installations, plus schema and Hibernate definitions.

Mobile sends ownerId to the server instead of scanning/filtering global feed
pages. Existing vertical paging requests more near the end, guards concurrent
loads, preserves items on failure, supports retry and resets on author change.

Alternatives: client filtering wastes requests; offset pagination becomes slower
on deep pages and shifts when posts arrive. Keyset pagination fits existing feed
contracts and is the implementation choice for this request.

Verification: API tests for author isolation, tied timestamps, deleted posts,
snapshot stability, revoked friendship and invalid cursors/limits; mobile HTTP
and swipe tests; gateway forwarding test. No new dependencies or secrets.

Deployment: apply `post-service/migrations/20261118-author-post-pagination.sql`
to the posts database outside a transaction before rolling out the backend.
Deploy the backend before the mobile update, because old backends ignore ownerId.
The index has been applied and verified valid on the local `posts` database.
For very small tables PostgreSQL may prefer a sequential scan; the index remains
available as the data grows. Physical-device UX has not been manually inspected.
