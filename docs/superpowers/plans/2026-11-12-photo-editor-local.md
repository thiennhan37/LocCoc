# Local Photo Publishing Implementation Plan

**Goal:** Capture, filter, add text and publish a real local photo from mobile.
**Architecture:** Flutter canvas export -> PostApi -> gateway -> Spring photo service -> Downloads PNG plus PostgreSQL metadata.
**Tech Stack:** Flutter/dart:ui, Spring MVC/JPA, Java ImageIO, PostgreSQL.
**Spec:** docs/specs/photo-editor-local.md

## Constraints and review focus
- Preserve existing user changes and existing metadata API; no commits requested.
- Windows Downloads outside workspace is explicitly authorized by user; create only LocCoc/posts.
- Test timeout retry, invalid PNG, DB rollback, deleted media access, editor overflow and caption export.

## Tasks
- [ ] HTTP tests first for /posts/photos and /posts/media/{id}; prove missing endpoint fails.
- [ ] Implement PhotoPostRequest, LocalPhotoStorage, PhotoPostService and thin PhotoPostController. Add request limit and gateway 8 MiB support. Run Maven/gateway tests.
- [ ] Add PostApi.publishPhoto and canvas PhotoRenderer with filters/text; test request body and image export.
- [ ] Add PhotoEditorScreen and wire Home capture/retake. Test failure preserves editor, repeat send reuses UUID and success returns edited image.
- [ ] Create Downloads/LocCoc/posts, update README/Postman/context, run Flutter checks and local database/file smoke. Stop only diagnostic processes.

Execution: native in this chat, as continuation of user's explicit instruction to implement local storage and editor. No further storage decision is pending.
