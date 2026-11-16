# Ranked Home feed

User approved implementation of the proposed behavior on 2026-11-13.

Home scrolls into real posts, reloading after a successful publish. Ranking is: (0) own unseen posts within POST_FEED_OWN_PRIORITY_HOURS (default 24), (1) unseen friends' posts, (2) own older unseen posts, (3) all seen posts. Within each bucket order by createdAt DESC, id DESC. Deleted posts and non-friends are excluded. Existing friends gain access to historical posts; removing/blocking a friend removes their posts on the next request.

post-service calls authenticated GET /users/me/feed-audience with the incoming bearer token. user-service derives viewer from its existing auth guard and returns self plus active, non-blocked accepted friends. No client-supplied friend IDs or cross-database queries. Feed and seen endpoints require login even though the existing development publish endpoints remain token-free.

GET /posts/feed?limit=20&cursor=... returns data, nextCursor. Each item contains post fields, author label, mine and seen. A bounded cursor carries snapshot time, bucket and last createdAt/id. Seen records created after the snapshot do not change ordering within that traversal; newly published posts appear on refresh. Invalid or expired cursors return 400. Each page rechecks current friendship membership. PostgreSQL stores one first-seen timestamp per viewer/post in post_views. PUT /posts/{id}/seen is idempotent and checks current visibility.

Mobile counts a view only after a successfully loaded photo occupies >=50% of its card viewport for 1 continuous second, while Home is active, foregrounded and unobscured. Loading/error images do not count. Scroll does not reorder existing cards; refresh or publish resets pagination. Failures offer retry and do not mark locally as seen until the API succeeds. Feed has loading, empty, error and load-more states. Display photo, author, time and caption; no fake feed cards.

Approach: server-ranked feed and server view state (selected). Client-only ranking cannot reliably paginate or persist views across devices; fan-out event infrastructure is unnecessary for this local project. Keep service boundaries and existing Google/profile/friend functions.

Implementation decisions: cursor lifetime one hour; limit 1..50; source audience bounded at 10000 friends with explicit failure rather than silent truncation. Local image URLs remain compatible with the existing local-photo endpoint. Feed privacy is enforced at listing/seen; legacy photo publishing/media remains the prior development contract.


### 2026-11-15: One post per vertical page

User requested removing duplicate caption text below the photo and viewing one post at a time. Mobile uses a vertical PageView with one full page per post; the caption baked into the published image remains visible. Approaching the last posts loads the next server page; the final page retains loading/error/retry/end states. Photo cards fit their available page height, preserving author/time and existing view tracking.
