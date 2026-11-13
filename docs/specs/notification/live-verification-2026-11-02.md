# Live friendship and notification verification — 2026-11-02

Verified against the user's running local services through Gateway at
`http://127.0.0.1:8080`, using the authorized test accounts `antony2` and `antony4`.
No passwords, bearer tokens or Firebase credentials are included in this report.

## Observed results

| Scenario | Result |
| --- | --- |
| Login and fetch both user profiles | 200; expected usernames |
| antony2 sends a request to antony4 | 201; receiver's incoming list contains PENDING request |
| Send duplicate pending request | 409; no extra request created |
| Sender attempts to accept their own outgoing request | 404 |
| Receiver's inbox after send | One FRIEND_REQUEST_RECEIVED with correct actor/request |
| antony4 accepts | 200; both profiles report FRIENDS |
| Sender's inbox after acceptance | One FRIEND_REQUEST_ACCEPTED |
| Accept the same request again | 409 |
| Read another account's notification | 404; owner's counts remain unchanged |
| Mark receiver inbox seen | unseenCount 1 -> 0; unreadCount remains 1 |
| Read receiver notification twice | Same readAt; counts become 0/0 |
| Remove friendship to prepare reverse scenario | 204 |
| Log out antony2 verification session | 200; subsequent protected request returns 401 |
| antony4 sends while that recipient session is revoked | 201; notification persisted before recipient logs in again |
| antony2 logs in again | 200; pending request and stored notification available |
| antony2 accepts reverse request | 200; FRIENDS restored; antony4 receives acceptance notification |

First request: `222a1ad8-f8b0-423b-9e4e-b0bfc6690e77`.
Reverse request: `d681c90c-1f6a-4959-9ee7-250ba24dc4b3`.
Read-only database checks found four source outbox events, all published, and
exactly four corresponding notifications. Quarantine contained zero entries.

## Limits and remaining device checks

This verifies the real Gateway -> UserService -> outbox -> Kafka ->
NotificationService -> PostgreSQL inbox path. Logging out a verification session
tests inbox persistence without that session; it does not establish that every
other session for the account is offline or simulate a device losing connectivity.

FCM_ENABLED is true in the NotificationService local configuration, but its
configured `../secrets/firebase-admin.json` file does not exist. At the final check,
push_devices and push_jobs both contained zero rows. No actual FCM send or device
delivery was exercised. Foreground, background, terminated-app and offline-device
delivery remain unverified. Flutter push initialization also requires its build
configuration (`FCM_ENABLED` and Firebase options); a generated firebase_options.dart
file alone is not used by the current PushNotifications initialization code.

Final state: accounts are friends; four inbox records remain for inspection.
antony2 counts: unseen=2, unread=2. antony4 counts: unseen=1, unread=1.
All sessions created by this verification were logged out using the scoped logout
endpoint. Existing application sessions were not explicitly revoked.
No application code, service configuration or secrets were changed.

Earlier automated checks in this chat: notification configuration tests 4 passed;
Gateway notification routing test 1 passed. The 23 database-dependent notification
tests were skipped because no disposable test database URL was supplied.
