# UC-07 AI Image Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless Gemini-backed image-enhancement service and an independent Flutter route offering the fixed Handwritten Diary and Subject Sticker filters.

**Architecture:** Flutter sends one source image and a fixed `filterId` through the API Gateway to a new NestJS `ai-service`. The Gateway preserves multipart and binary streams; `ai-service` validates input, resolves a private prompt, calls Gemini through an adapter, validates the output, and returns image bytes without persistence. Flutter owns the original/result bytes and all retry, compare, accept, and cancel state.

**Tech Stack:** Node.js 22+, TypeScript 6, NestJS 12, Vitest 4, `@google/genai` 2.27.0 Interactions API, `file-type`, `sharp`, Redis-backed Gateway throttling, Flutter 3/Dart 3.12, Dio 5.

**Spec:** `docs/superpowers/specs/2026-10-05-uc-07-ai-image-enhancement-design.md`

## Global Constraints

- Support exactly `handwritten_diary` and `subject_sticker`; never accept client prompt text.
- Accept JPEG, PNG, or WebP input up to `10_485_760` bytes and cap provider output at `20_971_520` bytes.
- Enforce a 60,000 ms end-to-end service deadline and one Gemini request per HTTP request; do not retry Gemini automatically.
- Set Gemini Interactions `store: false`; never persist or log source/result bytes, base64, user filenames, prompts, API keys, or raw provider payloads.
- Require `subject_sticker` output to be a PNG with an alpha channel and at least one non-opaque pixel.
- Return binary success bodies and the shared JSON error envelope with `requestId`; use `Cache-Control: no-store`.
- The public endpoint is unauthenticated in this MVP and is limited to five requests per minute per IP by default.
- Flutter exposes a named route only; do not add a button to the current authentication screen or build a post composer.
- Always regenerate or switch filters from the original bytes, never from an AI result.
- Automated tests must use fake providers and tiny generated fixtures; they must never call Gemini.

## File Structure

### New backend service

- `ai-service/src/config/ai-environment.ts` — AI-only environment validation and exact defaults.
- `ai-service/src/health.controller.ts` — non-billable liveness response.
- `ai-service/src/images/image.types.ts` — filter, upload, provider result, and route result types.
- `ai-service/src/images/image-enhancement.error.ts` — typed domain failures independent of Nest HTTP.
- `ai-service/src/images/filter-prompt.registry.ts` — exhaustive server-owned filter prompts.
- `ai-service/src/images/image-validation.service.ts` — input signature/size checks and generated-image checks.
- `ai-service/src/images/image-provider.ts` — provider injection token and interface.
- `ai-service/src/images/gemini-image.adapter.ts` — only file that imports `@google/genai`.
- `ai-service/src/images/image-enhancement.service.ts` — validation, prompt, timeout, provider call, output validation.
- `ai-service/src/images/image-enhancement.logger.ts` — structured allowlisted operational events with no image/prompt content.
- `ai-service/src/images/enhance-image.dto.ts` — multipart text-field DTO.
- `ai-service/src/images/image-enhancement.controller.ts` — HTTP upload/download contract.
- `ai-service/src/images/images.module.ts` — image feature wiring.
- `ai-service/src/app.module.ts`, `main.ts` — service composition and security/error bootstrap.

### Existing backend and deployment

- `api-gateway/src/service-routes.ts` — `/ai` upstream registration.
- `api-gateway/src/service-proxy.controller.ts` — raw request and streamed response forwarding.
- `api-gateway/src/ai-rate-limit.guard.ts` — configurable Redis-backed AI limit.
- `libs/common/src/config/environment.ts` — Gateway AI upstream/rate configuration.
- `.env.example`, `pnpm-workspace.yaml`, `package.json`, `compose.yaml`, `README.md` — local operation and workspace wiring.
- `ai-service/Dockerfile` — Node 22 workspace build/runtime image.

### Flutter feature

- `MobileApp/lib/features/image_enhancement/domain/image_filter.dart` — two filter IDs and Vietnamese display metadata.
- `MobileApp/lib/features/image_enhancement/domain/image_enhancement_result.dart` — typed accepted route result.
- `MobileApp/lib/features/image_enhancement/data/image_enhancement_api.dart` — multipart Dio contract and cancellation.
- `MobileApp/lib/features/image_enhancement/application/image_enhancement_controller.dart` — source/result state machine.
- `MobileApp/lib/features/image_enhancement/presentation/image_enhancement_route.dart` — named-route arguments and builder.
- `MobileApp/lib/features/image_enhancement/presentation/image_enhancement_screen.dart` — image-first screen.
- `MobileApp/lib/features/image_enhancement/presentation/widgets/*` — filter selector, compare view, and processing/error overlays.
- `MobileApp/lib/main.dart` — route registration only.

