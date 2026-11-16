# ADR: Server-ranked feed and first-view history

Use live accepted-friend membership from user-service and post_views in the post database. Do not reuse moment_recipients, which represents delivery-time recipient snapshots and excludes the owner's own views. Rank on read, with snapshot-aware keyset pagination so first-view writes during scrolling do not shift pages. User approved this approach on 2026-11-13. Keep existing token-free photo publishing in development; new feed/seen requests derive identity from authenticated user-service.
