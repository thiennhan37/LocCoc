# Avatar and cover upload

Date: 2026-11-12. Decision: [ADR-014](../../adr/ADR-014-profile-media.md).

## Scope and dependency-ordered plan

1. Inspect existing User DTO/repositories, safe projections, both proxies, Flutter
   profile editors/rendering and saved-account metadata. Preserve earlier changes.
2. Add cover_url and durable object lifecycle migration; strict media URL policy.
3. Add bounded raw-body upload, raster processing, S3 storage, account-only
   controller and cleanup worker. Media writes never invoke the rename writer.
4. Update Nest/Spring binary forwarding, dedicated body/time limits and quota.
5. Add Flutter picker abstraction, upload transport with existing refresh fences,
   preview/editor and cover rendering on own/other profiles; iOS permission text.
6. Verify file policy/metadata, lifecycle rollback/races, real PostgreSQL migration
   and HTTP ownership, Gateway binary/limits, Flutter failure/cancel/layout cases.
7. Record actual checks, provisioning and remaining device/deployment limits.

## API and invariants

- PUT /users/me/media/avatar, PUT /users/me/media/cover: raw file bytes with
  Content-Type image/jpeg, image/png or image/webp. Returns the committed own
  profile, including avatarUrl/coverUrl. No target ID or object key in input.
- DELETE /users/me/media/avatar|cover: idempotently clear the own reference and
  queue previous managed object; returns own profile.
- PATCH /users/me accepts coverUrl alongside avatarUrl. Empty string clears;
  null, unsafe schemes, credentials/fragments and unapproved origins are rejected.
  Existing managed URL can be retained, but cannot be assigned through PATCH.
- GET /users/me and safe social profiles expose coverUrl. Safe profiles do not
  expose email, phone, storage credentials or ledger internals.
- Every mutation requires JWT and authoritative active-account access, including
  direct UserService calls. No administrator bypass or client-controlled owner.
- Backend handles 5/10 MiB, actual raster type, 40 MP / 12000 axis, single frame,
  strict decode, auto-orientation, WebP re-encode with no EXIF/ICC/XMP/IPTC.
- Dedicated upload quota: 10 requests/minute/account (Redis, fail closed).
  Nest applies a dedicated 10/minute media handler quota per IP; Spring applies
  its regular quota plus a separate 10/minute media quota. Backend account quota
  also protects direct service access. Four simultaneous image operations per
  process and a ten-second decoder timeout bound processing work.
- Staged objects expire after one hour, cleanup retries every 30s with a bounded
  batch and idempotent S3 deletion. User row locking serializes media replacements;
  ledger rows make DB commit and cleanup intent atomic. Account deletion marks
  unreferenced account media for cleanup. Never derive deletion keys from URLs.

## Provisioning

New settings live in service-local examples; real .env/secrets are not edited.
Enable MEDIA_ENABLED and supply MEDIA_S3_ENDPOINT, MEDIA_S3_REGION,
MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY, MEDIA_S3_SECRET_KEY, MEDIA_PUBLIC_BASE_URL.
The base includes the bucket path and must be reachable by the phone; use HTTPS
in release. MEDIA_ALLOWED_ORIGINS is a comma-separated HTTPS compatibility list,
empty by default. A host-loopback URL is only useful on the development host.
Optional Compose SeaweedFS requires explicitly supplied S3 credentials and refuses
to start without them. Only S3 port 9000 is published to loopback; admin/filer ports
are not published. Image 4.53 is pinned by digest. MinIO images were inaccessible
from Docker Hub/Quay during this implementation, so the maintained S3-compatible
alternative is used rather than an unverified mirror.
Production should use a bucket-scoped service identity, separate CDN origin,
TLS/private S3 endpoint, storage backup and an object lifecycle backstop.

After configuring root credentials and the service-local media settings, run:
`docker compose --profile media up -d media-store`, then
`node scripts/configure-profile-media.mjs` to create the configured bucket and
grant anonymous GetObject only. The script is explicit and never rewrites .env.
Run `npm --prefix user-service run db:migrate` and restart UserService. Phone/image
access needs a media origin or tunnel reachable from the phone; local Android
development may use ADB reverse for port 9000 as well as Gateway port 8080.
Release builds must use HTTPS. The user has not supplied production media secrets
or a public media hostname; this implementation does not invent either.

### Local save failure resolved — 2026-11-14

The picker preview does not mean an upload succeeded. The reported
`MEDIA_UNAVAILABLE` save failure was caused by `MEDIA_ENABLED=false` in the
service-local environment and an absent Compose media-store container.
Local remediation enabled that flag without rotating credentials, started the
media profile, provisioned the configured bucket/read-only anonymous policy,
ran pending UserService migrations and restarted the development watcher.
Android emulator access also required `adb reverse tcp:9000 tcp:9000`
in addition to the existing Gateway port forwarding. Reapply ADB forwarding
after a device/emulator reconnect; it is not a release deployment setting.

Verified: nine isolated PostgreSQL/S3/Gateway HTTP media integration tests pass;
the configured local bucket accepts a temporary image, serves identical bytes
anonymously and rejects anonymous bucket listing (403). The temporary object
was removed. UserService restarted successfully. Saving the user's selected
photo in the running app remains a manual device check; no account photo was
changed during verification.

