# Author post pagination implementation plan

Goal: indexed author lookup with incremental mobile loading.
Spec: `docs/specs/author-post-pagination.md`.
Architecture: existing Spring JDBC feed, PostgreSQL composite index, Flutter pager.

- [x] Add failing API and mobile request tests for author filtering and page limits.
- [x] Implement authorized chronological keyset queries and owner-bound cursors.
- [x] Add schema/entity index and concurrent migration for existing databases.
- [x] Replace mobile global-feed filtering with direct owner requests.
- [x] Verify swipe loading, retries, author reset and gateway query forwarding.
- [x] Run backend/mobile checks, inspect diff and update PROJECT_CONTEXT.md.

Review focus: equal timestamps; inserts between pages; deleted posts; friendship
revocation; changing authors while a page is pending. Keep unrelated edits intact.

Verified: 50 post-service tests; 7 feed tests rerun on PostgreSQL in an isolated
schema; 6 gateway proxy tests; 375 Flutter tests; scoped Dart analysis clean.
Independent read-only review found no actionable bugs. Local index applied and
valid. Updated the pre-existing inbox test to open the profile tab where the
notification button now lives. No physical-device inspection or app deployment.
