# Post AI Preview Implementation Plan

> Execute inline using executing-plans; approved flow in the conversation.

**Goal:** Preview and accept AI edits before posting without paid test calls.
**Architecture:** Flutter composer -> authenticated post preview -> existing AI.
**Tech Stack:** Spring Boot/JPA, NestJS gateway, Flutter.
**Spec:** docs/specs/post-ai-preview.md

## Constraints and review focus
No live Gemini requests or secrets edits. Preserve existing uncommitted work.
Test denied auth, duplicate requests, provider failures, cancelled preview, and
publication retries. Use the existing workspace because the integration depends
on current uncommitted camera/chat changes; do not commit unrelated changes.

- [x] Backend: write failing mock HTTP integration tests, implement DTO/controller,
  durable attempt claim and AI multipart client; run Maven test suite.
- [x] Mobile: write failing API/widget tests, add preview screen and composer entry,
  preserve original and accepted bytes; run Flutter tests/analyze.
- [x] Gateways: allow 75-second preview (Spring bounds result to 28 MiB); test route
  forwarding and keep other routes unchanged.
- [x] Review diff, update PROJECT_CONTEXT and document verified limitations.

## Verification ledger
- Backend RED: new endpoint returned 404 for all four initial tests. GREEN: six
  mock integration tests, full post suite 47 passed / one opt-in S3 test skipped.
- Spring Gateway RED: AI preview timed out at ordinary route deadline. GREEN:
  full 25-test suite. Nest RED: preview used 15s; GREEN: 48 e2e + 6 unit, build.
- Flutter RED: missing preview API/screen; transparent export alpha 255 instead
  of 0; expired session sent old access token. GREEN: full 355 tests.
- Independent review: fixed expired-session recovery through unpaid IAM preflight;
  the paid request remains non-retryable. UI tests ignore late result on disposal.
- No real provider requests. Real Gemini model compatibility/quality and opt-in
  S3 integration were not exercised. No secrets or unrelated edits committed.
