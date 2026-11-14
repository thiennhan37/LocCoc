# Display-name changes

2026-11-12 extension: [profile media](profile-media.md) adds native avatar/cover
upload and removal in independent commits. Media-only operations never invoke
the name writer or spend a rename. Combined legacy URL/name PATCH remains atomic;
a rejected rename also rolls back media replacement/cleanup intent. ADR-013's
30-day policy and administrative name override are unchanged.

Status: Implemented and verified, 2026-11-10. Resolves Q2 in smart-friend-discovery.

## Contract

- `PATCH /users/me` accepts a nonempty displayName, trimmed and NFC normalized,
  at most 255 characters. No username change is introduced.
- Initial nonempty naming is free. An unchanged normalized name is a no-op.
  Other user renames set `lastDisplayNameChangedAt` to database time and require
  at least 2,592,000 elapsed seconds since the last counted change. Equality at
  the boundary is allowed; calendar-month transitions have no effect.
- Omitted displayName leaves the name and cooldown unchanged; null/blank profile
  names are rejected. Empty optional onboarding names mean no name supplied.
- `POST /users/me/username` applies the same name policy transactionally. It cannot
  overwrite an existing name during cooldown. Username claim rolls back on failure.
- Existing `PATCH /users/:id` remains admin-only. Actual name changes create a
  durable audit row (target, admin actor, old/new values, UTC time) atomically.
  Admin changes never modify `lastDisplayNameChangedAt`, including initial naming.
- `GET /users/:id/display-name-history?page=1&limit=20` is admin-only and returns
  paginated audit records. Self changes are recorded too, with actor type USER.
- Profile responses include nullable `lastDisplayNameChangedAt` and
  `nextDisplayNameChangeAt`; NULL means no counted rename yet. A past next date
  means renaming is available. This metadata is not added to public profiles.
- HTTP 409 `DISPLAY_NAME_CHANGE_TOO_SOON` includes `nextDisplayNameChangeAt`.
  All other profile fields in a rejected PATCH remain unchanged.

## Implementation and verification

1. Add a nullable users timestamp and a display-name audit table with target index.
2. Share a pure name policy and a transactional, row-locked name writer between
   profile updates and username onboarding; use database time after acquiring lock.
3. Expose cooldown metadata/history through existing /users Gateway routing.
4. Replace Flutter's edit-profile placeholder with a name editor showing the
   30-day policy, next date, errors and successful updated profile.
5. Verify first/no-op changes, normalization, null/blank input, boundary/month
   transitions, admin authorization/audit/preserved timestamp, rollback, onboarding
   bypass attempts and concurrent renames. Build UserService and analyze Flutter.

Migration preserves existing display_name data and initializes the counted-change
timestamp to NULL. Automatic startup migrations apply the schema; no secrets change.

## Verification results

- Monorepo backend build passed for Gateway, AuthService, UserService and NotificationService.
- UserService: 62 unit tests and 56 E2E tests passed; real PostgreSQL tests use
  isolated schemas that are removed afterward. Six unrelated Kafka/outbox cases
  remain gated by their existing test environment variables.
- Gateway: 16 E2E tests passed. New rename/history cases additionally exercise the
  real Gateway proxy, JWT roles and authoritative account checks in the PostgreSQL suite.
- Flutter: 17 focused tests passed, including six new editor/home tests.
  Flutter analyze and UserService lint report no issues.
- Tested concurrent rename/initial naming/admin override, exact 30-day boundary,
  calendar rollover, identical NFC text, non-name edits, forbidden admin routes,
  onboarding bypass, full rollback on cooldown/audit failure and preserved admin
  cooldown timestamp precision.

## Flutter editor extension — 2026-11-11

[Wave 3](mobile-wave-3.md) extends the existing editor with avatarUrl validation,
preview and clearing through the current PATCH contract. Avatar-only updates omit
displayName and do not spend a rename. A combined name/avatar update remains one
server-atomic operation; cooldown errors retain both inputs and the next allowed
date. Account phone is read-only because it is an Auth-owned projection. The
30-day policy, onboarding restrictions and backend implementation are unchanged.
Current Flutter verification is recorded in the wave-3 spec; historical backend
results above were not rerun or claimed as current backend integration evidence.