## Review Focus

- A file whose multipart MIME says JPEG but whose signature is executable/unknown must return `415`, covered in Task 2.
- Duplicate image/filter fields or any `prompt` field must return `400`, covered in Task 4.
- A sticker response that is valid PNG but fully opaque must return `422`, covered in Task 2.
- Client cancellation/disposal followed by a late response must not mutate Flutter state or navigate, covered in Task 6.
- Gemini returning zero images, multiple images, corrupt base64, or more than 20 MiB must map to sanitized `422`/`502` without leaking provider data, covered in Task 3.

---

### Task 1: Scaffold `ai-service` with isolated configuration and health

**Files:**
- Create: `ai-service/package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- Create: `ai-service/src/config/ai-environment.ts`, `ai-service/src/config/ai-environment.spec.ts`
- Create: `ai-service/src/health.controller.ts`, `ai-service/src/app.module.ts`, `ai-service/src/main.ts`, `ai-service/src/app.module.spec.ts`
- Modify: `pnpm-workspace.yaml`, `package.json`

**Interfaces:**
- Produces: `validateAiEnvironment(input: Record<string, unknown>): AiEnvironment`
- Produces: `GET /health -> { status: 'ok' }`
- Produces: workspace scripts `start:ai`, `dev:ai`; root `build` includes `ai-service`

- [ ] **Step 1: Write failing configuration and module tests**

Assert that empty key/model values fail, valid values produce port `8082`, timeout `60000`, input limit `10485760`, output limit `20971520`, rate limit `5/60000`, and `AppModule` exposes a health controller without calling Gemini.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `corepack pnpm --filter ai-service test -- src/config/ai-environment.spec.ts src/app.module.spec.ts`  
Expected: FAIL because the package and validator do not exist.

- [ ] **Step 3: Add the service shell and validator**

Use NestJS 12 patterns already present in `user-service`, but use the AI-only validator so this process does not require database or JWT variables. Require `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL`; reject configured timeout/input limits above the spec maxima.

- [ ] **Step 4: Run tests and build**

Run: `corepack pnpm --filter ai-service test && corepack pnpm --filter ai-service build`  
Expected: all tests PASS and Nest build exits 0.

- [ ] **Step 5: Commit**

```bash
git add ai-service pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat(ai): scaffold image service"
```

### Task 2: Implement fixed prompts and image validation

**Files:**
- Create: `ai-service/src/images/image.types.ts`
- Create: `ai-service/src/images/image-enhancement.error.ts`
- Create: `ai-service/src/images/filter-prompt.registry.ts`, `filter-prompt.registry.spec.ts`
- Create: `ai-service/src/images/image-validation.service.ts`, `image-validation.service.spec.ts`
- Modify: `ai-service/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `type ImageFilterId = 'handwritten_diary' | 'subject_sticker'`
- Produces: `FilterPromptRegistry.get(filterId: string): { id: ImageFilterId; prompt: string; requiredOutputMime?: 'image/png' }`
- Produces: `ImageValidationService.validateInput(upload: UploadedImage): Promise<ValidatedImage>`
- Produces: `ImageValidationService.validateOutput(filterId: ImageFilterId, image: GeneratedImage): Promise<GeneratedImage>`
- Produces: `ImageEnhancementError(code, safeMessage, cause?)` with codes used by later tasks

- [ ] **Step 1: Write failing registry tests**

Assert both exact IDs resolve to the canonical prompts in the spec, sticker requires PNG, an unknown ID throws `INVALID_REQUEST`, and neither API accepts a client prompt parameter.

- [ ] **Step 2: Run registry tests and confirm failure**

Run: `corepack pnpm --filter ai-service test -- src/images/filter-prompt.registry.spec.ts`  
Expected: FAIL because the registry is missing.

- [ ] **Step 3: Implement the registry and shared types/errors**

Copy the two approved prompts verbatim from the spec; expose immutable definitions and no mutation/registration API.

- [ ] **Step 4: Write failing image-validation tests**

