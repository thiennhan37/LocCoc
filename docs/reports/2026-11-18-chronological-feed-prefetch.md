# Newest-first feed and image lookahead — 2026-11-18

The user reported waiting when swiping to each friend photo after restarting
Post, and asked for time ordering, clarified as newest first.

## Findings and correction

The previous preview/cache correction did not prefetch. An unseen image started
its authenticated request only when its card was built. Metadata also ranked own,
friend and seen groups separately, preventing global chronological ordering.

The controller now asynchronously warms the current and following two photos
after metadata arrives and on pager movement. One batch of at most three
background requests runs at a time, with subsequent work following the latest
position. The existing session cache shares foreground/background requests and
retains six image futures. Warming does not mark views; failures remain retryable.
Metadata pagination starts four posts before the loaded boundary.

Post orders the entire currently authorized audience by capture time descending,
falling back to creation time, then ID descending. Seen writes and ownership no
longer affect order. Response `capturedAt` is added alongside `createdAt`; the
mobile date uses capture time with a creation-time fallback. Snapshot inclusion
still uses creation time and the cursor uses the same capture-time expression as
SQL. Versioned `time-v2` cursors reject previous ranked cursors with 400; existing
mobile recovery starts a new traversal.

## Verification

- 22 Java tests passed: Feed API (6), photo API (4), unified moments (12).
- Feed tests additionally passed against PostgreSQL 17 in an independent,
  disposable container. No application DB was used by this test run. Tests verify
  35 photos across 20/15 pages despite reversed upload/capture order, stable
  ordering after seen writes, creation-snapshot exclusion, timestamp ties,
  current audience checks and old/expired cursor rejection.
- 17 Flutter tests passed: capture-time fallback, background windows, rapid
  swipes, failure/disposal/refresh, image cache, pager and Home publication/auth.
  The real-widget regression verifies three images fetched before the first
  swipe, one additional image per forward swipe, early metadata pagination and
  no extra image request when swiping backward within the cache.
- Focused Flutter analysis: no issues. `git diff --check`: clean.

## Applied runtime

The actual JVM listening on 8089 was PID 29436, started at 08:20, despite the
reported restart. Packaging against the in-use target failed at Boot JAR
repackaging on Windows. A full JAR was built from copied source in ignored
`logs/feed-runtime-build-20261118`, checksum-verified into the live target, and
only the verified Post process was replaced. Updated JVM: PID 27156. Startup
configuration retained semantic search and configured internal credentials.
The unauthenticated feed still returns 401. Runtime record and output:
`logs/feed-updated-runtime.json`, `logs/feed-updated-post.*.log`.

The APK was rebuilt with the existing LAN URL, installed over the existing app
on the physical phone at 09:27 +07, and launched. Installation preserved app data
and session storage; no credentials or login tokens were sent through ADB.
The previous APK is retained at `logs/mobile-before-prefetch-20261118.apk`.
Authenticated image throughput on the actual phone was not measured; the tests
establish lookahead/cache behavior rather than a measured Wi-Fi speedup.
