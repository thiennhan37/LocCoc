import 'dart:io';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_api.dart';

void main() {
  test(
    'login sends credentials and accepts only valid token response',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final api = AuthApi(
        endpoint: Uri.parse('http://127.0.0.1:${server.port}/auth/login'),
      );
      final handler = server.first.then((request) async {
        expect(request.method, 'POST');
        expect(request.uri.path, '/auth/login');
        final body = jsonDecode(await utf8.decoder.bind(request).join());
        expect(body, {
          'email': 'test@example.test',
          'password': 'test-password',
        });
        request.response.write(
          jsonEncode({
            'authenticated': true,
            'accessToken': 'access',
            'refreshToken': 'refresh',
          }),
        );
        await request.response.close();
      });
      try {
        await api.login(' test@example.test ', 'test-password');
        await handler;
        expect(AuthApi.accessToken, 'access');
        expect(AuthApi.refreshToken, 'refresh');
      } finally {
        await server.close(force: true);
      }
    },
  );

  test('401 does not create a session', () async {
    AuthApi.accessToken = null;
    AuthApi.refreshToken = null;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final handler = server.first.then((request) async {
      await request.drain<void>();
      request.response.statusCode = 401;
      await request.response.close();
    });
    try {
      final api = AuthApi(
        endpoint: Uri.parse('http://127.0.0.1:${server.port}/auth/login'),
      );
      await expectLater(
        api.login('test@example.test', 'wrong'),
        throwsA(isA<AuthException>()),
      );
      await handler;
      expect(AuthApi.accessToken, isNull);
    } finally {
      await server.close(force: true);
    }
  });
}
