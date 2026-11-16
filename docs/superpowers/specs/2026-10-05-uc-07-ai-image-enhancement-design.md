# UC-07 AI Image Enhancement Design

**Status:** Approved in conversation; pending written-spec review  
**Date:** 2026-10-05  
**Use case:** UC-07 — AI-enhanced images before publishing  
**Actors:** User, AI Engine

## 1. Purpose

UC-07 lets a user improve a locally selected image before attaching it to a future post. The MVP offers two fixed AI filters. The user chooses one filter and starts processing with one action; the user never writes or submits an AI prompt.

The feature must preserve the original image, show the AI result for comparison, and let the user accept, regenerate, cancel, or switch filters. Image processing is synchronous and stateless: the backend does not persist source images, generated images, or database records for enhancement requests. Minimal operational fields may appear in redacted logs as defined in Section 9.

## 2. Agreed product decisions

- The MVP enhances an existing image only. Text-to-image generation is out of scope.
- The only filters are `handwritten_diary` and `subject_sticker`.
- Each filter maps to a private, server-owned prompt.
- Google Gemini is the image-editing provider.
- The mobile app calls the LocCoc backend, never Gemini directly.
- Processing happens while the user remains on the enhancement screen.
- Users can compare original and generated images, accept the result, regenerate it, cancel, or switch to the other filter.
- Switching filters or regenerating always uses the original image, never the previous AI output.
- Images are not stored by the backend. The mobile app retains source and result bytes locally for the active flow.
- Accepted inputs are JPEG, PNG, and WebP, up to 10 MiB.
- The end-to-end processing deadline is 60 seconds.
- The MVP endpoint does not require authentication. Abuse mitigation is IP-based.
- Flutter exposes the enhancement feature as an independent module and named route. The current UI does not link to it because the repository has no post-composer flow yet.

## 3. Goals and non-goals

### Goals

- Add an independently deployable NestJS `ai-service` behind the existing API Gateway.
- Provide one multipart endpoint for the two fixed enhancement filters.
- Keep Gemini credentials and prompts on the server.
- Preserve multipart bytes through the Gateway.
- Provide a mobile-first Flutter experience in which the image remains the visual focus.
- Return predictable, sanitized errors that the app can recover from.
- Make the Gemini integration replaceable and fully mockable in automated tests.

### Non-goals

- Text-to-image generation.
- Free-form prompts or user-editable prompts.
- More than two filters.
- Authentication, authorization, subscriptions, credits, payments, or per-user quotas.
- Object storage, database persistence, processing history, or background jobs.
- Push notifications or leaving the screen while a request continues.
- Building a post composer or publishing a post.
- Manual drawing, text editing, filter-strength controls, cropping, or image transforms.
- Silently falling back to the source image when AI output is invalid.

## 4. System architecture

```text
Flutter MobileApp
      |
      | POST /ai/images/enhance (multipart/form-data)
      v
API Gateway
      |
      | raw multipart stream
      v
ai-service
  - ImageEnhancementController
  - ImageValidationService
  - FilterPromptRegistry
  - ImageEnhancementService
  - GeminiImageAdapter
      |
      | source image + private fixed prompt
      v
Google Gemini
      |
      | generated image bytes
      v
ai-service -> API Gateway -> Flutter MobileApp
```

`ai-service` owns AI image-editing policy and provider integration. It must not depend on `user-service`. The Gateway owns public routing and transport proxying. Flutter owns the temporary source/result state and presentation.

### 4.1 Service boundaries

#### `ImageEnhancementController`

- Accepts the multipart request.
- Extracts exactly one `image` file and one `filterId` field.
- Delegates validation and enhancement.
- Returns image bytes on success or the standard JSON error envelope on failure.

#### `ImageValidationService`

- Enforces the 10 MiB input limit.
- Accepts only declared MIME types `image/jpeg`, `image/png`, and `image/webp`.
- Verifies file signatures instead of trusting the multipart MIME type or filename.
- Extracts safe metadata needed for validation without logging image content.

#### `FilterPromptRegistry`

- Contains the exhaustive `filterId` union and server-owned prompt definitions.
- Rejects unknown identifiers.
- Does not accept prompt text, prompt fragments, or negative prompts from the client.

#### `ImageEnhancementService`

