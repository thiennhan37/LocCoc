import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_android/google_sign_in_android.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart'
    as platform;

import '../../domain/models/auth_result.dart';
import '../../domain/models/auth_session.dart';
import '../../domain/models/account_security.dart';
import 'auth_api_client.dart';
import 'account_vault.dart';

/// Lightweight data holder for Google user credentials.
class GoogleSignInAccountData {
  final String idToken;
  final String? email;
  final String? displayName;
  final String? photoUrl;
  final String? nonce;

  const GoogleSignInAccountData({
    required this.idToken,
    this.email,
    this.displayName,
    this.photoUrl,
    this.nonce,
  });
}

/// Abstraction for Google Sign In platform channel / SDK, allowing full mockability in tests.
abstract class GoogleSignInAdapter {
  Future<GoogleSignInAccountData?> signIn({String? nonce});
  Future<void> signOut();
}

/// Each Android request owns its nonce, so Credential Manager cannot return
/// a token already consumed by a previous LocCoc login.
class AndroidGoogleSignInAdapter implements GoogleSignInAdapter {
  final String? serverClientId;
  final platform.GoogleSignInPlatform Function() _createClient;
  platform.GoogleSignInPlatform? _client;

  AndroidGoogleSignInAdapter({
    this.serverClientId,
    platform.GoogleSignInPlatform Function()? createClient,
  }) : _createClient = createClient ?? GoogleSignInAndroid.new;

  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async {
    final random = Random.secure();
    final requestNonce =
        nonce ??
        base64UrlEncode(
          List<int>.generate(32, (_) => random.nextInt(256)),
        ).replaceAll('=', '');
    final client = _createClient();
    await client.init(
      platform.InitParameters(
        serverClientId: serverClientId,
        nonce: requestNonce,
      ),
    );
    _client = client;
    try {
      final result = await client.authenticate(
        const platform.AuthenticateParameters(),
      );
      final idToken = result.authenticationTokens.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw StateError('Không nhận được Google ID Token từ thiết bị.');
      }
      return GoogleSignInAccountData(
        idToken: idToken,
        email: result.user.email,
        displayName: result.user.displayName,
        photoUrl: result.user.photoUrl,
        nonce: requestNonce,
      );
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    }
  }

  @override
  Future<void> signOut() async {
    await _client?.signOut(const platform.SignOutParams());
  }
}

/// Default implementation wrapping the official `google_sign_in` 7.x package.
class DefaultGoogleSignInAdapter implements GoogleSignInAdapter {
  // Public Web OAuth client ID; backend secrets must never enter mobile builds.
  static const _serverClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  final GoogleSignIn _googleSignIn;
  final GoogleSignInAdapter? _androidAdapter;
  bool _initialized = false;
  final String? clientId;
  final String? serverClientId;

  DefaultGoogleSignInAdapter({
    this.clientId,
    String? serverClientId,
    GoogleSignIn? googleSignIn,
  }) : serverClientId =
           serverClientId ??
           (_serverClientId.trim().isEmpty ? null : _serverClientId.trim()),
       _googleSignIn = googleSignIn ?? GoogleSignIn.instance,
       _androidAdapter =
           googleSignIn == null &&
               !kIsWeb &&
               defaultTargetPlatform == TargetPlatform.android
           ? AndroidGoogleSignInAdapter(
               serverClientId:
                   serverClientId ??
                   (_serverClientId.trim().isEmpty
                       ? null
                       : _serverClientId.trim()),
             )
           : null;

  Future<void> _ensureInitialized({String? nonce}) async {
    if (_initialized) return;
    await _googleSignIn.initialize(
      clientId: clientId,
      serverClientId: serverClientId,
      nonce: nonce,
    );
    _initialized = true;
  }

  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async {
    if (_androidAdapter case final adapter?) {
      return adapter.signIn(nonce: nonce);
    }
    await _ensureInitialized(nonce: nonce);

    try {
      final GoogleSignInAccount account = await _googleSignIn.authenticate();
      final idToken = account.authentication.idToken;

      if (idToken == null || idToken.isEmpty) {
        throw Exception('Không nhận được Google ID Token từ thiết bị.');
      }

      return GoogleSignInAccountData(
        idToken: idToken,
        email: account.email,
        displayName: account.displayName,
        photoUrl: account.photoUrl,
      );
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return null; // User cancelled the sign-in modal
      }
      rethrow;
    }
  }

  @override
  Future<void> signOut() async {
    if (_androidAdapter case final adapter?) {
      return adapter.signOut();
    }
    await _googleSignIn.signOut();
  }
}

