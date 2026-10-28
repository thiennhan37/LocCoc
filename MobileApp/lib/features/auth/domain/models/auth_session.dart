class AuthUser {
  final String id;
  final String? email;
  final String? phone;
  final String role;
  final String status;
  final String? emailVerifiedAt;

  const AuthUser({
    required this.id,
    this.email,
    this.phone,
    required this.role,
    required this.status,
    this.emailVerifiedAt,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String? ?? '',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      role: json['role'] as String? ?? 'user',
      status: json['status'] as String? ?? 'active',
      emailVerifiedAt: json['emailVerifiedAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'phone': phone,
      'role': role,
      'status': status,
      'emailVerifiedAt': emailVerifiedAt,
    };
  }
}

class AuthSession {
  final bool authenticated;
  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final int expiresIn;
  final int refreshExpiresIn;

  const AuthSession({
    required this.authenticated,
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.expiresIn,
    required this.refreshExpiresIn,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      authenticated: json['authenticated'] as bool? ?? false,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>? ?? {}),
      accessToken: json['accessToken'] as String? ?? '',
      refreshToken: json['refreshToken'] as String? ?? '',
      tokenType: json['tokenType'] as String? ?? 'Bearer',
      expiresIn: json['expiresIn'] as int? ?? 900,
      refreshExpiresIn: json['refreshExpiresIn'] as int? ?? 2592000,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'authenticated': authenticated,
      'user': user.toJson(),
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'tokenType': tokenType,
      'expiresIn': expiresIn,
      'refreshExpiresIn': refreshExpiresIn,
    };
  }
}
