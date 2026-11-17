# Home author filter plan

- [x] Test filtered pagination and actual friend menu rows.
- [x] Implement author feed adapter and dark avatar/name picker.
- [x] Move gallery shortcut into home header and connect picker.
- [x] Run home/gallery/calendar tests and scoped analysis; update context.

Spec: docs/specs/home-author-filter.md. Preserve unrelated edits. Existing friends tab retains relationship management; gallery filters remain available.

Verification: 18 focused tests passed across author_filter, home_feed, camera_home, photo_gallery and memories_calendar; an additional home author-selection integration test passed. Scoped analysis of six Dart files clean. Read-only review found no concrete issues. Notifications moved to profile to preserve access. No physical-device visual check.
