# ADR-013: Rolling display-name cooldown

Date: 2026-11-10. Status: Accepted by user.

UserService owns the display name and enforces a rolling 30 × 24-hour window,
using UTC instants rather than calendar months. The immutable username is unchanged.
The first nonempty display name and saving the same trimmed, NFC-normalized name
do not consume a change. Case or accent changes count. Blank names cannot clear
an existing name and reset the policy. Existing names are preserved; old changes
cannot be reconstructed, so the new timestamp starts as NULL.

Administrator changes bypass the window, record actor/target/old/new/time in the
same database transaction, and preserve the user's last counted change timestamp.
The admin route checks the admin role even when actor and target are the same.
An admin using the normal self-service route follows the normal user policy.

All profile and username-onboarding writes share the policy and lock the target
row before evaluating it. A rejected rename rolls back the entire request.
GET/PATCH profile responses expose the next allowed rename instant; a conflict
also supplies that instant. The existing /users Gateway mapping covers these APIs.

See [the implementation specification](../specs/user/display-name-cooldown.md).
