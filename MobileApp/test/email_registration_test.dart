import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/domain/models/registration_challenge.dart';
import 'package:mobile_app/features/auth/presentation/screens/login_form.dart';
import 'package:mobile_app/features/auth/presentation/screens/registration_screen.dart';
import 'package:mobile_app/features/auth/presentation/screens/verify_email_screen.dart';

const registrationId = 'a6fbb387-d5ae-4229-91bd-7133f121bef6';
http.Response reply(Object data, [int status = 200]) =>
    http.Response(jsonEncode(data), status);
const challenge = RegistrationChallenge(
  email: 'person@example.com',
  registrationId: registrationId,
  expiresIn: Duration(minutes: 5),
  retryAfter: Duration(seconds: 60),
);

void phoneSize(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  testWidgets(
    'registers, handles incorrect OTP, and returns verified email to login without a session',
    (tester) async {
      phoneSize(tester);
      final requests = <http.Request>[];
      var verifications = 0;
      final api = AuthApiClient(
        baseUrl: 'http://gateway.test',
        httpClient: MockClient((request) async {
          requests.add(request);
          expect(request.headers.containsKey('authorization'), isFalse);
          switch (request.url.path) {
            case '/auth/register':
              expect(jsonDecode(request.body), {
                'email': 'person@example.com',
                'password': 'my safe passphrase',
              });
              return reply({
                'registrationId': registrationId,
                'expiresIn': 300,
                'retryAfter': 60,
              }, 201);
            case '/auth/verify-otp':
              expect(jsonDecode(request.body), {
                'email': 'person@example.com',
                'registrationId': registrationId,
                'otp': '123456',
              });
              return reply({'verified': ++verifications == 2});
            default:
              throw StateError('Unexpected request: ${request.url.path}');
          }
        }),
      );
      addTearDown(api.close);
      var sessions = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: LoginForm(
                authApiClient: api,
                onLoginSuccess: (_) => sessions++,
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Đăng ký'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tạo tài khoản'));
      await tester.pump();
      expect(requests, isEmpty);
      expect(find.text('Vui lòng nhập email hợp lệ.'), findsOneWidget);
      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), ' Person@Example.COM ');
      await tester.enterText(fields.at(1), 'my safe passphrase');
      await tester.enterText(fields.at(2), 'does not match');
      await tester.tap(find.text('Tạo tài khoản'));
      await tester.pump();
      expect(find.text('Mật khẩu xác nhận chưa khớp.'), findsOneWidget);
      expect(requests, isEmpty);
      await tester.enterText(fields.at(2), 'my safe passphrase');
      await tester.tap(find.text('Tạo tài khoản'));
      await tester.pumpAndSettle();
      expect(find.byType(VerifyEmailScreen), findsOneWidget);
      expect(find.textContaining('person@example.com'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('registration_otp')), '123');
      await tester.tap(find.text('Xác thực OTP'));
      await tester.pump();
      expect(find.text('Nhập đủ 6 chữ số OTP.'), findsOneWidget);
      expect(requests, hasLength(1));
      await tester.enterText(
        find.byKey(const Key('registration_otp')),
        '123456',
      );
      await tester.tap(find.text('Xác thực OTP'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Mã OTP không đúng'), findsOneWidget);
      expect(find.byType(VerifyEmailScreen), findsOneWidget);
      await tester.tap(find.text('Xác thực OTP'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginForm), findsOneWidget);
      expect(find.byType(VerifyEmailScreen), findsNothing);
      final emailField = tester.widget<TextFormField>(
        find.byType(TextFormField).first,
      );
      final passwordField = tester.widget<TextFormField>(
        find.byType(TextFormField).last,
      );
      expect(emailField.controller!.text, 'person@example.com');
      expect(passwordField.controller!.text, isEmpty);
      expect(sessions, 0);
      expect(requests, hasLength(3));
    },
  );

  testWidgets(
    'resend waits for cooldown and respects rate-limit retryAfter from the server',
    (tester) async {
      phoneSize(tester);
      var calls = 0;
      final api = AuthApiClient(
        httpClient: MockClient((request) async {
          calls++;
          expect(request.url.path, '/auth/resend-otp');
          expect(jsonDecode(request.body), {
            'email': challenge.email,
            'registrationId': registrationId,
            'channel': 'email',
          });
          return calls == 1
              ? reply({'code': 'OTP_RATE_LIMITED', 'retryAfter': 120}, 429)
              : reply({'retryAfter': 60});
        }),
      );
      addTearDown(api.close);
      var now = DateTime(2026, 11, 18);
      await tester.pumpWidget(
        MaterialApp(
          home: VerifyEmailScreen(
            api: api,
            challenge: challenge,
            now: () => now,
          ),
        ),
      );
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Gửi lại mã sau 60s'),
            )
            .onPressed,
        isNull,
      );
      now = now.add(const Duration(seconds: 61));
      await tester.pump(const Duration(seconds: 61));
      await tester.tap(find.text('Gửi lại mã OTP'));
      await tester.pumpAndSettle();
      expect(calls, 1);
      expect(find.textContaining('120 giây'), findsOneWidget);
      expect(find.text('Gửi lại mã sau 120s'), findsOneWidget);
      now = now.add(const Duration(seconds: 121));
      await tester.pump(const Duration(seconds: 121));
      await tester.tap(find.text('Gửi lại mã OTP'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.textContaining('Đã yêu cầu mã mới'), findsOneWidget);
      expect(find.text('Gửi lại mã sau 60s'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('registration network failure allows a manual retry', (
    tester,
  ) async {
    phoneSize(tester);
    var calls = 0;
    final api = AuthApiClient(
      httpClient: MockClient((_) async {
        if (++calls == 1) throw http.ClientException('offline');
        return reply({
          'registrationId': registrationId,
          'expiresIn': 300,
          'retryAfter': 60,
        }, 201);
      }),
    );
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: RegistrationScreen(api: api)));
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'person@example.com',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'my safe passphrase',
    );
    await tester.enterText(
      find.byType(TextFormField).at(2),
      'my safe passphrase',
    );
    await tester.tap(find.text('Tạo tài khoản'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Kiểm tra mạng'), findsOneWidget);
    expect(calls, 1);
    await tester.tap(find.text('Tạo tài khoản'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.byType(VerifyEmailScreen), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  test(
    'registration times out without automatically resubmitting credentials',
    () async {
      var calls = 0;
      final pending = Completer<http.Response>();
      final api = AuthApiClient(
        requestTimeout: const Duration(milliseconds: 10),
        httpClient: MockClient((_) {
          calls++;
          return pending.future;
        }),
      );
      addTearDown(api.close);
      await expectLater(
        api.registerWithEmail(
          email: 'person@example.com',
          password: 'my safe passphrase',
        ),
        throwsA(isA<TimeoutException>()),
      );
      expect(calls, 1);
      pending.complete(reply({'registrationId': registrationId}, 201));
    },
  );

  test(
    'a string verified value does not count as successful activation',
    () async {
      final api = AuthApiClient(
        httpClient: MockClient((_) async => reply({'verified': 'true'})),
      );
      addTearDown(api.close);
      expect(await api.verifyRegistrationOtp(challenge, '123456'), isFalse);
    },
  );
}
