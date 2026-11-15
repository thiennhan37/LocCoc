import 'auth_session.dart';

sealed class AuthResult {
  const AuthResult();
}

class AuthSuccess extends AuthResult {
  final AuthSession session;
  const AuthSuccess(this.session);
}

enum AuthFailureKind { authentication, validation, rateLimit, network, server }

class AuthFailure extends AuthResult {
  final String message;
  final int? statusCode;
  final AuthFailureKind? category;
  final Duration? retryAfter;
  AuthFailureKind get kind =>
      category ??
      switch (statusCode) {
        400 || 422 => AuthFailureKind.validation,
        401 || 403 => AuthFailureKind.authentication,
        429 => AuthFailureKind.rateLimit,
        _ => AuthFailureKind.server,
      };
  const AuthFailure(
    this.message, {
    this.statusCode,
    this.category,
    this.retryAfter,
  });
}

class AuthCancelled extends AuthResult {
  const AuthCancelled();
}
