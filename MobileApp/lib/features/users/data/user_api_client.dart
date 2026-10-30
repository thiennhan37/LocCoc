import '../../auth/data/services/auth_api_client.dart';
import '../../auth/domain/models/auth_session.dart';

class UserApiClient {
  final AuthApiClient auth;
  final void Function(AuthSession)? onSessionChanged;
  AuthSession session;
  Future<AuthSession>? _refreshing;
  UserApiClient({
    required this.auth,
    required this.session,
    this.onSessionChanged,
  });

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final token = session.accessToken;
    try {
      return await auth.userRequest(method, path, token, body: body);
    } on AuthApiException catch (e) {
      if (e.statusCode != 401) rethrow;
      if (session.accessToken == token) {
        final pending = _refreshing ??= auth.refreshSession(session);
        try {
          session = await pending;
          onSessionChanged?.call(session);
        } finally {
          if (identical(_refreshing, pending)) _refreshing = null;
        }
      }
      return auth.userRequest(method, path, session.accessToken, body: body);
    }
  }

  Future<Map<String, dynamic>> me() => request('GET', 'me');
  Future<void> deleteAccount() => request('DELETE', 'me');
  Future<Map<String, dynamic>> claim(String username, String displayName) =>
      request(
        'POST',
        'me/username',
        body: {
          'username': username.trim().toLowerCase(),
          'displayName': displayName.trim(),
        },
      );
  Future<Map<String, dynamic>> list(
    String path, {
    String? username,
    int page = 1,
    String? direction,
  }) {
    final query = Uri(
      queryParameters: {
        'page': '$page',
        'limit': '20',
        'username': ?username,
        'direction': ?direction,
      },
    ).query;
    return request('GET', '$path?$query');
  }
}

String userError(Object e) {
  if (e is AuthApiException) {
    switch (e.code) {
      case 'USERNAME_TAKEN':
        return 'Username đã có người sử dụng.';
      case 'USERNAME_ALREADY_SET':
        return 'Tài khoản đã có username. Vui lòng tải lại.';
      case 'USERNAME_REQUIRED':
        return 'Hãy chọn username trước khi kết bạn.';
      case 'ACCOUNT_UNAVAILABLE':
        return 'Tài khoản hiện không được phép thực hiện thao tác.';
      case 'FRIEND_REQUEST_STATE_CHANGED':
        return 'Trạng thái đã thay đổi. Danh sách đã được làm mới.';
    }
    if (e.statusCode == 404) return 'Không tìm thấy người dùng hoặc lời mời.';
    if (e.statusCode == 401) {
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    }
    if (e.statusCode == 400) {
      return 'Dữ liệu không hợp lệ. Hãy kiểm tra và thử lại.';
    }
  }
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}
