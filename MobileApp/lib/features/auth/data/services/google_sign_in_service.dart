import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_android/google_sign_in_android.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart'
    as platform;

import '../../domain/models/auth_result.dart';
import '../../domain/models/auth_session.dart';
import 'auth_api_client.dart';

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
  final GoogleSignInAdapter signInAdapter;
  final AuthApiClient apiClient;

  GoogleAuthService({
    GoogleSignInAdapter? signInAdapter,
    AuthApiClient? apiClient,
  }) : signInAdapter = signInAdapter ?? DefaultGoogleSignInAdapter(),
       apiClient = apiClient ?? AuthApiClient();

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
    } catch (e) {
      return AuthFailure('Lỗi đăng nhập Google: ${e.toString()}');
    }
  }

  Future<void> signOut({required AuthSession session}) async {
    final current = _session ?? session;
    try {
      await apiClient.logout(accessToken: current.accessToken);
    } on AuthApiException catch (error) {
      if (error.statusCode != 401) rethrow;
      // Logout requires a valid AT. Preserve rotated credentials if a later
      // logout request fails, so retrying does not reuse the old refresh token.
      try {
        _session = await apiClient.refreshSession(current);
      } on AuthApiException catch (refreshError) {
        if (refreshError.statusCode != 401) rethrow;
        // Both credentials are rejected: the local session is no longer usable.
        await _clearLocalSession();
        return;
      }
      await apiClient.logout(accessToken: _session!.accessToken);
    }
    await _clearLocalSession();
  }

  Future<void> _clearLocalSession() async {
    _session = null;
    try {
      await signInAdapter.signOut();
    } catch (_) {
      // A Google SDK failure must not retain a revoked LocCoc session.
    }
  }
}
