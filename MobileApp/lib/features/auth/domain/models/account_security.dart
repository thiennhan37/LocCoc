import 'auth_session.dart';

class AccountSecurityBusyException implements Exception {}

class PasswordChangeUncertainException implements Exception {}

class SessionProbeUnavailableException implements Exception {}

class SessionReplacement {
  final int previousGeneration;
  final int generation;
  final AuthSession session;
  final bool retentionConfirmed;
  const SessionReplacement({
    required this.previousGeneration,
    required this.generation,
    required this.session,
    required this.retentionConfirmed,
  });
  String get notice => retentionConfirmed
      ? 'Đã đổi mật khẩu. Các phiên cũ đã được đăng xuất.'
      : 'Đã đổi mật khẩu, nhưng chưa xác nhận lưu phiên an toàn. Bạn có thể cần đăng nhập lại khi mở ứng dụng lần sau.';
}

/// change-password returns tokens, not user. Preserve the current identity.
AuthSession passwordReplacement(
  AuthSession current,
  Map<String, dynamic> data,
) {
  final access = data['accessToken'], refresh = data['refreshToken'];
  final accessTtl = data['expiresIn'], refreshTtl = data['refreshExpiresIn'];
  if (access is! String ||
      access.isEmpty ||
      access.length > 16384 ||
      access.startsWith('demo-') ||
      refresh is! String ||
      refresh.isEmpty ||
      refresh.length > 4096 ||
      refresh == current.refreshToken ||
      accessTtl is! int ||
      accessTtl <= 0 ||
      refreshTtl is! int ||
      refreshTtl <= 0 ||
      data['tokenType'] != 'Bearer') {
    throw const FormatException('Invalid replacement pair');
  }
  if (data.containsKey('user') &&
      (data['user'] is! Map || data['user']['id'] != current.user.id)) {
    throw const FormatException('Replacement identity mismatch');
  }
  return AuthSession(
    authenticated: current.authenticated,
    user: current.user,
    accessToken: access,
    refreshToken: refresh,
    tokenType: 'Bearer',
    expiresIn: accessTtl,
    refreshExpiresIn: refreshTtl,
  );
}
