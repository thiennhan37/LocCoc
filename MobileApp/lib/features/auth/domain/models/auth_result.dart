import 'auth_session.dart';

sealed class AuthResult {
  const AuthResult();
}

class AuthSuccess extends AuthResult {
  final AuthSession session;
  const AuthSuccess(this.session);
}

class AuthFailure extends AuthResult {
  final String message;
  final int? statusCode;
  const AuthFailure(this.message, {this.statusCode});
}

class AuthCancelled extends AuthResult {
  const AuthCancelled();
}
