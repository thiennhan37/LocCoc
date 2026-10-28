import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform, SocketException;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import '../../../../core/constants/api_constants.dart';
import '../../domain/models/auth_result.dart';
import '../../domain/models/auth_session.dart';

class AuthApiException implements Exception {
  final int statusCode;

  const AuthApiException(this.statusCode);
}

class AuthApiClient {
  final http.Client _httpClient;
  final String _baseUrl;
  final Duration requestTimeout;

  AuthApiClient({
    http.Client? httpClient,
    String? baseUrl,
    this.requestTimeout = const Duration(seconds: 15),
  }) : _httpClient = httpClient ?? http.Client(),
       _baseUrl = baseUrl ?? ApiConstants.baseUrl;

  String _detectPlatform() {
    if (kIsWeb) return 'web';
    try {
      if (Platform.isAndroid) return 'android';
      if (Platform.isIOS) return 'ios';
    } catch (_) {}
    return 'unknown';
  }

  /// Exchanges a Google ID Token with LocCoc backend for an authenticated session.
  Future<AuthResult> loginWithGoogleToken({
    required String idToken,
    String? nonce,
    String? platform,
  }) async {
    final uri = Uri.parse('$_baseUrl${ApiConstants.googleAuthPath}');
    final payload = <String, dynamic>{
      'idToken': idToken,
      if (nonce != null && nonce.isNotEmpty) 'nonce': nonce,
    };

    final effectivePlatform = platform ?? _detectPlatform();

    try {
      final response = await _httpClient
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'x-platform': effectivePlatform,
            },
            body: jsonEncode(payload),
          )
          .timeout(requestTimeout);

      final statusCode = response.statusCode;

      if (statusCode == 200) {
        final Map<String, dynamic> body =
            jsonDecode(response.body) as Map<String, dynamic>;
        final session = AuthSession.fromJson(body);
        return AuthSuccess(session);
      }

      if (statusCode == 400) {
        return const AuthFailure(
          'Dữ liệu đăng nhập không hợp lệ.',
          statusCode: 400,
        );
      }

      if (statusCode == 401) {
        try {
          final body = jsonDecode(response.body);
          if (body is Map<String, dynamic> &&
              (body['code'] == 'SOCIAL_TOKEN_REPLAY' ||
                  body['message'] == 'Social ID token has already been used')) {
            return const AuthFailure(
              'Mã đăng nhập Google đã được sử dụng. Vui lòng đăng nhập lại để lấy mã mới.',
              statusCode: 401,
            );
          }
        } catch (_) {}
        return const AuthFailure(
          'Không thể xác thực đăng nhập Google. Vui lòng thử lại.',
          statusCode: 401,
        );
      }

      if (statusCode == 403) {
        return const AuthFailure(
          'Tài khoản yêu cầu xác minh bảo mật bổ sung.',
          statusCode: 403,
        );
      }

      if (statusCode == 429) {
        return const AuthFailure(
          'Bạn thao tác quá nhanh. Vui lòng chờ ít phút và thử lại.',
          statusCode: 429,
        );
      }

      if (statusCode == 503) {
        return const AuthFailure(
          'Hệ thống đăng nhập Google đang được bảo trì.',
          statusCode: 503,
        );
      }

      // Fallback for other status codes
      String errorMessage = 'Lỗi máy chủ ($statusCode). Vui lòng thử lại.';
      try {
        final Map<String, dynamic> body =
            jsonDecode(response.body) as Map<String, dynamic>;
        if (body['message'] is String &&
            (body['message'] as String).isNotEmpty) {
          errorMessage = body['message'] as String;
        }
      } catch (_) {}

      return AuthFailure(errorMessage, statusCode: statusCode);
    } on TimeoutException {
      return const AuthFailure(
        'Kết nối đến máy chủ LocCoc đã hết thời gian chờ. '
        'Vui lòng kiểm tra kết nối và thử đăng nhập lại.',
      );
    } on SocketException {
      return const AuthFailure(
        'Không thể kết nối đến máy chủ LocCoc. Vui lòng kiểm tra mạng.',
      );
    } catch (e) {
      return AuthFailure('Đã xảy ra lỗi kết nối: ${e.toString()}');
    }
  }

  /// Authenticates with email and password through the LocCoc backend (/auth/login).
  Future<AuthResult> loginWithPassword({
    required String email,
    required String password,
    String? platform,
  }) async {
    final uri = Uri.parse('$_baseUrl/auth/login');
    final payload = <String, dynamic>{'email': email, 'password': password};

    final effectivePlatform = platform ?? _detectPlatform();

    try {
      final response = await _httpClient
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'x-platform': effectivePlatform,
            },
            body: jsonEncode(payload),
          )
          .timeout(requestTimeout);

      final statusCode = response.statusCode;

      if (statusCode == 200) {
        final Map<String, dynamic> body =
            jsonDecode(response.body) as Map<String, dynamic>;
        final session = AuthSession.fromJson(body);
        return AuthSuccess(session);
      }

      if (statusCode == 400) {
        return const AuthFailure(
          'Dữ liệu đăng nhập không hợp lệ.',
          statusCode: 400,
        );
      }

      if (statusCode == 401) {
        return const AuthFailure(
          'Email hoặc mật khẩu không chính xác.',
          statusCode: 401,
        );
      }

      if (statusCode == 429) {
        return const AuthFailure(
          'Bạn thao tác quá nhanh. Vui lòng chờ ít phút và thử lại.',
          statusCode: 429,
        );
      }

      String errorMessage = 'Lỗi máy chủ ($statusCode). Vui lòng thử lại.';
      try {
        final Map<String, dynamic> body =
            jsonDecode(response.body) as Map<String, dynamic>;
        if (body['message'] is String &&
            (body['message'] as String).isNotEmpty) {
          errorMessage = body['message'] as String;
        }
      } catch (_) {}

      return AuthFailure(errorMessage, statusCode: statusCode);
    } on TimeoutException {
      return const AuthFailure(
        'Kết nối đến máy chủ LocCoc đã hết thời gian chờ. '
        'Vui lòng kiểm tra kết nối và thử đăng nhập lại.',
      );
    } on SocketException {
      return const AuthFailure(
        'Không thể kết nối đến máy chủ LocCoc. Vui lòng kiểm tra mạng.',
      );
    } catch (e) {
      return AuthFailure('Đã xảy ra lỗi kết nối: ${e.toString()}');
    }
  }

  /// Revokes the LocCoc session and its refresh tokens through the gateway.
  Future<void> logout({required String accessToken}) async {
    final response = await _httpClient
        .post(
          Uri.parse('$_baseUrl/auth/logout'),
          headers: {
            'Authorization': 'Bearer $accessToken',
            'Accept': 'application/json',
          },
        )
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) {
      throw AuthApiException(response.statusCode);
    }
  }

  Future<AuthSession> refreshSession(AuthSession session) async {
    final response = await _httpClient
        .post(
          Uri.parse('$_baseUrl/auth/refresh'),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode({'refreshToken': session.refreshToken}),
        )
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) {
      throw AuthApiException(response.statusCode);
    }
    final tokens = jsonDecode(response.body) as Map<String, dynamic>;
    if (tokens['accessToken'] is! String ||
        (tokens['accessToken'] as String).isEmpty ||
        tokens['refreshToken'] is! String ||
        (tokens['refreshToken'] as String).isEmpty) {
      throw const FormatException('Invalid session refresh response');
    }
    return AuthSession.fromJson({...session.toJson(), ...tokens});
  }

  void close() {
    _httpClient.close();
  }
}
