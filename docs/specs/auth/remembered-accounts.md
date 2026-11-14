# Remembered accounts and persistent login

## Behavior

Account identity is always remembered on mobile. Password and Google login share
this rule; login has no storage checkboxes. Selecting a remembered account without
a retained session prefills email and requires authentication.

HomeScreen and username onboarding use the same logout dialog. When the departing
account has no valid saved session, ask **Lưu phiên đăng nhập?**, showing that
account's email. Choices are **Lưu phiên**, **Không lưu phiên**, and **Hủy**.
An already retained account skips the question. Account switching uses the same
choice when retention has not been chosen.

- Save: persist the current account's refresh credential and inactive state in
  one encrypted write; keep its server session, detach device push, clear profile
  scope/navigation and return to the chooser. App restart stays at the chooser
  until an account is selected. Other accounts' retention does not change.
- Do not save: revoke the current server session and remove its local credential,
  keeping remembered identity, then return to the chooser.
- Cancel/back: stay signed in; do not detach push, revoke or save credentials.
- Already saved: keep that session, detach push and return to the chooser without
  asking again. Strict push-detach failures prevent leaving a retained session.

The chooser labels accounts as **Đã lưu phiên** or **Chỉ lưu tài khoản**. A separate
**Gỡ phiên đăng nhập** button confirms and revokes a retained session while keeping
its account. Selecting it afterwards requires authentication. **Xóa khỏi thiết bị**
removes the entire local entry after revocation. Neither action deletes the server
account. The existing delete-account flow also forgets the account locally.

## Storage and refresh

A versioned, API-origin-scoped vault uses flutter_secure_storage. It stores safe
identity/profile, retained refresh credentials and expiry, never passwords, Google
ID tokens or access tokens. Access tokens stay in memory. Mobile identity retention
is automatic; session retention requires the logout choice. Unsupported platforms
continue without persistent credentials. Demo credentials are never persisted.

Vault writes are serialized. Cold start/account selection validates credentials
through server refresh before entering ProfileGate. Refresh is single-flight;
consume the durable credential before network rotation and await replacement
persistence. Late old-account responses cannot restore credentials after leaving.
Interrupted rotation requires a new login, preventing replay of a consumed token.
An abandoned server session may remain until expiry/revocation if the server rotated
before a response was lost. Changing device/API origin does not migrate credentials.

Android backups are disabled. iOS uses unlocked_this_device, without synchronization.
A nonsecret installation marker prevents credentials remaining in Keychain after
uninstall from signing in automatically after reinstall. Biometric unlocking is
not included. Native storage failures never grant access or pretend revocation
succeeded. Explicit identity-only logout remembers legacy accounts as well.

## Verification

Tests cover restart, expiry, revocation, lost refresh response, concurrent rotation,
reinstall protection, account switching, navigation/profile isolation, push-detach
races, logout save/decline/cancel/skip, onboarding logout, and removing a session
without removing its account. Existing password/Google and deletion tests run too.
Physical-device Keychain/Keystore and push delivery still require device checks;
iOS cannot be built with this Windows environment. Use a new native build when
installing the secure-storage plugin; hot reload alone is insufficient.

Verified on 2026-11-02 after the logout-interaction update: analyzer clean,
87/87 Flutter tests passed, Android debug APK built successfully at
MobileApp/build/app/outputs/flutter-apk/app-debug.apk.
