import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/core/constants/api_constants.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_result.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/auth/presentation/widgets/google_sign_in_button.dart';

class _GoogleAdapter implements GoogleSignInAdapter {
  int calls = 0;

  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async {
    calls++;
    return GoogleSignInAccountData(idToken: 'fresh-token-$calls');
  }

  @override
  Future<void> signOut() async {}
}

http.Response _success() => http.Response(
  jsonEncode({
    'authenticated': true,
    'user': {'id': 'test-user', 'email': 'test@example.com'},
    'accessToken': 'test-access',
    'refreshToken': 'test-refresh',
    'tokenType': 'Bearer',
    'expiresIn': 900,
    'refreshExpiresIn': 2592000,
  }),
  200,
);

void main() {
  test(
    'local API default also works with USB forwarding on physical Android',
    () {
      expect(ApiConstants.defaultBaseUrl, 'http://127.0.0.1:8080');
    },
  );

  for (final google in [true, false]) {
    test(
      '${google ? 'Google' : 'password'} login bounds a stalled request',
      () async {
        var requests = 0;
        final pending = Completer<http.Response>();
        final client = AuthApiClient(
          httpClient: MockClient((_) {
            requests++;
            return pending.future;
          }),
          requestTimeout: const Duration(milliseconds: 10),
        );
        addTearDown(client.close);

        final result = await (google
            ? client.loginWithGoogleToken(idToken: 'test-token')
            : client.loginWithPassword(
                email: 'test@example.com',
                password: 'test',
              ));
        expect(result, isA<AuthFailure>());
        expect((result as AuthFailure).message, contains('hết thời gian'));
        expect(requests, 1); // No automatic replay of an ambiguous login.
        pending.complete(_success());
      },
    );
  }

  test('Google login also bounds a stalled response body', () async {
    final body = StreamController<List<int>>();
    final client = AuthApiClient(
      httpClient: MockClient.streaming((request, _) async {
        return http.StreamedResponse(body.stream, 200, request: request);
      }),
      requestTimeout: const Duration(milliseconds: 10),
    );
    addTearDown(client.close);

    final result = await client.loginWithGoogleToken(idToken: 'test-token');
    expect(result, isA<AuthFailure>());
    expect((result as AuthFailure).message, contains('hết thời gian'));
    await body.close();
  });

  testWidgets(
    'timeout unlocks Google login, ignores late success, and permits retry',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final firstResponse = Completer<http.Response>();
      final adapter = _GoogleAdapter();
      final tokens = <String>[];
      var authenticated = 0;
      final client = AuthApiClient(
        httpClient: MockClient((request) {
          tokens.add(
            (jsonDecode(request.body) as Map<String, dynamic>)['idToken']
                as String,
          );
          return tokens.length == 1
              ? firstResponse.future
              : Future.value(_success());
        }),
        requestTimeout: const Duration(seconds: 15),
      );
      addTearDown(client.close);
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(
            googleAuthService: GoogleAuthService(
              signInAdapter: adapter,
              apiClient: client,
            ),
            onLoginSuccess: (_) => authenticated++,
          ),
        ),
      );

      final button = find.byType(GoogleSignInButton);
      await tester.tap(button);
      await tester.pump();
      expect(tester.widget<GoogleSignInButton>(button).isLoading, isTrue);
      await tester.tap(button);
      await tester.pump();
      expect(adapter.calls, 1);

      await tester.pump(const Duration(seconds: 16));
      await tester.pumpAndSettle();
      expect(tester.widget<GoogleSignInButton>(button).isLoading, isFalse);
      expect(find.textContaining('hết thời gian'), findsOneWidget);
      firstResponse.complete(_success());
      await tester.pumpAndSettle();
      expect(authenticated, 0);

      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(authenticated, 1);
      expect(tokens, ['fresh-token-1', 'fresh-token-2']);
    },
  );
}
