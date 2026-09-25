/// Domain Entity representing a LocCoc user
class UserEntity {
  final String id;
  final String fullName;
  final String username;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final DateTime? createdAt;

  UserEntity({
    required this.id,
    required this.fullName,
    required this.username,
    required this.email,
    this.phone,
    this.avatarUrl,
    this.createdAt,
  });
}