- Coordinates validation, prompt lookup, Gemini invocation, output verification, timeout handling, and response metadata.
- Makes exactly one Gemini request for each HTTP request.
- Has no storage dependency.

#### `GeminiImageAdapter`

- Is the only component that imports or calls the Google Gemini client.
- Receives validated source bytes, source MIME type, and an internal prompt.
- Returns one normalized image result: bytes and MIME type.
- Maps provider failures to internal typed errors without exposing provider payloads.
- Reads the image-capable Gemini model from required environment configuration rather than hard-coding a model name.

## 5. Public API contract

### 5.1 Request

```http
POST /ai/images/enhance
Content-Type: multipart/form-data; boundary=...

image: <binary file>
filterId: handwritten_diary | subject_sticker
```

Rules:

- There must be exactly one `image` file.
- There must be exactly one `filterId` value.
- Extra file fields, extra text fields, and duplicate fields are rejected with `400`.
- Client-supplied prompts are not part of the contract and are rejected as extra fields.
- The input filename is not semantically significant.

### 5.2 Successful response

```http
HTTP/1.1 200 OK
Content-Type: image/png | image/jpeg | image/webp
Cache-Control: no-store
X-Request-Id: <request-id>

<binary image>
```

- `subject_sticker` always returns `image/png` with a real alpha channel.
- `handwritten_diary` may return PNG, JPEG, or WebP.
- `Content-Length` is returned when the server knows it.
- Responses larger than 20 MiB are rejected as invalid provider output.
- No successful response is encoded as JSON or base64.

### 5.3 Error response

All failures use JSON:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "AI did not return a valid image",
  "requestId": "..."
}
```

| Status | Meaning |
| --- | --- |
| `400` | Missing, duplicate, or unexpected multipart fields; unsupported `filterId` |
| `413` | Input image exceeds 10 MiB |
| `415` | Declared or detected image type is not JPEG, PNG, or WebP |
| `422` | Gemini returned no image, multiple ambiguous outputs, corrupt bytes, or a sticker PNG without transparency |
| `429` | The caller exceeded the AI endpoint rate limit |
| `502` | Gemini failed, rejected the request upstream, or returned an oversized response |
| `504` | The 60-second end-to-end deadline expired |

Error messages must be stable enough for display but must not contain the prompt, API key, stack trace, raw provider response, image bytes, or base64 data.

## 6. Filter specifications

### 6.1 Handwritten diary

Identifier: `handwritten_diary`

Intent: preserve the photograph while adding a restrained, relaxed, casual hand-drawn overlay.

Canonical prompt requirements:

```text
Edit the supplied image while preserving the main subject, composition,
faces, identity, body shape, and natural colors. Add a stylish, relaxed,
casual hand-drawn overlay using thin white pen lines. Lines should feel
slightly rough, gently imperfect, and mostly continuous. Add a few contour
lines that follow the outside edges of prominent objects. Use very few arrows
or dotted paths to guide the eye.