/// Orchestrator service combining Google sign-in and LocCoc Auth API client.
class GoogleAuthService {
  AuthSession? _session;
  final AccountVault vault;
  Future<AuthSession>? _refreshing;
  bool _leaving = false;
  int _generation = 0;
  int get generation => _generation;
  Completer<void>? _securityOperation;
  final ValueNotifier<SessionReplacement?> sessionReplaced = ValueNotifier(
    null,
  );
  int? _handledReplacement;
  final Set<Future<void> Function()> _replacementCleanups = {};
  void addReplacementCleanup(Future<void> Function() cleanup) =>
      _replacementCleanups.add(cleanup);
  void removeReplacementCleanup(Future<void> Function() cleanup) =>
      _replacementCleanups.remove(cleanup);
  bool claimSessionReplacement() {
    final event = sessionReplaced.value;
    if (event == null ||
        event.generation != _generation ||
        _handledReplacement == event.generation) {
      return false;
    }
    _handledReplacement = event.generation;
    return true;
  }

  final ValueNotifier<int?> sessionEnded = ValueNotifier(null);
  int? _handledEnd;
  bool claimSessionEnd() {
    final event = sessionEnded.value;
    if (event == null || event != _generation || _handledEnd == event) {
      return false;
    }
    _handledEnd = event;
    return true;
  }

  String? _unusableRefreshToken;
  Future<void>? _ending;
  int? _endingGeneration;
  final GoogleSignInAdapter signInAdapter;
  final AuthApiClient apiClient;

  GoogleAuthService({
    GoogleSignInAdapter? signInAdapter,
    AuthApiClient? apiClient,
    AccountVault? vault,
  }) : signInAdapter = signInAdapter ?? DefaultGoogleSignInAdapter(),
       vault =
           vault ??
           (apiClient == null
               ? AccountVault.shared
               : AccountVault.forOrigin(apiClient.origin)),
       apiClient = apiClient ?? AuthApiClient();

  Future<void> acceptLogin(
    AuthSession session, {
    required bool remember,
    required bool retain,
  }) async {
    final generation = ++_generation;
    final previousSecurity = _securityOperation;
    _securityOperation = null;
    if (previousSecurity != null && !previousSecurity.isCompleted) {
      previousSecurity.complete();
    }
    sessionReplaced.value = null;
    _session = null;
    _leaving = false;
    _refreshing = null;
    _unusableRefreshToken = null;
    sessionEnded.value = null;
    if (session.accessToken.startsWith('demo-')) {
      _session = session;
      return;
    }
    try {
      await vault.remember(
        session,
        remember: remember,
        retain: remember && retain,
      );
    } catch (_) {
      // Do not leave a newly created session behind after consent/storage fails.
      try {
        await apiClient.logout(accessToken: session.accessToken);
      } catch (_) {}
      if (generation == _generation) _session = null;
      throw StateError(
        'Không thể lưu lựa chọn đăng nhập an toàn. Hãy mở khóa thiết bị và thử lại.',
      );
    }
    if (generation != _generation) throw const SessionChangedException();
    _session = session;
  }

  Future<AuthSession?> resume(String id) async {
    if (_leaving || _refreshing != null) {
      throw StateError('Session operation in progress');
    }
    final beforeConsume = _generation;
    final saved = await vault.consume(id);
    if (beforeConsume != _generation) throw const SessionChangedException();
    if (saved == null) return null;
    final generation = ++_generation;
    final pending = _rotate(saved, generation);
    _refreshing = pending;
    try {
      final next = await pending;
      if (generation != _generation) throw const SessionChangedException();
      await vault.select(id, isCurrent: () => generation == _generation);
      if (generation != _generation) throw const SessionChangedException();
      return next;
    } finally {
      if (identical(_refreshing, pending)) _refreshing = null;
    }
  }

  Future<AuthSession> refreshSession(AuthSession current) => _refresh(current);

  Future<AuthSession> _refresh(
    AuthSession current, {
    bool whileLeaving = false,
    bool duringSecurity = false,
  }) async {
    final security = _securityOperation;
    if (!duringSecurity && security != null) {
      await security.future;
    }
    if ((_leaving && !whileLeaving) ||
        (_session == null && _generation > 0) ||
        (_session != null && _session!.user.id != current.user.id)) {
      throw const SessionChangedException();
    }
    if (_session != null && _session!.refreshToken != current.refreshToken) {
      return _session!;
    }
    if (_refreshing case final pending?) return pending;
    if (_unusableRefreshToken == current.refreshToken) {
      // Delivery of the previous rotation was ambiguous. A fresh login is needed;
      // no second request may reuse that single-use token.
      throw StateError('Refresh requires reauthentication');
    }
    final generation = _generation;
    final pending = () async {
      await vault.beginRotation(current.user.id);
      if (generation != _generation) throw const SessionChangedException();
      return _rotate(current, generation);
    }();
    _refreshing = pending;
    try {
      return await pending;
    } finally {
      if (identical(_refreshing, pending)) _refreshing = null;
    }
  }

