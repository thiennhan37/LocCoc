# Photo gallery implementation plan

Goal: Lower-left gallery entry after camera; newest-first three-column gallery with All/Friends/Mine filters.
Spec: docs/specs/photo-gallery.md. Flutter, existing FeedApi, no new dependency.

- [x] Test multi-page chronological ordering, ownership filters, failure/disposal and gallery interactions.
- [x] Add gallery controller and screen; add conditional button under home pager.
- [x] Verify home navigation regression and static analysis; review and document outcome.

Preserve existing unrelated changes. Check small screens, empty filters, invalid images and retained home position.

Verification: 16 tests passed across photo_gallery_test, home_feed_test, camera_home_test, memories_calendar_test. Scoped analysis of five Dart files: no issues. Reviewer found video rows entering the image grid; reproduced with a failing mixed-media test and fixed by retaining mediaType=0 only. No device visual inspection.
