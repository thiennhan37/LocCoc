/// DTO for Register Request to Auth Microservice
class RegisterRequest {
  final String fullName;
  final String username;
  final String email;
  final String phone;
  final String password;

  RegisterRequest({
    required this.fullName,
    required this.username,
    required this.email,
    required this.phone,
    required this.password,
  });

  Map<String, dynamic> toJson() {
    return {
      'fullName': fullName,
      'username': username,
      'email': email,
      'phone': phone,
      'password': password,
    };
  }
}
