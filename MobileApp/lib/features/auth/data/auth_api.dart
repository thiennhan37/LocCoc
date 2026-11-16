import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
export '../../../core/network/api_client.dart' show ApiException;

typedef AuthException = ApiException;

class AuthApi {
  final Uri endpoint;
  final ApiClient _client;
  AuthApi({Uri? endpoint, ApiClient? client})
    : endpoint = endpoint ?? ApiConstants.login,
      _client = client ?? ApiClient();
  // Memory only. Closing the app requires login again.
  static String? accessToken;
  static String? refreshToken;
  static String? userId;
  static Future<void>? _refreshing;
  static void clearSession() {
    accessToken = null;
    refreshToken = null;
    userId = null;
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic>? body, {
    bool authenticated = false,
  }) {
    final token = accessToken;
    if (authenticated && (token == null || token.isEmpty)) {
      throw const AuthException('Vui lòng đăng nhập.');
    }
    return _client.request(
      'POST',
      endpoint.resolve(path),
      body: body,
      token: authenticated ? token : null,
    );
  }

  void _saveTokens(Map<String, dynamic> data) {
    final access = data['accessToken'];
    final refresh = data['refreshToken'];
    if (access is! String ||
        access.isEmpty ||
        refresh is! String ||
        refresh.isEmpty) {
      throw const AuthException('Máy chủ chưa cấp phiên đăng nhập hợp lệ.');
    }
    accessToken = access;
    refreshToken = refresh;
  }

  Future<void> login(String email, String password) async {
    final data = await _client.request(
      'POST',
      endpoint,
      body: {'email': email.trim(), 'password': password},
    );
    if (data['authenticated'] != true) {
      throw const AuthException('Đăng nhập thất bại.');
    }
    _saveTokens(data);
    final user = data['user'];
    userId = user is Map && user['id'] is String ? user['id'] as String : null;
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    String? phone,
  }) => _post(ApiConstants.registerPath, {
    'email': email.trim(),
    'password': password,
    if (phone != null) 'phone': phone.trim(),
  });
  Future<bool> verifyOtp({
    required String otp,
    String? email,
    String? phone,
  }) async {
    _checkDestination(email, phone);
    final data = await _post(ApiConstants.verifyOtpPath, {
      'otp': otp.trim(),
      if (email != null) 'email': email.trim(),
      if (phone != null) 'phone': phone.trim(),
    });
    if (data['verified'] is! bool) {
      throw const AuthException('Phản hồi OTP không hợp lệ.');
    }
    return data['verified'] as bool;
  }

  Future<Map<String, dynamic>> resendOtp({String? email, String? phone}) {
    _checkDestination(email, phone);
    return _post(ApiConstants.resendOtpPath, {
      if (email != null) 'email': email.trim(),
      if (phone != null) 'phone': phone.trim(),
      'channel': email != null ? 'email' : 'phone',
    });
  }

  void _checkDestination(String? email, String? phone) {
    if ((email == null) == (phone == null) ||
        (email ?? phone ?? '').trim().isEmpty) {
      throw const AuthException('Nhập email hoặc số điện thoại để nhận OTP.');
    }
  }

  Future<void> refresh() =>
      _refreshing ??= _refresh().whenComplete(() => _refreshing = null);
  Future<void> _refresh() async {
    final token = refreshToken;
    if (token == null) throw const AuthException('Vui lòng đăng nhập lại.');
    try {
      final data = await _post(ApiConstants.refreshPath, {
        'refreshToken': token,
      });
      if (refreshToken == token) _saveTokens(data);
    } on ApiException catch (error) {
      if (error.statusCode == 401 && refreshToken == token) clearSession();
      rethrow;
    }
  }

  Future<void> logout({bool allDevices = false}) async {
    await _post(
      allDevices ? ApiConstants.logoutAllPath : ApiConstants.logoutPath,
      null,
      authenticated: true,
    );
    clearSession();
  }

  Future<void> logoutAll() => logout(allDevices: true);
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final data = await _post(ApiConstants.changePasswordPath, {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    }, authenticated: true);
    _saveTokens(data);
  }
}
