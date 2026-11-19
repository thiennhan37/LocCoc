# Friend photo loading — 2026-11-18

The user reports slow friend images on a physical Android phone and subsequently
confirms that new friend posts are visible; the missing test photos are private.
The account is `duc_anh_ng` (the initial message spelled it `duc_ang_ng`).

## Evidence

- Live local database: three active, nonblocked friends. At the authenticated
  gateway measurement, `/posts/feed` returned all three eligible posts: two from
  `ngoclinh_hn`, one own, no further cursor. Other friends have no eligible posts.
  Thirty-two test photos are PRIVATE and correctly excluded from this audience.
- Audience response 18ms; feed response 17ms. Three PNGs via gateway: 560,516
  bytes/39ms, 372,612 bytes/40ms, 2,186,458 bytes/84ms. Direct Post responses were
  32–54ms. These are computer-local timings, not phone download timings.
- Installed debug APK points to `http://10.251.43.53:8080`; no USB reverse was
  configured. Public HTTP from the phone to that LAN gateway succeeded. ICMP did
  not respond, so packet loss from ping alone is not evidence of broken HTTP.
- Feed cards fetched original PNGs. Their futures were stored only in each card's
  widget state; returning after the pager discarded a card downloaded it again.

Large transfers and repeated downloads are confirmed performance problems in the
implementation. Their exact contribution relative to Wi-Fi throughput has not
been quantified on this phone. Automatic review rejected the proposed diagnostic
that would transfer a login token over ADB. It was not executed; connectivity was
checked with a public request instead. No credentials are included in this report.

## Correction

Post accepts `GET /posts/media/{id}?preview=true` and derives a JPEG with a longest
edge of at most 960 pixels at quality 0.82. The request performs the existing
audience/visibility checks before and after the storage read and returns
`Cache-Control: no-store`. The existing request without the query returns the
original PNG. Stored photos, visibility and AI embedding inputs are unchanged.

Flutter requests the preview and shares simultaneous requests. A feed instance
keeps at most six image futures in an insertion-ordered LRU cache. Refresh and
disposal clear the cache; local social revision and session checks prevent reuse
after those boundaries. Failures are evicted so the existing retry action works.
Both gateway routes already forward the query; no new public route is needed.

## Verification and activation

- Java: 17 tests passed (`PhotoPostApiTests`, `PhotoPostRollbackTests`,
  `UnifiedMomentsTests`). New test checks JPEG dimensions, reduction to less than
  one-third of a representative noisy PNG, unchanged original, no-store and
  unauthenticated/former-friend rejection.
- Flutter: 13 tests passed across feed API/controller/pager, Home feed and photo
  authentication. New tests cover coalescing, six-image eviction, retry, social
  revision, invalid session, refresh and disposal. Focused analyzer: no issues.
- Gateway: 6 proxy tests passed, including binary JPEG forwarding, preview query,
  Authorization and no-store propagation.
- `git diff --check` passed. Existing staged/unstaged work was retained.

Changes are in source only. Post must be rebuilt/restarted and Mobile rebuilt and
installed for the physical phone to use the optimization. No backend process was
restarted, no APK installed and no photo permissions changed by this task. Phone
performance after activation remains to be measured.

## Subsequent user-authorized test-data sharing

At 09:04 +07 the user requested sharing the existing private test photos. The
current platform has PRIVATE and FRIENDS visibility; it has no anonymous/global
PUBLIC mode. The seed/evaluation scripts created photos through `/moments`, which
assigns PRIVATE in `MomentService.create`. Social publication through
`/posts/photos` assigns FRIENDS. Flutter currently exposes neither a visibility
selector nor a change-visibility operation.

A guarded transaction changed exactly 32 active, undeleted photos of
`ngoclinh_hn` from PRIVATE to FRIENDS, matching the requested friend-feed usage.
Before/after metadata snapshots are in ignored
`logs/test-photo-visibility-{before,after}-20261118-090433.json`. IDs, owner, state,
index status, asset IDs/versions and creation timestamps were compared and stayed
unchanged. The owner now has 34 active shared photos and no active private photos.
No server restart or mobile rebuild is necessary for this data change: refresh
Home and continue pagination. The performance source change still has its
separate rollout requirement described above.
