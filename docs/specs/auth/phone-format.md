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
