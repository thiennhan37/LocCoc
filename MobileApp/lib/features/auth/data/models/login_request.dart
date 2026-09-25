/// DTO for Login Request to Auth Microservice
class LoginRequest {
  final String identifier; // Email or Phone
  final String password;
  final bool rememberMe;

  LoginRequest({
    required this.identifier,
    required this.password,
    this.rememberMe = true,
  });

  Map<String, dynamic> toJson() {
    return {
      'identifier': identifier,
      'password': password,
      'rememberMe': rememberMe,
    };
  }
}
