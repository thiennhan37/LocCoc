# LocCoc mobile app

The app currently displays only a basic login form with an email/phone field and a password field. Input validation runs locally. Pressing **Đăng nhập** does not call a backend, create a session, or issue a token; it displays an unavailable message until the future identity service is ready.

## Run and check

```powershell
cd MobileApp
flutter pub get
flutter analyze
flutter test
flutter run
```

To build an Android debug APK, run `flutter build apk --debug`. No OIDC issuer, client ID, redirect URI, or mobile authentication environment variable is needed.

## TODO: identity integration

Agree on the login, refresh and logout API contract before connecting this form. The app currently calls none of those endpoints. Add token storage and authenticated navigation only when the identity service exists; do not treat a successful form validation as authentication.
