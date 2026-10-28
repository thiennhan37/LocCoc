import 'package:flutter/foundation.dart' show kIsWeb;

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

  /// Social Login endpoint path (proxied by API Gateway to auth-service)
  static const String googleAuthPath = '/auth/social/google';
  static const String appleAuthPath = '/auth/social/apple';
}
