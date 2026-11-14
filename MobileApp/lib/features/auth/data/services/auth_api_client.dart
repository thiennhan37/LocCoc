import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform, SocketException, HttpDate;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import '../../../../core/constants/api_constants.dart';
import '../../domain/models/auth_result.dart';
import '../../domain/models/auth_session.dart';

class AuthApiException implements Exception {
  final int statusCode;
  final String? code;
  final String? message;
  final DateTime? nextDisplayNameChangeAt;
  final Duration? retryAfter;

  const AuthApiException(
    this.statusCode, {
    this.code,
    this.message,
    this.nextDisplayNameChangeAt,
    this.retryAfter,
  });
}

/// The caller belongs to a departed session; never present this as a server 401.
class SessionChangedException extends AuthApiException {
  const SessionChangedException() : super(0);
}

class SessionExpiredException extends AuthApiException {
  const SessionExpiredException() : super(401);
}

class AuthApiClient {
  final http.Client _httpClient;
  final String _baseUrl;
  String get baseUrl => _baseUrl;
  final Duration requestTimeout;
  String get origin => Uri.parse(_baseUrl).origin;

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

  Future<AuthResult> loginWithGoogleToken({
    required String idToken,
    String? nonce,
    String? platform,
  }) => _login(ApiConstants.googleAuthPath, {
    'idToken': idToken,
    if (nonce != null && nonce.isNotEmpty) 'nonce': nonce,
  }, platform);

  Future<AuthResult> loginWithPassword({
    required String email,
    required String password,
    String? platform,
  }) => _login('/auth/login', {'email': email, 'password': password}, platform);

  Future<AuthResult> _login(
    String path,
    Map<String, dynamic> payload,
    String? platform,
  ) async {
    try {
      final response = await _httpClient
          .post(
            Uri.parse('$_baseUrl$path'),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'x-platform': platform ?? _detectPlatform(),
            },
            body: jsonEncode(payload),
          )
          .timeout(requestTimeout);
      if (response.statusCode == 200) {
        return AuthSuccess(
          AuthSession.fromJson(
            jsonDecode(response.body) as Map<String, dynamic>,
          ),
        );
      }
      final wait = retryAfter(response.headers['retry-after']);
      if (response.statusCode == 401 && path != '/auth/login') {
        try {
          final error = jsonDecode(response.body);
          if (error is Map && error['code'] == 'SOCIAL_TOKEN_REPLAY') {
            return const AuthFailure(
              'Mã đăng nhập Google đã được sử dụng. Vui lòng đăng nhập lại để lấy mã mới.',
              statusCode: 401,
            );
          }
        } catch (_) {}
      }
      final message = switch (response.statusCode) {
        400 || 422 => 'Dữ liệu đăng nhập không hợp lệ.',
        401 =>
          path == '/auth/login'
              ? 'Email hoặc mật khẩu không chính xác.'
              : 'Không thể xác thực đăng nhập Google. Vui lòng đăng nhập lại.',
        403 => 'Tài khoản hiện không được phép đăng nhập.',
        429 =>
          wait == null
              ? 'Bạn thao tác quá nhanh. Vui lòng chờ ít phút và thử lại.'
              : 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ${wait.inSeconds} giây.',
        _ => 'Máy chủ đăng nhập tạm thời không khả dụng. Vui lòng thử lại.',
      };
      return AuthFailure(
        message,
        statusCode: response.statusCode,
        retryAfter: wait,
      );
    } on TimeoutException {
      return const AuthFailure(
        'Kết nối đến máy chủ LocCoc đã hết thời gian chờ. Vui lòng kiểm tra kết nối và thử lại.',
        category: AuthFailureKind.network,
      );
    } on SocketException {
      return const AuthFailure(
        'Không thể kết nối đến máy chủ LocCoc. Vui lòng kiểm tra mạng.',
        category: AuthFailureKind.network,
      );
    } on http.ClientException {
      return const AuthFailure(
        'Không thể kết nối đến máy chủ LocCoc. Vui lòng kiểm tra mạng.',
        category: AuthFailureKind.network,
      );
    } catch (_) {
      return const AuthFailure('Chưa thể đăng nhập. Vui lòng thử lại.');
    }
  }

  static Duration? retryAfter(String? value) {
    if (value == null) return null;
    final seconds = int.tryParse(value.trim());
    if (seconds != null) return Duration(seconds: seconds.clamp(0, 2147483647));
    try {
      final delta = HttpDate.parse(value).difference(DateTime.now().toUtc());
      return Duration(
        seconds: (delta.inMilliseconds / 1000).ceil().clamp(0, 2147483647),
      );
    } catch (_) {
      return null;
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
        .timeout(requestTimeout);
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
        .timeout(requestTimeout);
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

  Future<Map<String, dynamic>> userRequest(
    String method,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    return serviceRequest(method, 'users', path, accessToken, body: body);
  }

  Future<Map<String, dynamic>> serviceRequest(
    String method,
    String area,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    if (!['users', 'notifications', 'auth'].contains(area)) {
      throw ArgumentError('Invalid API area');
    }
    final suffix = path.isEmpty || path.startsWith('?') ? path : '/$path';
    final request = http.Request(method, Uri.parse('$_baseUrl/$area$suffix'));
    request.headers.addAll({
      'Authorization': 'Bearer $accessToken',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (area == 'auth' && path == 'change-password')
        'x-platform': _detectPlatform(),
    });
    if (body != null) request.body = jsonEncode(body);
    return _sendServiceRequest(request, requestTimeout);
  }

  Future<Map<String, dynamic>> uploadMedia(
    String kind,
    List<int> bytes,
    String contentType,
    String accessToken,
  ) {
    if (!['avatar', 'cover'].contains(kind)) {
      throw ArgumentError('Invalid media kind');
    }
    final request = http.Request(
      'PUT',
      Uri.parse('$_baseUrl/users/me/media/$kind'),
    );
    request.headers.addAll({
      'Authorization': 'Bearer $accessToken',
      'Accept': 'application/json',
      'Content-Type': contentType,
    });
    request.bodyBytes = bytes;
    return _sendServiceRequest(request, const Duration(seconds: 60));
  }

  Future<Map<String, dynamic>> _sendServiceRequest(
    http.BaseRequest request,
    Duration timeout,
  ) async {
    final response = await http.Response.fromStream(
      await _httpClient.send(request).timeout(timeout),
    ).timeout(timeout);
    Map<String, dynamic> data = {};
    if (response.body.isNotEmpty) {
      dynamic decoded;
      try {
        decoded = jsonDecode(response.body);
      } catch (_) {
        if (response.statusCode >= 400) {
          throw AuthApiException(
            response.statusCode,
            retryAfter: retryAfter(response.headers['retry-after']),
          );
        }
        rethrow;
      }
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Invalid user response');
      }
      data = decoded;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthApiException(
        response.statusCode,
        retryAfter: retryAfter(response.headers['retry-after']),
        code: data['code'] is String ? data['code'] as String : null,
        message: data['message'] is String ? data['message'] as String : null,
        nextDisplayNameChangeAt: data['nextDisplayNameChangeAt'] is String
            ? DateTime.tryParse(data['nextDisplayNameChangeAt'] as String)
            : null,
      );
    }
    return data;
  }
}
