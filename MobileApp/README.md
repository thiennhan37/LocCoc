# LocCoc mobile app

The app provides authentication options for LocCoc users, including standard email/phone input and **Google Sign-In**.

## Google Social Login Integration

- **UI Components:**
  - Standard email/password login form with local validation.
  - Divider with `HOẶC` text.
  - Custom `GoogleSignInButton` featuring official 4-color Google vector logo, responsive design, and loading state.
  - `HomeScreen` displaying authenticated user identity, role, status, and session token info with logout capability.

- **Backend Connection:**
  - Connects to API Gateway endpoint `POST /auth/social/google` (proxied to `auth-service`).
  - Base URL defaults to:
    - Local development: `http://127.0.0.1:8080` (Web: `http://localhost:8080`)
    - Android debug builds automatically forward port 8080 over ADB for
      connected authorized phones and emulators.
    - Custom override via `--dart-define=API_BASE_URL=https://your-domain.com`
  - Body: `{ "idToken": "<google ID token>", "nonce": "<optional nonce>" }`
  - Success returns `{ authenticated: true, user: {...}, accessToken, refreshToken, expiresIn }`.

## Run and check

```powershell
cd MobileApp
flutter pub get
flutter analyze
flutter test
flutter run
```

### Physical Android phone over USB

Start the API Gateway on the computer (port 8080), connect the phone with USB
debugging authorized, then run `flutter run` normally. The debug build runs
`adb reverse tcp:8080 tcp:8080` automatically, so the same local URL works on a
physical phone and an emulator. The old `10.0.2.2` address only works on emulators.

After disconnecting/reconnecting USB, rerun `flutter run` to restore forwarding,
or run `adb -s <DEVICE_ID> reverse tcp:8080 tcp:8080` manually before hot restart.
If the phone uses Wi-Fi without ADB, supply the computer's reachable LAN URL:

```powershell
flutter run --dart-define=API_BASE_URL=http://<COMPUTER_LAN_IP>:8080
```

The API URL uses the laptop's address. The phone does not need a fixed IP:
the laptop firewall can allow `LocalSubnet` as the remote address, which permits
clients on the local network without listing each phone's IP.
USB forwarding is not used for requests to the laptop's LAN address.
An app built with that LAN URL can continue calling the server after unplugging
USB, provided both devices remain reachable over Wi-Fi and the server stays on.

On Windows, check the active Wi-Fi network profile and Node.js inbound rules.
An existing **Block** rule for Node on the **Public** profile can cause timeouts
even with the correct IP and a server listening on all interfaces. An explicit
block overrides a conflicting allow rule; adding an allow rule alone is not
sufficient. The local development exception now allows Node TCP/8080 from
`LocalSubnet` on the Wi-Fi interface for Public/Private profiles, with no fixed
phone IP or laptop address in that rule. Other Node TCP ports remain blocked
on Public networks and the default inbound policy remains Block. Changing the
phone's DHCP address does not require a firewall update. If the laptop's IP
changes, update the API URL in the Flutter build. A shared Wi-Fi network may
also isolate clients.
See [Microsoft's firewall rule precedence](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules).

Debug builds allow local HTTP. For deployment, provide an explicit HTTPS URL;
ADB forwarding and the debug HTTP permission do not apply to release builds.
Password login and Google token exchange stop waiting after 15 seconds and
allow retry. A retry starts a fresh Google login; tokens are never automatically
resent after an ambiguous network failure.

On some Android graphics drivers, `E/gralloc4: Empty SMPTE 2094-40 data` repeats
while Flutter draws animated frames (such as the loading spinner). This message
alone does not identify a Google authentication failure. Check the API connection
and any actual authentication/network error; disabling hardware acceleration
is not required for this fix.

Android builds (including the IDE Run button) read the public Google Web client ID from root `.env`
(`GOOGLE_SERVER_CLIENT_ID`, or `GOOGLE_CLIENT_IDS` when it has exactly one entry).
Gradle generates the SDK's `default_web_client_id` Android resource. This avoids
losing Google configuration when running without Dart build defines. The optional
`../scripts/run-mobile.ps1` launcher passes the same ID directly to Flutter.
Only the public client ID enters the Android resource. Do not pass the backend `.env`
using `--dart-define-from-file`, because it contains server secrets.

For a manual run or APK build:

```powershell
flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=<WEB_OAUTH_CLIENT_ID>
flutter build apk --debug --dart-define=GOOGLE_SERVER_CLIENT_ID=<WEB_OAUTH_CLIENT_ID>
```

Use the OAuth client with type **Web application**, not the Android client ID.
Include this web ID in auth-service's `GOOGLE_CLIENT_IDS`; keep any required
Android `azp` ID in that backend allowlist too. If the allowlist has several IDs,
select the web ID with `../scripts/run-mobile.ps1 -ServerClientId <WEB_OAUTH_CLIENT_ID>`.
Register the Android OAuth client in the same Google Cloud project with package
`com.example.mobile_app` and the signing certificate SHA-1 (`android/gradlew.bat
signingReport`, run from `android`). A client ID alone cannot register that pairing.

Changing the client ID requires stopping and rerunning the app; hot reload is
insufficient. An explicit Dart define overrides the generated native resource.
When using a separate Google Services Gradle setup, keep the client IDs consistent. See the
[Google Sign-In Android setup](https://pub.dev/packages/google_sign_in_android).

## Android build on Windows

`android/gradle.properties` disables Kotlin incremental compilation because this
Windows setup stores the Pub cache on C: and the project on D:. Otherwise compiling
`google_sign_in_android` fails with `this and base files have different roots` /
`Could not close incremental caches`. Kotlin changes may take longer to compile;
Flutter hot reload is still available.