  void _ensureGeneration(int expected) {
    if (expected != _generation || _session == null) {
      throw const SessionChangedException();
    }
  }

  Future<T> _securityAction<T>(
    AuthSession expected,
    Future<T> Function(int) action,
  ) async {
    if (_leaving || _securityOperation != null) {
      throw AccountSecurityBusyException();
    }
    if (_session?.user.id != expected.user.id ||
        expected.accessToken.startsWith('demo-')) {
      throw const SessionChangedException();
    }
    final gate = Completer<void>();
    _securityOperation = gate;
    final generation = _generation;
    try {
      try {
        await _refreshing;
      } catch (_) {
        _ensureGeneration(generation);
        rethrow;
      }
      _ensureGeneration(generation);
      return await action(generation);
    } finally {
      if (identical(_securityOperation, gate)) _securityOperation = null;
      if (!gate.isCompleted) gate.complete();
    }
  }

  Future<Map<String, dynamic>> _securityRequest(
    String path,
    int generation, {
    Map<String, dynamic>? body,
  }) async {
    _ensureGeneration(generation);
    final current = _session!;
    try {
      final result = await apiClient.serviceRequest(
        'POST',
        'auth',
        path,
        current.accessToken,
        body: body,
      );
      _ensureGeneration(generation);
      return result;
    } on AuthApiException catch (error) {
      _ensureGeneration(generation);
      if (error.statusCode != 401) rethrow;
      if (path == 'change-password') {
        var expiredAccess = false;
        try {
          await apiClient.serviceRequest(
            'GET',
            'auth',
            'sessions?limit=1',
            current.accessToken,
          );
          _ensureGeneration(generation);
        } on AuthApiException catch (probe) {
          _ensureGeneration(generation);
          if (probe.statusCode == 401) {
            expiredAccess = true;
          } else {
            throw SessionProbeUnavailableException();
          }
        } catch (_) {
          _ensureGeneration(generation);
          throw SessionProbeUnavailableException();
        }
        if (!expiredAccess) rethrow;
      }
      await _refresh(current, duringSecurity: true);
      _ensureGeneration(generation);
      final result = await apiClient.serviceRequest(
        'POST',
        'auth',
        path,
        _session!.accessToken,
        body: body,
      );
      _ensureGeneration(generation);
      return result;
    }
  }

  Future<void> _markPasswordUncertain(int generation) async {
    _ensureGeneration(generation);
    _unusableRefreshToken = _session!.refreshToken;
    try {
      await vault.beginRotation(
        _session!.user.id,
        isCurrent: () => generation == _generation,
      );
    } catch (_) {
      /* The in-memory fence still forbids replay; no success is reported. */
    }
    _ensureGeneration(generation);
  }