Add no more than two extremely short handwritten Vietnamese comments, each
one to four words, in a positive, sweet, diary-like emotional voice. Keep all
writing away from faces and important subject details. Add only a restrained
number of small steam marks, sparkles, hearts, or simple emoticon faces. Leave
generous negative space. Do not overcrowd the image, replace the background,
alter the primary subject, add a logo, or add a watermark.
```

The Vietnamese caption language is an explicit MVP assumption based on the current product language. It can become locale-aware in a later use case without allowing free-form prompts.

### 6.2 Subject sticker

Identifier: `subject_sticker`

Intent: isolate the primary subject and return it as a transparent sticker asset.

Canonical prompt requirements:

```text
Identify the single primary subject in the supplied image. Remove the entire
background precisely while preserving the subject's recognizable appearance,
edges, proportions, details, and natural colors. Return only the isolated
subject as a PNG with a genuinely transparent background. Add one clean,
continuous, evenly thick white outline around the subject. Do not add text,
shadow, decoration, a replacement background, a logo, or a watermark.
```

Output validation must confirm that the response is a decodable PNG with an alpha channel and at least one non-opaque pixel. If it is not, the service returns `422`; it does not flatten, fake, or repair the background in the MVP.

## 7. Gateway changes

The existing proxy serializes every request body with `JSON.stringify`, which cannot preserve multipart files. The Gateway must add an `/ai/*` route and support two explicit forwarding modes:

- Structured JSON forwarding for the existing auth/user routes.
- Raw streaming forwarding for multipart and other binary request bodies.

For `/ai/*`, the proxy must:

- Pipe the original request body without parsing or re-encoding it.
- Preserve the original multipart `Content-Type` header including its boundary.
- Remove hop-by-hop headers and recalculate or omit `Content-Length` safely.
- Continue propagating `X-Request-Id`.
- Stream successful image responses to the client instead of reading the complete upstream response into another buffer.
- Preserve the upstream status, safe response headers, and JSON error body.
- Abort the upstream request when the client disconnects.

The raw proxy behavior must be isolated so existing JSON proxy contracts do not regress.

## 8. Mobile design

### 8.1 Module boundary

Create an independent Flutter image-enhancement feature with a named route. The route accepts a local source image reference or bytes and returns the accepted result to its caller. Because no post composer exists, no current screen links to this route in the MVP.

The module should separate:

- API/data client for multipart requests.
- State controller for source image, selected filter, request status, result, and error.
- Presentation screen and small reusable widgets.
- Route input/result types so a future post composer can integrate without importing presentation internals.

### 8.2 Image-first screen

- Top bar: Back, `Làm ảnh đẹp hơn`, and `Hủy`.
- The image occupies most of the screen.
- A bottom sheet presents two filters: `Nhật ký viết tay` and `Sticker chủ thể`.
- Before processing, the primary action is `Tạo với AI`.
- During processing, filter selection and submit actions are disabled and an overlay says `AI đang làm ảnh đẹp hơn…`.
- After success, pressing and holding the image shows the original; releasing shows the AI result.
- Result actions are `Dùng ảnh này`, `Tạo lại`, choosing the other filter, and `Hủy`.
- The sticker result uses a checkerboard backdrop so transparency is visible.
- On failure, the source image and selected filter remain in place, with a short error and `Thử lại` action.

### 8.3 State model

```text
idle -> processing -> success
  |         |           |
  |         v           +-> processing (regenerate or switch filter)
  |       failure ------+-> processing (retry)
  |                     +-> accepted
  +------------------------> cancelled
```

Only one request may be active. Navigating back or cancelling during processing cancels the client request and ignores any late response. Temporary result bytes are released when the route is disposed.

### 8.4 Route result

- `accepted`: returns generated bytes, MIME type, selected filter ID, and an optional suggested filename.
- `cancelled`: returns no image.

The caller decides how to store or upload an accepted image. That behavior is outside UC-07.

## 9. Privacy, security, and abuse controls

- `GEMINI_API_KEY` exists only in `ai-service` environment configuration.
- Prompt definitions exist only in `ai-service` source/configuration.
- Logs contain only request ID, filter ID, detected MIME type, byte count, duration, provider outcome category, and HTTP status.
- Logs never contain image bytes, base64, filenames supplied by users, prompts, API keys, or raw Gemini payloads.
- Successful and error responses use `Cache-Control: no-store` where applicable.
- The unauthenticated AI endpoint has a default rate limit of five requests per minute per IP, configurable by environment variables.
- Input buffering is capped at 10 MiB and normalized provider output at 20 MiB.
- The 60-second deadline covers upload parsing, Gemini processing, validation, and response preparation within `ai-service`.
- File signature verification prevents MIME/extension spoofing.
- Gemini safety/provider rejections are reported as a sanitized failure and are not retried automatically.

## 10. Configuration and deployment

Add required `ai-service` configuration:

- `AI_SERVICE_PORT` — local default `8082`.
- `GEMINI_API_KEY` — required, secret, never committed.
- `GEMINI_IMAGE_MODEL` — required name of a configured Gemini model that supports image editing and image output.
- `AI_REQUEST_TIMEOUT_MS` — default `60000`, maximum allowed configuration `60000` for this use case.
- `AI_MAX_INPUT_BYTES` — default and maximum `10485760`.
- `AI_MAX_OUTPUT_BYTES` — default `20971520`.
- `AI_RATE_LIMIT_MAX` — default `5`.
- `AI_RATE_LIMIT_WINDOW_MS` — default `60000`.

Add `AI_SERVICE_URL` to Gateway configuration, defaulting locally to `http://127.0.0.1:8082`. Add `ai-service` to workspace scripts and the local Compose stack. Secrets remain in the developer's ignored `.env`; `.env.example` documents variable names with empty or illustrative non-secret values.

Startup must fail with a clear configuration error if the Gemini key or model is absent. Automated tests inject a fake adapter and do not need real Gemini credentials.

## 11. Observability

Each request uses the Gateway-generated request ID end to end. Structured logs and timings distinguish:

- Validation rejection.
- Rate-limit rejection.
- Gemini success.
- Gemini timeout.
- Gemini/provider rejection.
- Invalid Gemini output.
- Client cancellation.

The MVP does not add analytics, image-content telemetry, distributed tracing infrastructure, or a database. Existing health conventions should be followed, with an `ai-service` health endpoint that confirms the process is running but does not make a billable Gemini call.

## 12. Testing strategy

### 12.1 `ai-service` unit tests

- Registry accepts exactly the two specified IDs.
- Unknown IDs and attempted prompt fields are rejected.
- File-size, declared MIME, and file-signature checks cover accepted and rejected cases.
- Service orchestration calls the adapter exactly once with the original source image.
- Regeneration is represented by a new request and never consumes a previous result.
- Provider exceptions, missing image output, multiple ambiguous outputs, corrupt image bytes, oversized output, and timeout map to the documented errors.
- Sticker validation accepts a transparent PNG and rejects opaque or non-PNG output.

### 12.2 `ai-service` contract/e2e tests

- Valid multipart requests return binary image responses with correct headers.
- Every documented error code uses the standard envelope and request ID.
- Extra/duplicate fields are rejected.
- Tests use a fake Gemini adapter and tiny committed image fixtures.

### 12.3 Gateway e2e tests

- Multipart bytes and boundary arrive unchanged at a test upstream.
- Binary image bytes stream back unchanged.
- Existing JSON forwarding tests continue to pass.
- Upstream failure remains sanitized.

### 12.4 Flutter tests

- Filter selection and the initial primary action.
- Processing state disables conflicting actions.
- Success enables hold-to-compare and result actions.
- Regenerate and filter switching reuse the original image.
- Sticker result displays a checkerboard background.
- Failure preserves source/selection and exposes retry.
- Accept returns the documented route result.
- Cancel/back returns no image and ignores a late response.

No automated test calls the real Gemini API. A manual smoke test with a development key is a release check, not part of CI.

## 13. Acceptance criteria

1. The mobile client can submit a JPEG, PNG, or WebP source image no larger than 10 MiB with either supported filter ID.
2. The client cannot submit custom prompt content through the public API.
3. The original image remains unchanged throughout the flow.
4. A successful handwritten result preserves the main subject and adds restrained white hand-drawn elements and no more than two short Vietnamese diary-style comments without covering faces.
5. A successful sticker result is a PNG with a transparent background and a continuous white outline around the primary subject.
6. The user can compare original/result, accept, regenerate, switch filters, cancel, and retry after failure without choosing the source image again.
7. Every regeneration and filter switch uses the original source image.
8. The backend does not persist the source image, generated image, or enhancement records and does not log image content; only the minimal operational fields in Section 9 may be logged.
9. The request fails predictably for invalid input, invalid AI output, rate limiting, provider failure, and timeout.
10. The Gateway forwards multipart and binary bodies without corrupting them and does not regress existing JSON routes.
11. Gemini credentials and fixed prompts are not present in the Flutter application.
12. The Flutter feature is exposed through an independent named route but is not linked from the current login UI.

## 14. Risks and deliberate constraints

- Gemini output is probabilistic. The prompt can request composition and style but cannot guarantee aesthetic consistency. Regeneration is the MVP recovery path.
- Text rendered by image models may contain spelling artifacts. The MVP caps handwritten comments but does not add OCR or editable text overlays.
- True transparent output depends on the configured Gemini model. Runtime validation rejects non-transparent sticker results instead of presenting them as valid.
- Synchronous processing keeps the UX and architecture small but ties the request to one screen and a 60-second deadline. Background jobs are deferred.
- An unauthenticated, billable endpoint is an abuse risk. The MVP limits by IP; production rollout should require IAM and user/account quotas.
- The repository has no post composer. Returning a typed route result creates the integration seam without expanding UC-07 into post creation.
