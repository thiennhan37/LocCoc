import '../../users/data/user_api_client.dart';

class LoginHistoryEntry {
  final String id, platform, status;
  final String? ip, userAgent;
  final DateTime createdAt, lastUsedAt, expiresAt;
  final DateTime? revokedAt;
  final bool isCurrent;
  const LoginHistoryEntry({
    required this.id,
    required this.platform,
    required this.status,
    this.ip,
    this.userAgent,
    required this.createdAt,
    required this.lastUsedAt,
    required this.expiresAt,
    this.revokedAt,
    required this.isCurrent,
  });
  factory LoginHistoryEntry.fromJson(Map<String, dynamic> json) {
    final device = Map<String, dynamic>.from(json['device'] as Map);
    final status = json['status'] as String;
    if (!['ACTIVE', 'REVOKED', 'EXPIRED'].contains(status)) {
      throw const FormatException('Invalid session status');
    }
    return LoginHistoryEntry(
      id: json['id'] as String,
      platform: device['platform'] as String,
      status: status,
      ip: json['ip'] as String?,
      userAgent: device['userAgent'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastUsedAt: DateTime.parse(json['lastUsedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      revokedAt: json['revokedAt'] == null
          ? null
          : DateTime.parse(json['revokedAt'] as String),
      isCurrent: json['isCurrent'] == true,
    );
  }
  String get deviceName => switch (platform) {
    'android' => 'Android',
    'ios' => 'iPhone / iPad',
    'web' => 'Trình duyệt',
    _ => 'Thiết bị khác',
  };
  String get statusLabel => switch (status) {
    'ACTIVE' => 'Còn hiệu lực',
    'REVOKED' => 'Đã đăng xuất',
    _ => 'Đã hết hạn',
  };
}

class LoginHistoryApi {
  final UserApiClient account;
  LoginHistoryApi(this.account);
  Future<Map<String, dynamic>> list([String? cursor]) => account.request(
    'GET',
    'sessions/history?${Uri(queryParameters: {'limit': '20', 'cursor': ?cursor}).query}',
    area: 'auth',
  );
  Future<Map<String, dynamic>> revoke(String id) => account.request(
    'DELETE',
    'sessions/${Uri.encodeComponent(id)}',
    area: 'auth',
  );
}
