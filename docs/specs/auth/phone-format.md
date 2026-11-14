# Auth phone format

The optional phone field uses international +country-code format. For Vietnam,
0375456123 must be submitted as +84375456123. The backend strips spaces, parentheses,
dots, and hyphens, then validates the shape: + followed by 8–15 digits, with a
nonzero first digit. This is a format check, not proof that the number exists.
No country is guessed for local numbers. Omit phone when not supplying one.

Invalid format returns HTTP 400 with code INVALID_PHONE_NUMBER and an example.
This applies to registration and phone-based OTP flows sharing normalizePhone.
Duplicate normalized phones retain the generic registration-accepted response to
avoid account enumeration. No database migration or stored-number rewrite is needed.

## Flutter profile ownership boundary — 2026-11-11

Phone is owned by AuthService `accounts.phone`. UserService projects the account
snapshot/events into `users.phone` on a newer account version; a profile-level
edit can therefore be overwritten. There is no separate contactPhone contract.
The wave-3 profile editor displays account phone read-only and never sends phone
in its profile PATCH. Format validity is not a verification badge. An IAM phone
change needs an Auth-owned reauthentication/verification flow, or a separately
specified User-owned contact field; see [wave 3](../user/mobile-wave-3.md).
