import '../../auth/data/services/auth_api_client.dart';
import '../../auth/data/services/google_sign_in_service.dart';
import '../../auth/domain/models/auth_session.dart';
import '../../auth/domain/models/account_security.dart';

class UserApiClient {
  final AuthApiClient auth;
  final void Function(AuthSession)? onSessionChanged;
  final Future<AuthSession> Function(AuthSession)? refreshSession;
  final GoogleAuthService? coordinator;
  final int? _generation;
  bool _active = true;
  bool get isCurrent =>
      _active &&
      (coordinator == null || coordinator!.generation == _generation);
  void invalidate() {
    _active = false;
    discoveryEpoch++;
  }

  void _checkCurrent() {
    if (!_active ||
        (coordinator != null && coordinator!.generation != _generation)) {
      throw const SessionChangedException();
    }
  }

  AuthSession session;
  Future<AuthSession>? _refreshing;
  int discoveryEpoch = 0;
  int socialRevision = 0;
  UserApiClient({
    required this.auth,
    required this.session,
    this.onSessionChanged,
    this.refreshSession,
    this.coordinator,
  }) : _generation = coordinator?.generation;

  Future<SessionReplacement> changePassword(
    String currentPassword,
    String newPassword,
  ) {
    _checkCurrent();
    final owner = coordinator;
    if (owner == null) throw StateError('Session coordinator required');
    return owner.changePassword(session, currentPassword, newPassword);
  }

  Future<void> logoutAll() {
    _checkCurrent();
    final owner = coordinator;
    if (owner == null) throw StateError('Session coordinator required');
    return owner.logoutAll(session);
  }

  Future<void> reauthenticate() async {
    _checkCurrent();
    await coordinator?.clearRevokedSession(session);
  }