Generate tiny fixtures with `sharp` in the test. Assert valid JPEG/PNG/WebP signatures pass; MIME/signature mismatch and unknown bytes throw `UNSUPPORTED_MEDIA_TYPE`; `10485761` input bytes throws `PAYLOAD_TOO_LARGE`; corrupt output throws `INVALID_AI_OUTPUT`; `20971521` output bytes throws `PROVIDER_OUTPUT_TOO_LARGE`; transparent sticker PNG passes; opaque sticker PNG and JPEG sticker output fail.

- [ ] **Step 5: Run validation tests and confirm failure**

Run: `corepack pnpm --filter ai-service test -- src/images/image-validation.service.spec.ts`  
Expected: FAIL because validation is missing.

- [ ] **Step 6: Implement validation with `file-type` and `sharp`**

Trust detected signatures, not filename. Normalize detected MIME into `ValidatedImage`; use `sharp(...).metadata()` and alpha-channel pixel statistics for sticker transparency. Do not write fixtures or uploads to disk.

- [ ] **Step 7: Run focused tests and commit**

Run: `corepack pnpm --filter ai-service test -- src/images`  
Expected: all image registry/validation tests PASS.

```bash
git add ai-service/src/images ai-service/package.json pnpm-lock.yaml
git commit -m "feat(ai): validate image filters and bytes"
```

### Task 3: Add Gemini adapter and orchestration

