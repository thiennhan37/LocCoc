class RegistrationChallenge {
  final String email;
  final String registrationId;
  final Duration expiresIn;
  final Duration retryAfter;

  const RegistrationChallenge({
    required this.email,
    required this.registrationId,
    required this.expiresIn,
    required this.retryAfter,
  });

  factory RegistrationChallenge.fromJson(
    String email,
    Map<String, dynamic> json,
  ) {
    final id = json['registrationId'];
    if (id is! String || !RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(id)) {
      throw const FormatException('Invalid registration challenge');
    }
    return RegistrationChallenge(
      email: email,
      registrationId: id,
      expiresIn: Duration(seconds: (json['expiresIn'] as num?)?.toInt() ?? 300),
      retryAfter: Duration(
        seconds: (json['retryAfter'] as num?)?.toInt() ?? 60,
      ),
    );
  }
}
