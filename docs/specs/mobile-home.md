# LocCoc mobile home

- Scope: Flutter home screen, camera session, Android/iOS permissions, widget tests.
- Preserve authentication form and default launch. Future IAM integration navigates
  to `/home` after real authentication. Preview via PREVIEW_HOME compile-time flag.
- Warm cream background, coral introductory card, camera in a large rounded frame,
  shutter, flip camera, flash, photo review/retake, local session memories.
- Friends and profile controls show honest empty/integration states; do not invent
  users, delivery confirmations, upload APIs or server-backed history.
- Initialize camera on entry; release when backgrounded or route hidden, restore
  when foregrounded. Handle denied/restricted/no camera/plugin errors with retry
  and system settings guidance. Disable capture while loading or busy.
- No microphone, gallery, location or broad storage permission. Photo capture only.
- Verify format, analyze, existing login tests, home tests including compact viewport
  and denied-camera UI, and build where tooling permits. Physical camera validation
  requires Android/iOS hardware; automated UI tests use a fake camera session.