  Future<SessionReplacement> changePassword(
    AuthSession expected,
    String currentPassword,
    String newPassword,
  ) => _securityAction(expected, (generation) async {
    late final AuthSession next;
    try {
      final data = await _securityRequest(
        'change-password',
        generation,
        body: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
      next = passwordReplacement(_session!, data);
    } on SessionProbeUnavailableException {
      rethrow;
    } on AuthApiException catch (error) {
      if (generation != _generation) throw const SessionChangedException();
      if ([400, 401, 403, 409, 422, 429].contains(error.statusCode)) rethrow;
      await _markPasswordUncertain(generation);
      throw PasswordChangeUncertainException();
    } catch (_) {
      if (generation != _generation) throw const SessionChangedException();
      await _markPasswordUncertain(generation);
      throw PasswordChangeUncertainException();
    }
    _ensureGeneration(generation);
    final replacementGeneration = ++_generation;
    _session = next;
    _unusableRefreshToken = null;
    _refreshing = null;
    var retentionConfirmed = true;
    try {
      await vault.rotated(
        next,
        isCurrent: () => replacementGeneration == _generation,
      );
    } catch (_) {
      retentionConfirmed = false;
      try {
        await vault.beginRotation(
          next.user.id,
          isCurrent: () => replacementGeneration == _generation,
        );
      } catch (_) {}
    }
    _ensureGeneration(replacementGeneration);
    for (final cleanup in _replacementCleanups.toList()) {
      try {
        await cleanup();
      } catch (_) {
        /* Native detach cannot undo a committed password change. */
      }
      _ensureGeneration(replacementGeneration);
    }
    final event = SessionReplacement(
      previousGeneration: generation,
      generation: replacementGeneration,
      session: next,
      retentionConfirmed: retentionConfirmed,
    );
    sessionReplaced.value = event;
    return event;
  });

  Future<void> logoutAll(AuthSession expected) =>
      _securityAction(expected, (generation) async {
        final data = await _securityRequest('logout-all', generation);
        if (data['revokedSessions'] is! int ||
            (data['revokedSessions'] as int) < 0) {
          throw const FormatException('Invalid logout-all acknowledgement');
        }
        _ensureGeneration(generation);
        await clearRevokedSession(_session!);
      });

  Future<AuthSession> _rotate(AuthSession current, int generation) async {
    try {
      final next = await apiClient.refreshSession(current);
      if (next.user.id != current.user.id || generation != _generation) {
        throw const SessionChangedException();
      }
      await vault.rotated(next, isCurrent: () => generation == _generation);
      if (generation != _generation) throw const SessionChangedException();
      _session = next;
      return next;
    } catch (error) {
      if (generation != _generation) rethrow;
      _unusableRefreshToken = current.refreshToken;
      if (error is AuthApiException && error.statusCode == 401) {
        await clearRevokedSession(current);
      } else {
        // Keep the usable AT on transport/server errors, but erase the possibly
        // consumed RT before any future attempt (including after restart).
        await vault.clearCredential(
          current.user.id,
          isCurrent: () => generation == _generation,
        );
      }
      rethrow;
    }
  }

  Future<void> suspend() async {
    if (_securityOperation != null) throw AccountSecurityBusyException();
    final generation = _generation;
    _leaving = true;
    try {
      try {
        await _refreshing;
      } catch (_) {}
      if (generation != _generation) throw const SessionChangedException();
      final current = _session;
      final retained =
          current != null &&
          (await vault.list()).any(
            (account) => account.id == current.user.id && account.canContinue,
          );
      if (generation != _generation) throw const SessionChangedException();
      if (current != null && !retained) {
        await _revoke(current);
        return;
      }
      await vault.select(null, isCurrent: () => generation == _generation);
      if (generation != _generation) throw const SessionChangedException();
      _generation++;
      _session = null;
    } finally {
      _leaving = false;
    }
  }

  Future<void> removeSaved(String id) async {
    await removeSavedSession(id);
    await vault.clearCredential(id, forget: true);
  }

  Future<void> removeSavedSession(String id) async {
    final saved = (await vault.list()).where((a) => a.id == id).first;
    if (saved.canContinue) {
      try {
        final session = await resume(id);
        if (session != null) await signOut(session: session);
      } on AuthApiException catch (e) {
        if (e.statusCode != 401 && e.statusCode != 403) rethrow;
      }
    }
    await vault.clearCredential(id);
  }

  Future<bool> hasSavedSession(String id) async {
    try {
      await _refreshing;
    } catch (_) {}
    return (await vault.list()).any(
      (account) => account.id == id && account.canContinue,
    );
  }

  Future<void> leaveRetainingSession(AuthSession session) async {
    if (_securityOperation != null) throw AccountSecurityBusyException();
    if (_leaving) throw StateError('Session operation in progress');
    _leaving = true;
    final generation = _generation;
    try {
      try {
        await _refreshing;
      } catch (_) {}
      if (generation != _generation) throw const SessionChangedException();
      if (_session == null && _generation > 0) {
        throw const AuthApiException(401);
      }
      final current = _session ?? session;
      if (_unusableRefreshToken == current.refreshToken) {
        throw StateError('Refresh requires reauthentication');
      }
      if (current.user.id != session.user.id) throw const AuthApiException(401);
      if (!vault.supported) {
        throw StateError('Secure session storage unavailable');
      }
      await vault.remember(
        current,
        remember: true,
        retain: true,
        active: false,
        isCurrent: () => generation == _generation,
      );
      if (generation != _generation) throw const SessionChangedException();
      _generation++;
      _session = null;
    } finally {
      _leaving = false;
    }
  }

  /// Executes the full Google Sign-in flow:
  /// 1. Prompts user with native Google sign-in UI
  /// 2. Retrieves Google ID Token
  /// 3. Sends ID Token to LocCoc API Gateway (`/auth/social/google`)
  /// 4. Returns [AuthResult] (Success, Cancelled, or Failure)
  Future<AuthResult> signInWithGoogle({String? nonce}) async {
    try {
      final accountData = await signInAdapter.signIn(nonce: nonce);
      if (accountData == null) {
        return const AuthCancelled();
      }

      final result = await apiClient.loginWithGoogleToken(
        idToken: accountData.idToken,
        nonce: accountData.nonce ?? nonce,
      );
      if (result case AuthSuccess(:final session)) {
        _session = session;
      }
      return result;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.clientConfigurationError) {
        return const AuthFailure(
          'Đăng nhập Google chưa được cấu hình đúng. '
          'Vui lòng liên hệ quản trị viên để kiểm tra cấu hình Google.',
        );
      }
      return const AuthFailure('Không thể đăng nhập Google. Vui lòng thử lại.');
    } catch (_) {
      return const AuthFailure('Không thể đăng nhập Google. Vui lòng thử lại.');
    }
  }