  /// Development tools use the same rotation and lifetime as normal requests.
  Future<AuthSession> forceRefresh() async {
    _checkCurrent();
    final owner = coordinator;
    if (owner == null) throw StateError('Session coordinator required');
    final pending = _refreshing ??= owner.refreshSession(
      owner.session ?? session,
    );
    try {
      final next = await pending;
      _checkCurrent();
      session = next;
      onSessionChanged?.call(next);
      return next;
    } finally {
      if (identical(_refreshing, pending)) _refreshing = null;
    }
  }

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String area = 'users',
    bool allowRefresh = true,
  }) async {
    _checkCurrent();
    if (method == 'PUT' && path.startsWith('blocks/')) discoveryEpoch++;
    final token = session.accessToken;
    try {
      final result = await auth.serviceRequest(
        method,
        area,
        path,
        token,
        body: body,
      );
      _checkCurrent();
      _recordMutation(method, area, path);
      return result;
    } on AuthApiException catch (e) {
      _checkCurrent();
      if (e.statusCode != 401 || !allowRefresh) rethrow;
      if (area == 'auth' && path == 'change-password') {
        // This endpoint also returns 401 for a wrong current password. Probe
        // authoritative session access before consuming a refresh credential.
        try {
          await auth.serviceRequest('GET', 'auth', 'sessions?limit=1', token);
          _checkCurrent();
        } on AuthApiException catch (probe) {
          if (probe.statusCode != 401) rethrow;
          return _retryWithRefresh(method, area, path, token, body);
        }
        rethrow;
      }
      return _retryWithRefresh(method, area, path, token, body);
    }
  }

  Future<Map<String, dynamic>> _retryWithRefresh(
    String method,
    String area,
    String path,
    String token,
    Map<String, dynamic>? body,
  ) async {
    _checkCurrent();
    if (session.accessToken == token) {
      final pending = _refreshing ??=
          (coordinator?.refreshSession ??
          refreshSession ??
          auth.refreshSession)(session);
      try {
        late final AuthSession next;
        try {
          next = await pending;
        } on AuthApiException catch (error) {
          if (error.statusCode == 401) throw const SessionExpiredException();
          rethrow;
        }
        _checkCurrent();
        session = next;
        onSessionChanged?.call(session);
      } finally {
        if (identical(_refreshing, pending)) _refreshing = null;
      }
    }
    final result = await auth.serviceRequest(
      method,
      area,
      path,
      session.accessToken,
      body: body,
    );
    _checkCurrent();
    _recordMutation(method, area, path);
    return result;
  }

  void _recordMutation(String method, String area, String path) {
    // Also reject reads started while the block request was in flight, before
    // the server committed it. Reads after the acknowledgement use a new epoch.
    if (area == 'users' && method == 'PUT' && path.startsWith('blocks/')) {
      discoveryEpoch++;
    }
    if (area == 'users' &&
        method != 'GET' &&
        (path.startsWith('friend-requests') ||
            path.startsWith('friends/') ||
            path.startsWith('blocks/') ||
            path.startsWith('recommendations/') ||
            path == 'me/privacy')) {
      socialRevision++;
    }
  }

  Future<Map<String, dynamic>> me() => request('GET', 'me');
  Future<Map<String, dynamic>> uploadMedia(
    String kind,
    List<int> bytes,
    String contentType,
  ) async {
    _checkCurrent();
    final token = session.accessToken;
    try {
      final result = await auth.uploadMedia(kind, bytes, contentType, token);
      _checkCurrent();
      return result;
    } on AuthApiException catch (e) {
      _checkCurrent();
      if (e.statusCode != 401) rethrow;
      // Only a definitive auth rejection may retry; timeouts/5xx never replay uploads.
      await _retryWithRefresh('GET', 'users', 'me', token, null);
      _checkCurrent();
      final result = await auth.uploadMedia(
        kind,
        bytes,
        contentType,
        session.accessToken,
      );
      _checkCurrent();
      return result;
    }
  }

  Future<Map<String, dynamic>> clearMedia(String kind) {
    if (!['avatar', 'cover'].contains(kind)) {
      throw ArgumentError('Invalid media kind');
    }
    return request('DELETE', 'me/media/$kind');
  }

  Future<Map<String, dynamic>> updateDisplayName(String name) =>
      request('PATCH', 'me', body: {'displayName': name.trim()});
  Future<Map<String, dynamic>> updateProfile({
    String? displayName,
    String? avatarUrl,
    String? coverUrl,
  }) => request(
    'PATCH',
    'me',
    body: {
      if (displayName != null) 'displayName': displayName.trim(),
      if (avatarUrl != null) 'avatarUrl': avatarUrl.trim(),
      if (coverUrl != null) 'coverUrl': coverUrl.trim(),
    },
  );
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
    String? q,
    String? cursor,
    int page = 1,
    String? direction,
  }) {
    final query = Uri(
      queryParameters: {
        if (q == null &&
            path != 'recommendations' &&
            !path.endsWith('/mutual-friends'))
          'page': '$page',
        'q': ?q,
        'cursor': ?cursor,
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
      case 'INVALID_MEDIA':
        return 'Ảnh không hợp lệ. Hãy chọn ảnh JPEG, PNG hoặc WebP khác.';
      case 'MEDIA_UNAVAILABLE':
        return 'Chưa thể lưu ảnh lúc này. Vui lòng thử lại sau.';
      case 'DISCOVERY_CURSOR_EXPIRED':
        return 'Danh sách đã hết hạn. Kéo xuống để tải lại.';
      case 'USERNAME_TAKEN':
        return 'Username đã có người sử dụng.';
      case 'USERNAME_ALREADY_SET':
        return 'Tài khoản đã có username. Vui lòng tải lại.';
      case 'USERNAME_REQUIRED':
        return 'Hãy chọn username trước khi kết bạn.';
      case 'DISPLAY_NAME_CHANGE_TOO_SOON':
        return 'Bạn chỉ được đổi tên mỗi 30 ngày. Vui lòng chờ đến lượt tiếp theo.';
      case 'INVALID_DISPLAY_NAME':
        return 'Tên hiển thị phải có từ 1 đến 255 ký tự.';
      case 'ACCOUNT_UNAVAILABLE':
        return 'Tài khoản hiện không được phép thực hiện thao tác.';
      case 'FRIEND_REQUEST_STATE_CHANGED':
        return 'Trạng thái đã thay đổi. Danh sách đã được làm mới.';
    }
    if (e.statusCode == 404) return 'Không tìm thấy người dùng hoặc lời mời.';
    if (e.statusCode == 413) {
      return 'Ảnh quá lớn. Ảnh đại diện tối đa 5 MB, ảnh bìa tối đa 10 MB.';
    }
    if (e.statusCode == 401) {
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    }
    if (e.statusCode == 400) {
      return 'Dữ liệu không hợp lệ. Hãy kiểm tra và thử lại.';
    }
    if (e.statusCode == 429) {
      return e.retryAfter == null
          ? 'Bạn thao tác quá nhanh. Hãy chờ rồi thử lại.'
          : 'Bạn thao tác quá nhanh. Hãy thử lại sau ${e.retryAfter!.inSeconds} giây.';
    }
  }
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}