## Implemented behavior and operational notes

Controller -> MediaService -> MediaRepository/MediaStorage separates request,
image policy, transactions and object storage. UserService projects a new account
before first upload/removal, including an account that has not loaded /users/me.
The existing authority/JWT guards protect every mutation. Admin profile endpoints
cannot change another account's media. Canonical storage-origin checks prevent
PATCH attachment via alternate host casing/encoded managed paths.

The additive ProfileMedia1794528000000 migration registers cover_url, lifecycle
ledger/index and a transactional retirement trigger. The trigger covers normal
PATCH, image replacement/clear, account deletion and account-event projection.
Cleanup never derives a delete key from a client URL and checks current live
references. Failed S3 writes and DB rollbacks retain old images; crash leftovers
remain staged for cleanup. Do not change buckets/public bases while ledger rows
are pending without migrating/reconciling them. Keep the additive schema during
an application rollback; dropping the migration does not delete S3 objects.

Both proxies forward raw bytes with the existing /users route and retain normal
JSON limits. Media PUT uses 5/10 MiB with a 60s upstream deadline; UserService
also bounds streamed bodies (including missing Content-Length) and read time.
Nest drains rejected bodies without buffering to return HTTP 413. Spring keeps
the configured normal response-body limit and permits bounded request swallowing.
Normal requests use the existing settings (Nest now has a 15s upstream deadline).

Flutter library/camera picking requests native resize/quality (85), then bounds
file bytes and checks raster signatures. Preview is not an upload acknowledgement;
indeterminate progress and disabled controls cover picker/upload/removal. Lost
Android picker results require an explicit recovery action, preview and save.
Permission/cancel/invalid-file/server/network outcomes are distinct. Only a
definitive HTTP 401 can rotate the session and retry binary upload; transport or
5xx failures never automatically replay it. Numeric Spring error codes preserve
HTTP status. Session fences discard stale picker/network completions.

UserCover renders 3:1 images with bounded 2048px decoding and a gradient fallback
on own/peer profiles. Actions sit outside the image on opaque app surfaces; no
contrast depends on image content. Avatar/cover image requests add no application
credentials. The independent media editor preserves pending name edits; returning
from the editor refreshes Home even when the name form was dismissed. AccountVault
adds optional sanitized coverUrl to the existing v1 record and never stores bytes.
iOS photo-library/camera usage descriptions are included. Android uses the system
photo picker/camera intent without adding broad storage or camera permissions.

## Verification record — 2026-11-12

| Check | Actual result |
| --- | --- |
| Shared library and UserService build | PASS |
| UserService unit tests | **125 PASS**, 12 files, no failures/skips |
| UserService type-aware lint | PASS, no warnings |
| `node scripts/verify-profile-media.mjs .` | **87 PASS**, **16 SKIP**, no failures |
| Dedicated real PostgreSQL/S3 media suite | **9 PASS**, no skipped media cases |
| Nest Gateway build and E2E | PASS, **23 PASS**, no failures/skips |
| `mvn -f api-gateway-spring/pom.xml test -q` | PASS, **20 PASS**, no failures/skips |
| `dart format --output=none --set-exit-if-changed lib test` | PASS, 75 files / 0 changed |
| `flutter analyze` | PASS, no issues |
| `flutter test` | **265 PASS**, no failures/skips |
| `flutter build apk --debug` | PASS |
| `docker compose --profile media config --quiet` | PASS |
| `git diff --check` | PASS |

The integration runner starts a digest-pinned disposable SeaweedFS container,
creates its own bucket/credentials, uses randomly named PostgreSQL schemas and
removes test schemas/container/anonymous volumes. It does not modify live project
tables or real .env files. The 16 pre-existing optional outbox/broker/Neo4j/Redis
integration cases require separate test settings; none of the media cases skips.
The existing social suite additionally uses real Auth HTTP/PostgreSQL authority.

Coverage includes all raster types, MIME spoofing/SVG/HTML/truncation/animation,
byte/axis/pixel limits, EXIF/ICC/IPTC/XMP removal, approved URL policy, real
migration up/down/preserved profile data, newly projected accounts, /users/me,
safe cover fields, anonymous object read versus denied list/write, JWT/ownership,
DB/S3 failures, retry cleanup, concurrent replacement, deletion, and unchanged
name cooldown/atomic rollback. Flutter covers both image kinds, cancellation,
permission denial, invalid file, failure/retry, removal, session switch/stale
completion, refresh, no automatic network replay, safe image headers/decoding,
own/peer covers, vault compatibility and 360px / 200% text.

Debug artifact: `MobileApp/build/app/outputs/flutter-apk/app-debug.apk`.
SHA-256: `A660EB524DF0F0E7BCF39FA334FCC92968644C23E3B11650294E9F917407328A`.
This is a debug build, not store signing or a release-readiness claim. The existing
firebase_core Kotlin migration / Java native-access build advisories remain.
Android/iOS device camera/gallery/permission UX, native lost-activity recovery,
iOS compilation and production S3/CDN/TLS integration remain unverified. Real
media settings and a phone-reachable HTTPS public origin must be provisioned
before enabling uploads; no local secrets, live migration or deployment was changed.
