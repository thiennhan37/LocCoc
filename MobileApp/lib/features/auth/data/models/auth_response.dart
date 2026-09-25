import '../../domain/entities/user_entity.dart';

/// DTO for Auth Service response containing JWT Tokens and User Data
class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final UserEntity user;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    final userData = json['user'] as Map<String, dynamic>;
    return AuthResponse(
      accessToken: json['accessToken'] as String? ?? '',
      refreshToken: json['refreshToken'] as String? ?? '',
      user: UserEntity(
        id: userData['id'] as String? ?? '',
        fullName: userData['fullName'] as String? ?? '',
        username: userData['username'] as String? ?? '',
        email: userData['email'] as String? ?? '',
        phone: userData['phone'] as String?,
        avatarUrl: userData['avatarUrl'] as String?,
      ),
    );
  }
}