  Future<void> signOut({required AuthSession session}) async {
    if (_securityOperation != null) throw AccountSecurityBusyException();
    if (_leaving) throw StateError('Session operation in progress');
    _leaving = true;
    try {
      await _revoke(session);
    } finally {
      _leaving = false;
    }
  }

  Future<void> _revoke(AuthSession session) async {
    final generation = _generation;
    try {
      await _refreshing;
    } catch (_) {}
    if (sessionEnded.value == _generation) return;
    if (generation != _generation ||
        (_session != null && _session!.user.id != session.user.id)) {
      throw const SessionChangedException();
    }
    _session ??= session;
    final current = _session ?? session;
    await vault.rememberIdentity(current);
    if (generation != _generation) throw const SessionChangedException();
    try {
      await apiClient.logout(accessToken: current.accessToken);
    } on AuthApiException catch (error) {
      if (generation != _generation) throw const SessionChangedException();
      if (error.statusCode != 401) rethrow;
      // Logout requires a valid AT. Preserve rotated credentials if a later
      // logout request fails, so retrying does not reuse the old refresh token.
      try {
        await _refresh(current, whileLeaving: true);
      } on AuthApiException catch (refreshError) {
        if (refreshError.statusCode != 401) rethrow;
        // Both credentials are rejected: the local session is no longer usable.
        if (sessionEnded.value != _generation) await _clearLocalSession();
        return;
      }
      await apiClient.logout(accessToken: _session!.accessToken);
    }
    if (generation != _generation) throw const SessionChangedException();
    await _clearLocalSession();
  }

  AuthSession? get session => _session;

  void updateSession(AuthSession session) {
    if (_leaving ||
        (_session == null && _generation > 0) ||
        (_session != null &&
            (_session!.user.id != session.user.id ||
                _session!.refreshToken != session.refreshToken))) {
      return;
    }
    _session = session;
  }

  Future<void> clearSession() => _clearLocalSession(forget: true);

  Future<void> clearRevokedSession(AuthSession current) {
    if (_session != null &&
        (_session!.user.id != current.user.id ||
            _session!.refreshToken != current.refreshToken)) {
      return Future.value();
    }
    if (_endingGeneration == _generation && _ending != null) return _ending!;
    if (_session == null && sessionEnded.value == _generation) {
      return Future.value();
    }
    final ending = ++_generation;
    _endingGeneration = ending;
    _session = null;
    _leaving = true;
    final pending = _clearRevoked(current, ending);
    _ending = pending;
    return pending.whenComplete(() {
      if (identical(_ending, pending)) _ending = null;
    });
  }

  Future<void> _clearRevoked(AuthSession current, int ending) async {
    try {
      try {
        await vault.rememberIdentity(
          current,
          isCurrent: () => ending == _generation,
        );
        await vault.clearCredential(
          current.user.id,
          isCurrent: () => ending == _generation,
        );
      } finally {
        if (ending == _generation) {
          try {
            await signInAdapter.signOut();
          } catch (_) {}
          if (ending == _generation) sessionEnded.value = ending;
        }
      }
    } finally {
      if (ending == _generation) _leaving = false;
    }
  }

  Future<void> _clearLocalSession({bool forget = false}) async {
    final id = _session?.user.id;
    final demo = _session?.accessToken.startsWith('demo-') ?? false;
    final ending = ++_generation;
    _session = null;
    if (id != null && !demo) {
      await vault.clearCredential(
        id,
        forget: forget,
        isCurrent: () => ending == _generation,
      );
    }
    try {
      await signInAdapter.signOut();
    } catch (_) {
      // A Google SDK failure must not retain a revoked LocCoc session.
    }
  }
}
