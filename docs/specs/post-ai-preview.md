# AI preview before publishing

Approved flow (2026-11-17): choose photo, explicitly generate AI image, preview,
accept or cancel, then publish. The existing local filters and caption remain.

Mobile sends a normalized PNG to authenticated `POST /posts/photos/enhance` with
`requestId`, `imageBase64`, `filterId`. Post resolves IAM identity before calling
the existing multipart `/ai/images/enhance`. Only handwritten_diary and
subject_sticker are allowed. Response is `{imageBase64, mimeType}`; it creates no
post or S3 object. Mobile decodes the result and existing publishing renders PNG.

Each explicit generation uses a UUID. A durable attempt row is inserted before
the paid call; reusing an ID returns 409, even after failure or restart. No
automatic retry. A lost response cannot be recovered; another explicit generation
may incur a new fee. At most five attempts per user per minute on a single service
instance. AI request deadline 65 seconds, gateway 75, mobile 90. Input remains
PNG <=5 MiB / 2048 px, output <=20 MiB. No credentials are changed or live AI
requests made during verification.

Approaches: direct mobile-to-AI avoids a hop but bypasses post IAM and duplicate
protection; AI inside publish risks charging on publish retries and removes preview.
Selected: authenticated preview through post-service, with independent publish.

Original bytes are retained on mobile. Switching filter alone is free; each
Generate/Regenerate action displays the stated 2,000 VND cost. Cancel discards
preview; accepting does not publish. Late results after leaving are ignored.
Attempt metadata is retained (no image/prompt/token stored); multi-instance atomic
quotas and retention policy are future operational work.
