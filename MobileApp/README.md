# LocCoc mobile app

Login sends email/password to POST /auth/login through the gateway. Valid token responses open Home. Tokens remain in memory only; restart requires login.

The new camera-first home uses warm cream, coral cards, rounded photo frames and black pill navigation. It supports live preview, capture/review/retake, camera switching, automatic flash where available, and up to 12 photos held in memory for the current session. It does not upload or send photos, save to the gallery, or request microphone/location access.

## Preview the home screen

```powershell
flutter run -d emulator-5554 --dart-define=PREVIEW_HOME=true
```

Choose another Android/iOS device ID from `flutter devices` if needed. Grant Camera access when prompted. Android 24+ and iOS 13+ are required by the camera plugin. Unsupported platforms or unavailable/denied cameras show a retry panel; after a permanent denial, enable Camera in the device settings. Camera resources are released when leaving the camera tab, covering the page, or backgrounding the app.

Android disables Kotlin incremental compilation to avoid cross-drive cache errors when the Windows Pub cache is on `C:` and the checkout is on `D:`. This trades some build speed for reliable plugin compilation.

`PREVIEW_HOME` selects the initial screen for development only; it does not create an authenticated session. The `/home` named route is ready for navigation after real authentication is implemented. Friends/profile currently display integration placeholders.

## Run and check

```powershell
cd MobileApp
flutter pub get
flutter analyze
flutter test
flutter run
```

To build an Android debug APK, run `flutter build apk --debug`. No OIDC issuer, client ID, redirect URI, or mobile authentication environment variable is needed.

## API configuration

URL: lib/core/constants/api_constants.dart. Default Android Emulator: http://10.0.2.2:8080. Start PostgreSQL, Redis, Auth Service and gateway. For a physical phone on the same Wi-Fi use flutter run --dart-define=API_BASE_URL=http://YOUR_PC_LAN_IP:8080 and allow port 8080 through the firewall. Android debug permits local HTTP; production must use HTTPS. Refresh/logout and persistent secure token storage are not implemented.


## Service APIs

All paths live in `lib/core/constants/api_constants.dart`. `API_BASE_URL` selects the gateway origin.
`AuthApi` supports login, register, verifyOtp (returns bool; false means rejected OTP), resendOtp,
refresh, logout, logoutAll and changePassword. Protected requests attach the current Bearer token.
Refresh calls are coalesced; refresh and password changes save the rotated token pair.
There are no automatic mutation retries. Call refresh explicitly when needed; rejected refresh clears the session.
`PostApi` supports create and delete with explicit ownerId; use AuthApi.userId after login.
Create accepts an existing media storage key, not a local camera file. Upload is not implemented by the backend.
These additions expose callable Dart services; registration/OTP/account settings and post submission widgets remain to be wired.

```dart
final auth = AuthApi();
await auth.register(email: email, password: password);
final verified = await auth.verifyOtp(email: email, otp: otp);
if (verified) await auth.login(email, password);
final ownerId = AuthApi.userId;
if (ownerId != null) {
  final post = await PostApi().create(ownerId: ownerId, mediaKey: uploadedKey, mediaType: 0);
  await PostApi().delete(postId: post['id'] as String, ownerId: ownerId);
}
await auth.logout();
```
