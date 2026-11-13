# ADR-009: Social home counts and account search

Accepted 2026-11-02. UserService owns an exact, visibility-filtered friendship
count. Expose GET /users/me/social-summary under the existing Gateway users
mapping. Count accepted friendships with active, nondeleted, named accounts,
excluding blocks in either direction. Never use paginated-list length as a count.

Home gains a prominent search entry using the existing username-prefix search
and safe-profile APIs. Reuse existing debounce, pagination and stale-response
protection. Selecting a result opens a safe profile with current relationship
actions; return navigation refreshes counts. Plus is reserved for future posting.

At the user's direction, all moments/posting work is deferred: no content table,
new content API, uploads or publishing UI are introduced by this change.