**Files:**
- Create: `ai-service/src/images/image-provider.ts`
- Create: `ai-service/src/images/gemini-image.adapter.ts`, `gemini-image.adapter.spec.ts`
- Create: `ai-service/src/images/image-enhancement.service.ts`, `image-enhancement.service.spec.ts`
- Create: `ai-service/src/images/image-enhancement.logger.ts`, `image-enhancement.logger.spec.ts`
- Modify: `ai-service/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `const IMAGE_PROVIDER: unique symbol`
- Produces: `ImageProvider.enhance(image: ValidatedImage, prompt: FilterPrompt, signal: AbortSignal): Promise<GeneratedImage>`
- Produces: `GeminiImageAdapter implements ImageProvider`
- Produces: `ImageEnhancementService.enhance(upload: UploadedImage, filterId: string, context: { requestId: string; callerSignal?: AbortSignal }): Promise<GeneratedImage>`
- Produces: `ImageEnhancementLogger.record(event: EnhancementLogEvent): void`, accepting only request ID, filter ID, MIME, byte count, duration, outcome category, and status

- [ ] **Step 1: Write failing Gemini adapter tests around a fake SDK client**

Assert one `interactions.create` call contains the configured model, a text block, a base64 image block with detected MIME, `response_modalities: ['image']`, and `store: false`. Assert exactly one image output is decoded; zero/multiple images and invalid base64 throw `INVALID_AI_OUTPUT`; SDK errors become `PROVIDER_FAILURE` without their raw message in `safeMessage`.

- [ ] **Step 2: Run adapter tests and confirm failure**

Run: `corepack pnpm --filter ai-service test -- src/images/gemini-image.adapter.spec.ts`  
Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement the adapter using `@google/genai@2.27.0`**

Keep the SDK client behind a narrow injectable test seam. Use the current Interactions image-editing shape from Google's official documentation. Pass the source inline; set the sticker response format to PNG from `FilterPrompt.requiredOutputMime`; do not use Files API, stateful interactions, tools, or provider-side storage.

- [ ] **Step 4: Write failing orchestration tests**

Assert validation precedes prompt lookup/provider use, the provider is called exactly once, output is validated, timeout maps to `TIMEOUT`, caller abort stops result delivery, and provider errors remain sanitized. Include a `PROVIDER_OUTPUT_TOO_LARGE` result and a fully opaque `INVALID_AI_OUTPUT` sticker result. Assert structured events cover validation rejection, success, timeout, provider rejection, invalid output, and cancellation while a recursive secret/content scan of every recorded value finds no bytes, base64, filename, prompt, key, or raw provider message.

- [ ] **Step 5: Implement orchestration and deadline handling**

Create one deadline signal per call using the configured 60,000 ms value and combine it with the caller signal. Do not retry. Preserve domain error codes and wrap only unknown failures. Emit one terminal allowlisted event through `ImageEnhancementLogger` for every outcome.

- [ ] **Step 6: Run tests, build, and commit**

Run: `corepack pnpm --filter ai-service test -- src/images && corepack pnpm --filter ai-service build`  
Expected: PASS and exit 0.

```bash
git add ai-service/src/images ai-service/package.json pnpm-lock.yaml
git commit -m "feat(ai): integrate Gemini image editing"
```

### Task 4: Expose the multipart image endpoint

**Files:**
- Create: `ai-service/src/images/enhance-image.dto.ts`
- Create: `ai-service/src/images/image-enhancement.controller.ts`
- Create: `ai-service/src/images/images.module.ts`
- Create: `ai-service/test/images.e2e-spec.ts`, `ai-service/vitest.config.e2e.ts`
- Modify: `ai-service/src/app.module.ts`, `ai-service/src/main.ts`, `ai-service/package.json`

**Interfaces:**
- Consumes: `ImageEnhancementService.enhance(...)` from Task 3
- Produces: `POST /ai/images/enhance` with the exact request/success/error contract in the spec

- [ ] **Step 1: Write failing endpoint contract tests with a fake provider**

Cover valid multipart binary output and headers; missing/duplicate image; missing/duplicate/unknown filter; extra `prompt`/text/file fields; 10 MiB overflow; invalid signature; timeout; provider failure; invalid sticker output. Assert every error has only safe fields plus `requestId` and every response has `Cache-Control: no-store`.

- [ ] **Step 2: Run e2e tests and confirm failure**

Run: `corepack pnpm --filter ai-service test:e2e`  
Expected: FAIL because the route is missing.

- [ ] **Step 3: Implement DTO, controller, module, and bootstrap**

Use Multer memory storage with the exact byte limit, `FileInterceptor('image')`, strict global validation, request IDs, the shared redacting logger/error envelope, and a focused mapping from `ImageEnhancementError.code` to `400/413/415/422/502/504`. Abort/ignore work after request close; return raw bytes with the validated MIME and optional `Content-Length`.

- [ ] **Step 4: Run all service tests and commit**

Run: `corepack pnpm --filter ai-service test && corepack pnpm --filter ai-service test:e2e && corepack pnpm --filter ai-service build`  
Expected: all PASS and build exits 0.

```bash
git add ai-service
git commit -m "feat(ai): expose image enhancement endpoint"
```

### Task 5: Preserve multipart and binary streams in the Gateway

**Files:**
- Create: `api-gateway/src/ai-rate-limit.guard.ts`, `ai-rate-limit.guard.spec.ts`
- Create: `api-gateway/vitest.config.ts`
- Modify: `api-gateway/src/service-routes.ts`
- Modify: `api-gateway/src/service-proxy.controller.ts`
- Modify: `api-gateway/src/app.module.ts`
- Modify: `api-gateway/test/app.e2e-spec.ts`
- Modify: `api-gateway/package.json`
- Modify: `libs/common/src/config/environment.ts`

**Interfaces:**
- Produces: Gateway mapping `/ai/* -> AI_SERVICE_URL`
- Produces: `AiRateLimitGuard` using `AI_RATE_LIMIT_MAX` and `AI_RATE_LIMIT_WINDOW_MS`
- Preserves: current JSON forwarding contract for `/auth/*` and `/users/*`

- [ ] **Step 1: Write failing raw-proxy e2e tests**

Start a local test upstream and assert multipart boundary/body bytes and `x-request-id` arrive unchanged; image response bytes/MIME/no-store stream back unchanged; client abort destroys the upstream request; JSON proxy behavior still serializes once.

- [ ] **Step 2: Write failing AI rate-limit guard tests**

Mock `RedisThrottlerStorage.increment`; assert the IP tracker and configured `5/60000` values are used and the sixth request becomes `429` without affecting non-AI routes.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `corepack pnpm --filter api-gateway test && corepack pnpm --filter api-gateway test:e2e`  
Expected: FAIL because AI routing/raw forwarding/guard are absent.

- [ ] **Step 4: Implement AI route, raw forwarding, response streaming, and guard**

For multipart/binary requests, pass the Node request stream to `fetch` with the Node-required half-duplex option and preserve the original content type boundary. Continue JSON serialization only for JSON requests. Pipe `upstream.body` to Express and propagate only safe non-hop-by-hop headers. Use the existing Redis storage for the dedicated AI guard.

- [ ] **Step 5: Run Gateway/common verification and commit**

Run: `corepack pnpm --filter @loccoc/common build && corepack pnpm --filter api-gateway test && corepack pnpm --filter api-gateway test:e2e && corepack pnpm --filter api-gateway build`  
Expected: all PASS and builds exit 0.

```bash
git add api-gateway libs/common/src/config/environment.ts
git commit -m "feat(gateway): proxy AI image streams"
```

### Task 6: Build Flutter API client and state controller

**Files:**
- Create: `MobileApp/lib/features/image_enhancement/domain/image_filter.dart`
- Create: `MobileApp/lib/features/image_enhancement/domain/image_enhancement_result.dart`
- Create: `MobileApp/lib/features/image_enhancement/data/image_enhancement_api.dart`
- Create: `MobileApp/lib/features/image_enhancement/application/image_enhancement_controller.dart`
- Create: `MobileApp/test/features/image_enhancement/image_enhancement_api_test.dart`
- Create: `MobileApp/test/features/image_enhancement/image_enhancement_controller_test.dart`
- Modify: `MobileApp/pubspec.yaml`, `MobileApp/pubspec.lock`

**Interfaces:**
- Produces: `enum ImageFilter { handwrittenDiary, subjectSticker }` with exact wire IDs
- Produces: `ImageEnhancementApi.enhance({required Uint8List sourceBytes, required String sourceMimeType, required String sourceFileName, required ImageFilter filter, required CancelToken cancelToken}): Future<EnhancedImage>`
- Produces: `ImageEnhancementController` states `idle`, `processing`, `success`, `failure`, `accepted`, `cancelled`
- Produces: `ImageEnhancementResult(bytes, mimeType, filter, suggestedFilename)`

- [ ] **Step 1: Write failing Dio client tests with `MockAdapter`/fake transport**

Assert multipart fields are exactly `image` and `filterId`; binary success is preserved; JSON errors map to safe Vietnamese UI categories; cancel token cancels the request; no prompt field is sent.

- [ ] **Step 2: Run client tests and confirm failure**

Run: `cd MobileApp && flutter test test/features/image_enhancement/image_enhancement_api_test.dart`  
Expected: FAIL because the client is missing.

- [ ] **Step 3: Implement domain types and Dio client**

Use `ResponseType.bytes`, a 60-second receive/send timeout, and no on-device persistence. Do not log request/response bodies. Keep endpoint URI injectable for route callers/tests.

- [ ] **Step 4: Write failing controller tests**

Assert initial source/filter state; single active request; success; retry; filter switch and regenerate always pass original bytes; accept returns typed result; cancel/dispose cancels the token; a late fake response after cancel/dispose does not change state.

- [ ] **Step 5: Implement the `ChangeNotifier` state machine**

Keep original bytes immutable, clear only the prior result when beginning another request, and guard async completions with an operation generation ID plus disposal/cancellation flags.

- [ ] **Step 6: Run tests, analyze, and commit**

Run: `cd MobileApp && flutter test test/features/image_enhancement/image_enhancement_api_test.dart test/features/image_enhancement/image_enhancement_controller_test.dart && flutter analyze`  
Expected: tests PASS and analyzer reports no issues.

```bash
git add MobileApp/lib/features/image_enhancement MobileApp/test/features/image_enhancement MobileApp/pubspec.yaml MobileApp/pubspec.lock
git commit -m "feat(mobile): add image enhancement state"
```

### Task 7: Implement the image-first Flutter route and screen

**Files:**
- Create: `MobileApp/lib/features/image_enhancement/presentation/image_enhancement_route.dart`
- Create: `MobileApp/lib/features/image_enhancement/presentation/image_enhancement_screen.dart`
- Create: `MobileApp/lib/features/image_enhancement/presentation/widgets/filter_selector.dart`
- Create: `MobileApp/lib/features/image_enhancement/presentation/widgets/compare_image_view.dart`
- Create: `MobileApp/lib/features/image_enhancement/presentation/widgets/enhancement_status_overlay.dart`
- Create: `MobileApp/test/features/image_enhancement/image_enhancement_screen_test.dart`
- Modify: `MobileApp/lib/main.dart`

**Interfaces:**
- Consumes: Task 6 client/controller/types
- Produces: `ImageEnhancementRoute.name = '/image-enhancement'`
- Produces: `ImageEnhancementRouteArgs(sourceBytes, sourceMimeType, sourceFileName, endpoint, apiOverride?)`
- Produces: route result `ImageEnhancementResult?` (`null` means cancelled)

- [ ] **Step 1: Write failing widget and route tests**

Cover the two Vietnamese filter labels; source image prominence; `Tạo với AI`; processing copy and disabled controls; hold-to-compare; checkerboard only for sticker; `Dùng ảnh này`; `Tạo lại`; switching filter; recoverable error/`Thử lại`; cancel/back returning `null`; named-route construction from valid arguments and safe failure for missing/wrong arguments.

- [ ] **Step 2: Run widget tests and confirm failure**

Run: `cd MobileApp && flutter test test/features/image_enhancement/image_enhancement_screen_test.dart`  
Expected: FAIL because the route/screen are missing.

- [ ] **Step 3: Implement the approved “Ảnh là trung tâm” UI**

Follow the existing Material 3 theme and `AppColors`; use the approved copy and interaction hierarchy. Implement compare with pointer down/up/cancel semantics so the AI image always returns after release. Keep widgets focused and avoid adding navigation from `AuthScreen`.

- [ ] **Step 4: Register the named route only**

Use `MaterialApp.onGenerateRoute` (or an equivalent typed route factory) to validate `ImageEnhancementRouteArgs`; preserve `home: AuthScreen` and current login tests.

- [ ] **Step 5: Run all Flutter tests/analyzer and commit**

Run: `cd MobileApp && flutter test && flutter analyze`  
Expected: all tests PASS and analyzer reports no issues.

```bash
git add MobileApp/lib MobileApp/test
git commit -m "feat(mobile): add AI image enhancement screen"
```

### Task 8: Wire local deployment, documentation, and full verification

**Files:**
- Create: `ai-service/Dockerfile`
- Modify: `.env.example`, `compose.yaml`, `README.md`, `package.json`
- Modify: `docs/superpowers/specs/2026-10-05-uc-07-ai-image-enhancement-design.md` only if implementation exposes a verified correction, never to weaken acceptance criteria

**Interfaces:**
- Consumes: Tasks 1–7
- Produces: documented local startup for Gateway + `ai-service` and a reproducible full verification path

- [ ] **Step 1: Add a failing configuration smoke check**

Run services with `GEMINI_API_KEY`/`GEMINI_IMAGE_MODEL` absent and assert `ai-service` fails fast with only variable names; then provide non-secret test values and assert the process reaches Nest bootstrap without making a Gemini request.

- [ ] **Step 2: Add deployment and root wiring**

Document every variable from the spec, add `AI_SERVICE_URL`, add the Node 22 `ai-service` container on port `8082`, and add root start/dev/build/test commands. Do not put a real key in Git or Docker build arguments.

- [ ] **Step 3: Run backend verification**

Run: `corepack pnpm install --frozen-lockfile && corepack pnpm build && corepack pnpm --filter ai-service test && corepack pnpm --filter ai-service test:e2e && corepack pnpm --filter api-gateway test && corepack pnpm --filter api-gateway test:e2e`  
Expected: install/build/test commands all exit 0.

- [ ] **Step 4: Run mobile verification**

Run: `cd MobileApp && flutter pub get && flutter test && flutter analyze`  
Expected: all tests PASS and analyzer reports no issues.

- [ ] **Step 5: Validate Compose configuration and secret hygiene**

Run: `docker compose config --quiet`  
Expected: exit 0 with a local ignored `.env` containing development values.

Run: `git diff --check && rg -n "GEMINI_API_KEY=.+|AIza[0-9A-Za-z_-]{20,}" --glob '!docs/superpowers/**' .`  
Expected: `git diff --check` exits 0 and secret scan finds no committed value/key pattern.

- [ ] **Step 6: Perform an optional manual Gemini smoke test**

With a developer-supplied key and rights-cleared test image, call each filter once through the Gateway. Confirm the handwritten result is usable and the sticker result is transparent. This is a manual release check, never a CI test, and must not commit inputs/outputs.

- [ ] **Step 7: Commit**

```bash
git add .env.example compose.yaml README.md package.json ai-service/Dockerfile docs/superpowers/specs/2026-10-05-uc-07-ai-image-enhancement-design.md
git commit -m "docs: wire UC-07 local operation"
```

## Final Review Gate

After Task 8, run `superpowers:requesting-code-review` for a whole-branch review against the spec and this plan. Resolve findings through the original task implementer where possible, rerun the affected focused tests, then invoke `superpowers:verification-before-completion` before claiming success.
