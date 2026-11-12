# Photo editor and local publishing

User chose local photo storage in Windows Downloads. Store PNG files in Downloads/LocCoc/posts, configured through POST_MEDIA_DIR, default ${user.home}/Downloads/LocCoc/posts. Do not store photos in Git. Existing JWT-free development post APIs remain compatible.

After capture, open a black full-screen editor inspired by the supplied screenshot: rounded square preview, five filters (Gốc, Đen trắng, Ấm, Lạnh, Vintage), editable text near bottom, cancel/retake and central send action. Export a 1080x1080 PNG with the same crop, filter and text. Preview controls are not burned into the image. Only real post publishing is shown; no fabricated friends/recipients.

POST /posts/photos accepts requestId UUID, ownerId UUID, imageBase64 PNG, caption <=200. Returns PostResponse (201). The requestId is the post ID and reused on retry. Matching repeats return the original result; conflicting repeats or deleted posts return 409. Local singleton service serializes this operation through the transaction commit. Store only decoded valid PNG, max 5 MiB, dimensions <=2048, derive filename from UUID. Remove a newly written file if the database transaction fails. GET /posts/media/{id} serves only an existing undeleted photo; soft delete retains local file but prevents API retrieval.

Bound JSON requests to 8 MiB through gateways and directly at post-service. Keep standard error envelopes. On mobile, retain editor after failure and preserve exact bytes/requestId for retries until edits change; do not clear or navigate until successful backend response. Disable repeated sends and back navigation while sending. Token owner identity comes from AuthApi.userId; preview mode cannot publish without login.

Validation: HTTP persistence, PNG bytes and limits, corrupt images, repeated/conflicting requests, deletion, database rollback; Flutter filter/text export, failures/retry IDs, navigation/compact layout, gateway upload forwarding. Local smoke confirms actual file plus PostgreSQL row. Existing service processes are not stopped; diagnostic processes must use spare ports and be cleaned up.
