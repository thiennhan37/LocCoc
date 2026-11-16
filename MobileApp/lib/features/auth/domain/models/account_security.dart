import 'auth_session.dart';

class AccountSecurityBusyException implements Exception {}

class SessionProbeUnavailableException implements Exception {}

class PasswordChangeUncertainException implements Exception {}

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
      : 'Đã đổi mật khẩu, nhưng chưa xác nhận lưu phiên trên thiết bị. Bạn có thể cần đăng nhập lại.';
}

AuthSession passwordReplacement(
  AuthSession previous,
  Map<String, dynamic> data,
) {
  final user = data['user'];
  final access = data['accessToken'],
      refresh = data['refreshToken'],
      expiry = data['expiresIn'];
  final refreshExpiry = data['refreshExpiresIn'];
  if ((user != null &&
          (user is! Map<String, dynamic> || user['id'] != previous.user.id)) ||
      access is! String ||
      access.isEmpty ||
      access == previous.accessToken ||
      refresh is! String ||
      refresh.isEmpty ||
      refresh == previous.refreshToken ||
      expiry is! int ||
      expiry < 1 ||
      expiry > 86400 ||
      refreshExpiry is! int ||
      refreshExpiry < 1 ||
      data['tokenType'] != 'Bearer') {
    throw const FormatException('Invalid replacement session');
  }
  return AuthSession(
    authenticated: true,
    user: previous.user,
    accessToken: access,
    refreshToken: refresh,
    tokenType: 'Bearer',
    expiresIn: expiry,
    refreshExpiresIn: refreshExpiry,
  );
}
