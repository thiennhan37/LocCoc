import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;

class ApiConstants {
  /// Base API URL configurable via `--dart-define=API_BASE_URL=...`
  static const String customBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// Android debug builds forward this port to the development computer with
  /// ADB reverse, for both USB phones and emulators. Deployments must override
  /// this local development URL with their HTTPS API endpoint.
  static String get defaultBaseUrl =>
      kIsWeb ? 'http://localhost:8080' : 'http://127.0.0.1:8080';

  /// Resolved base URL to connect with API Gateway
  static String get baseUrl =>
      customBaseUrl.isNotEmpty ? customBaseUrl : defaultBaseUrl;

  /// Direct Socket.IO origin; the gateway HTTP proxy does not handle upgrades.
  static const String customChatSocketUrl = String.fromEnvironment(
    'CHAT_SOCKET_URL',
  );
  static String get chatSocketUrl => resolveChatSocketUrl(
    apiBaseUrl: baseUrl,
    override: customChatSocketUrl,
    android: !kIsWeb && defaultTargetPlatform == TargetPlatform.android,
    explicitApi: customBaseUrl.isNotEmpty,
  );
  static String resolveChatSocketUrl({
    required String apiBaseUrl,
    String override = '',
    bool android = false,
    bool explicitApi = true,
  }) {
    if (override.isNotEmpty) return override.replaceAll(RegExp(r'/+$'), '');
    final api = Uri.parse(apiBaseUrl);
    return Uri(
      scheme: api.scheme,
      host: !explicitApi && android ? '10.0.2.2' : api.host,
      port: 8083,
    ).toString();
  }

  /// Social Login endpoint path (proxied by API Gateway to auth-service)
  static const String googleAuthPath = '/auth/social/google';
  static const String appleAuthPath = '/auth/social/apple';
  static const registerPath = '/auth/register';
  static const loginPath = '/auth/login';
  static const verifyOtpPath = '/auth/verify-otp';
  static const resendOtpPath = '/auth/resend-otp';
  static const refreshPath = '/auth/refresh';
  static const logoutPath = '/auth/logout';
  static const logoutAllPath = '/auth/logout-all';
  static const changePasswordPath = '/auth/change-password';
  static const postsPath = '/posts';
  static const photoPostsPath = '/posts/photos';
  static Uri get login => Uri.parse(baseUrl).resolve(loginPath);
}
