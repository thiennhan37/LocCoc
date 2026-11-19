# Memories calendar implementation plan

**Goal:** Personal monthly photo calendar in the main home memories tab.
**Architecture:** Dedicated controller consumes existing FeedApi; calendar widget owns presentation and day sheet. Home wires session and active tab.
**Tech Stack:** Flutter / Dart, existing feed API.
**Spec:** docs/specs/memories-calendar.md

- [x] Test ownership filtering, newest daily image, pagination, refresh/error and disposal.
- [x] Implement controller and dark calendar with accessible dates and day post sheet.
- [x] Integrate main home, change navigation icon, preserve concurrent edits.
- [x] Run focused Flutter tests and analysis; update PROJECT_CONTEXT.md.

Review focus: timezone boundaries; nonchronological feed priority; partial failures; long histories; small screens and large text. No new endpoint or dependencies. The checkout has existing unrelated edits and .agents rules/skills are absent; preserve all unrelated work.

Verification: 12 focused Flutter tests passed (memories_calendar_test, home_feed_test, camera_home_test); flutter analyze on six changed Dart files reported no issues. Review caught the profile shortcut bypassing memory loading; reproduced with a failing widget test and fixed with shared _selectTab.
