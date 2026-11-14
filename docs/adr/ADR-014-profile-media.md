# ADR-014: Validated avatar and cover uploads

Date: 2026-11-12. Status: implementation decision for the requested feature.

UserService owns profile media; AuthService remains the authority for account
access. Existing dirty work is preserved. The referenced `.agents/rules` and
`.agents/skills` directories are absent in this checkout.

Use an S3-compatible object store (SeaweedFS 4.53 in the optional Compose `media`
profile, pinned by digest). The initial MinIO image was unavailable from both
official registries during verification; no unsupported mirror is used.
Authenticated PUT /users/me/media/avatar|cover accepts a raw JPEG/PNG/WebP body,
not JSON/base64 or client-chosen object keys. Both Gateways forward bounded binary
bodies. Input crosses the Gateway for centralized access control and quotas; image
delivery uses a separate public object origin/CDN, avoiding Gateway download load.
Presigned direct upload is deferred: publishing unvalidated originals would bypass
magic-byte, pixel and EXIF checks and require a quarantine/finalization protocol.

Reject unsupported magic bytes, mismatched MIME, animation, malformed/truncated
files, >5 MiB avatar / >10 MiB cover, >40 million pixels or >12000 on either axis.
Sharp decodes with an input pixel limit, applies EXIF orientation and re-encodes
without metadata to WebP: avatar fits/crops 1024 square, cover fits/crops 2048x683.
Only processed images become public. Use UUID object names scoped to account and
kind. The public bucket permits GetObject only, with no anonymous list/write.

PostgreSQL stores cover_url varchar(1024) nullable and an object lifecycle ledger,
never image bytes. Upload first registers a staged object; a locked transaction
switches the profile reference and marks the previous owned object for deletion.
A retry worker deletes only unreferenced expired staging/deletion candidates.
Object-store failure never removes the current profile; DB failure retains the old
reference and leaves staging for cleanup. Profile PATCH URL replacement/clearing
also queues cleanup inside its transaction. No cooldown change for media edits.

Compatibility URLs require HTTPS and an explicitly configured allowed origin;
the managed public base permits HTTP only outside production. PATCH cannot attach
another managed object or revive queued objects. No remote URL is fetched by the
backend. Public profile pictures are readable by anyone holding their URL; social
API privacy still controls discovery, not already copied URLs. CDN/browser caches
may outlive removal, so cache lifetime is short and no revocation promise is made.

Flutter uses image_picker library/camera, native resize/quality options, bounded
reads, preview and explicit confirmation. Generation checks enclose picking,
upload, refresh and completion; no stale result updates another account. Failed
uploads are never automatically replayed. AccountVault keeps URL metadata only.
The name editor remains separate from immediate media mutations and reloads the
committed profile on return. Cover widgets use a 3:1 crop, bounded decoding and
opaque action surfaces so picture luminance cannot reduce contrast.

See [implementation and verification](../specs/user/profile-media.md).

References: [SeaweedFS mini](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini),
[Sharp pixel limits](https://sharp.pixelplumbing.com/api-constructor/),
[Sharp metadata defaults](https://sharp.pixelplumbing.com/api-output/),
[image_picker platform setup](https://pub.dev/packages/image_picker).
