import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart'
    as platform;
import 'package:mobile_app/core/constants/app_strings.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_result.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/auth/presentation/widgets/auth_divider.dart';
import 'package:mobile_app/features/auth/presentation/widgets/google_logo.dart';
import 'package:mobile_app/features/auth/presentation/widgets/google_sign_in_button.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';

class FakeHttpClient extends http.BaseClient {
  final Future<http.Response> Function(http.BaseRequest request) handler;

  FakeHttpClient(this.handler);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await handler(request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      headers: response.headers,
      request: request,
    );
  }
}

class FakeGoogleSignInAdapter implements GoogleSignInAdapter {
  final GoogleSignInAccountData? accountData;
  final Exception? errorToThrow;
  final Exception? signOutError;
  int signInCalls = 0;
  int signOutCalls = 0;

  FakeGoogleSignInAdapter({
    this.accountData,
    this.errorToThrow,
    this.signOutError,
  });

  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async {
    signInCalls++;
    if (errorToThrow != null) {
      throw errorToThrow!;
    }
    return accountData;
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
    if (signOutError != null) throw signOutError!;
  }
}

class FailingInitializationGoogleSignIn extends Fake implements GoogleSignIn {
  int initializeCalls = 0;
  int authenticateCalls = 0;
  String? initializedServerClientId;

  @override
  Future<void> initialize({
    String? clientId,
    String? serverClientId,
    String? nonce,
    String? hostedDomain,
  }) async {
    initializeCalls++;
    initializedServerClientId = serverClientId;
    if (initializeCalls == 1) {
      throw StateError('Google configuration unavailable');
    }
  }

  @override
  Future<GoogleSignInAccount> authenticate({
    List<String> scopeHint = const [],
  }) async {
    authenticateCalls++;
    throw const GoogleSignInException(code: GoogleSignInExceptionCode.canceled);
  }
}

class FakeAndroidGoogleClient extends Fake
    implements platform.GoogleSignInPlatform {
  platform.InitParameters? parameters;
  int signOutCalls = 0;
  Exception? authenticationError;

  @override
  Future<void> init(platform.InitParameters params) async {
    parameters = params;
  }

  @override
  Future<platform.AuthenticationResults> authenticate(
    platform.AuthenticateParameters params,
  ) async {
    if (authenticationError case final error?) throw error;
    return platform.AuthenticationResults(
      user: const platform.GoogleSignInUserData(
        id: 'google-sub',
        email: 'user@example.com',
      ),
      // Simulate Google's token cache: a changed nonce yields a new token.
      authenticationTokens: platform.AuthenticationTokenData(
        idToken: 'signed-token-${parameters!.nonce}',
      ),
    );
  }

  @override
  Future<void> signOut(platform.SignOutParams params) async {
    signOutCalls++;
  }
}

const testSession = AuthSession(
  authenticated: true,
  user: AuthUser(
    id: 'usr-123',
    email: 'user@example.com',
    role: 'user',
    status: 'active',
  ),
  accessToken: 'loccoc-access-token',
  refreshToken: 'loccoc-refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 2592000,
);

void main() {
  test('Android repeat logins exchange distinct nonce-bound tokens', () async {
    final clients = <FakeAndroidGoogleClient>[];
    final nonces = <String>[];
    final tokens = <String>{};
    final adapter = AndroidGoogleSignInAdapter(
      serverClientId: 'web-client.apps.googleusercontent.com',
      createClient: () {
        final client = FakeAndroidGoogleClient();
        clients.add(client);
        return client;
      },
    );
    final service = GoogleAuthService(
      signInAdapter: adapter,
      apiClient: AuthApiClient(
        httpClient: FakeHttpClient((request) async {
          final body = jsonDecode(await request.finalize().bytesToString());
          final nonce = body['nonce'] as String;
          nonces.add(nonce);
          expect(nonce, clients.last.parameters!.nonce);
          expect(nonce, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
          expect(
            clients.last.parameters!.serverClientId,
            'web-client.apps.googleusercontent.com',
          );
          if (!tokens.add(body['idToken'] as String)) {
            return http.Response('{"code":"SOCIAL_TOKEN_REPLAY"}', 401);
          }
          return http.Response(jsonEncode(testSession.toJson()), 200);
        }),
      ),
    );
    expect(await service.signInWithGoogle(), isA<AuthSuccess>());
    // Also covers a new login after the in-memory session was lost on rebuild.
    expect(await service.signInWithGoogle(), isA<AuthSuccess>());
    expect(nonces.toSet(), hasLength(2));
    expect(clients, hasLength(2));
    await adapter.signOut();
    expect(clients.last.signOutCalls, 1);
    expect(clients.first.signOutCalls, 0);
  });

  test(
    'Android cancellation does not exchange a token and retry gets a fresh nonce',
    () async {
      final clients = <FakeAndroidGoogleClient>[];
      final adapter = AndroidGoogleSignInAdapter(
        createClient: () {
          final client = FakeAndroidGoogleClient();
          if (clients.isEmpty) {
            client.authenticationError = const GoogleSignInException(
              code: GoogleSignInExceptionCode.canceled,
            );
          }
          clients.add(client);
          return client;
        },
      );
      expect(await adapter.signIn(), isNull);
      final result = await adapter.signIn();
      expect(result, isNotNull);
      expect(result!.nonce, clients.last.parameters!.nonce);
      expect(clients.first.parameters!.nonce, isNot(result.nonce));
    },
  );

  test('replayed Google token has a specific retry message', () async {
    for (final body in [
      '{"code":"SOCIAL_TOKEN_REPLAY"}',
      '{"message":"Social ID token has already been used"}',
    ]) {
      final client = AuthApiClient(
        httpClient: FakeHttpClient((_) async => http.Response(body, 401)),
      );
      final result = await client.loginWithGoogleToken(idToken: 'used');
      expect(result, isA<AuthFailure>());
      expect((result as AuthFailure).message, contains('đã được sử dụng'));
      expect(result.message, isNot(contains('khóa')));
    }
  });

  test(
    'passes the Google server client build define to SDK initialization',
    () async {
      final sdk = FailingInitializationGoogleSignIn()..initializeCalls = 1;
      final adapter = DefaultGoogleSignInAdapter(googleSignIn: sdk);

      expect(await adapter.signIn(), isNull);
      const configuredId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
      expect(
        sdk.initializedServerClientId,
        configuredId.trim().isEmpty ? null : configuredId.trim(),
      );
    },
  );

  test('explicit server client ID overrides the build configuration', () async {
    final sdk = FailingInitializationGoogleSignIn()..initializeCalls = 1;
    final adapter = DefaultGoogleSignInAdapter(
      googleSignIn: sdk,
      serverClientId: 'explicit-web-client.apps.googleusercontent.com',
    );

    expect(await adapter.signIn(), isNull);
    expect(
      sdk.initializedServerClientId,
      'explicit-web-client.apps.googleusercontent.com',
    );
  });

  test(
    'configuration error is readable and does not call the backend',
    () async {
      var backendCalls = 0;
      final service = GoogleAuthService(
        signInAdapter: FakeGoogleSignInAdapter(
          errorToThrow: const GoogleSignInException(
            code: GoogleSignInExceptionCode.clientConfigurationError,
            description: 'serverClientId must be provided on Android',
          ),
        ),
        apiClient: AuthApiClient(
          httpClient: FakeHttpClient((request) async {
            backendCalls++;
            return http.Response('', 500);
          }),
        ),
      );

      final result = await service.signInWithGoogle();
      expect(result, isA<AuthFailure>());
      expect((result as AuthFailure).message, contains('cấu hình'));
      expect(result.message, isNot(contains('GoogleSignInException')));
      expect(backendCalls, 0);
    },
  );

  test(
    'initialization failure stops authentication and allows retry',
    () async {
      final sdk = FailingInitializationGoogleSignIn();
      final service = GoogleAuthService(
        signInAdapter: DefaultGoogleSignInAdapter(googleSignIn: sdk),
      );

      final failed = await service.signInWithGoogle();
      expect(failed, isA<AuthFailure>());
      expect(
        (failed as AuthFailure).message,
        contains('Google configuration unavailable'),
      );
      expect(sdk.authenticateCalls, 0);

      expect(await service.signInWithGoogle(), isA<AuthCancelled>());
      expect(sdk.initializeCalls, 2);
      expect(sdk.authenticateCalls, 1);
      expect(await service.signInWithGoogle(), isA<AuthCancelled>());
      expect(sdk.initializeCalls, 2);
    },
  );

  group('LocCoc logout', () {
    test(
      'revokes backend session with Bearer AT before Google sign-out',
      () async {
        final adapter = FakeGoogleSignInAdapter(
          signOutError: Exception('SDK unavailable'),
        );
        var logoutCalls = 0;
        final service = GoogleAuthService(
          signInAdapter: adapter,
          apiClient: AuthApiClient(
            httpClient: FakeHttpClient((request) async {
              logoutCalls++;
              expect(request.method, 'POST');
              expect(request.url.path, '/auth/logout');
              expect(
                request.headers['Authorization'],
                'Bearer ${testSession.accessToken}',
              );
              expect(adapter.signOutCalls, 0);
              return http.Response('{"revoked":true}', 200);
            }),
          ),
        );

        // A Google SDK failure cannot keep the revoked LocCoc session logged in.
        await service.signOut(session: testSession);
        expect(logoutCalls, 1);
        expect(adapter.signOutCalls, 1);
      },
    );

    test(
      'refreshes expired AT and retains rotated credentials for logout retry',
      () async {
        final adapter = FakeGoogleSignInAdapter();
        final paths = <String>[];
        var refreshedLogoutCalls = 0;
        final service = GoogleAuthService(
          signInAdapter: adapter,
          apiClient: AuthApiClient(
            httpClient: FakeHttpClient((request) async {
              paths.add(request.url.path);
              if (request.url.path == '/auth/refresh') {
                final body = jsonDecode(
                  await request.finalize().bytesToString(),
                );
                expect(body['refreshToken'], testSession.refreshToken);
                return http.Response(
                  '{"accessToken":"new-at","refreshToken":"new-rt"}',
                  200,
                );
              }
              if (request.headers['Authorization'] ==
                  'Bearer ${testSession.accessToken}') {
                return http.Response('', 401);
              }
              expect(request.headers['Authorization'], 'Bearer new-at');
              refreshedLogoutCalls++;
              return http.Response('', refreshedLogoutCalls == 1 ? 503 : 200);
            }),
          ),
        );

        await expectLater(
          service.signOut(session: testSession),
          throwsA(isA<AuthApiException>()),
        );
        expect(adapter.signOutCalls, 0);
        await service.signOut(session: testSession);
        expect(paths, [
          '/auth/logout',
          '/auth/refresh',
          '/auth/logout',
          '/auth/logout',
        ]);
        expect(adapter.signOutCalls, 1);
      },
    );

    test('clears local login when both AT and RT are rejected', () async {
      final adapter = FakeGoogleSignInAdapter();
      final paths = <String>[];
      final service = GoogleAuthService(
        signInAdapter: adapter,
        apiClient: AuthApiClient(
          httpClient: FakeHttpClient((request) async {
            paths.add(request.url.path);
            return http.Response('', 401);
          }),
        ),
      );
      await service.signOut(session: testSession);
      expect(paths, ['/auth/logout', '/auth/refresh']);
      expect(adapter.signOutCalls, 1);
    });

    test('connection loss does not report successful logout', () async {
      final adapter = FakeGoogleSignInAdapter();
      final service = GoogleAuthService(
        signInAdapter: adapter,
        apiClient: AuthApiClient(
          httpClient: FakeHttpClient((_) async {
            throw const SocketException('offline');
          }),
        ),
      );
      await expectLater(
        service.signOut(session: testSession),
        throwsA(isA<SocketException>()),
      );
      expect(adapter.signOutCalls, 0);
    });

    testWidgets(
      'blocks duplicate logout and allows retry after server failure',
      (tester) async {
        final adapter = FakeGoogleSignInAdapter();
        final firstResponse = Completer<http.Response>();
        var logoutCalls = 0;
        final service = GoogleAuthService(
          signInAdapter: adapter,
          apiClient: AuthApiClient(
            httpClient: FakeHttpClient((_) async {
              logoutCalls++;
              return logoutCalls == 1
                  ? firstResponse.future
                  : http.Response('', 200);
            }),
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: HomeScreen(session: testSession, googleAuthService: service),
          ),
        );
        await tester.tap(find.byIcon(Icons.logout_rounded));
        await tester.pump();
        expect(
          tester.widget<IconButton>(find.byType(IconButton)).onPressed,
          isNull,
        );
        expect(logoutCalls, 1);
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(adapter.signOutCalls, 0);

        firstResponse.complete(http.Response('', 503));
        await tester.pumpAndSettle();
        expect(find.text(AppStrings.logoutFailed), findsOneWidget);
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(adapter.signOutCalls, 0);

        await tester.tap(find.byIcon(Icons.logout_rounded));
        await tester.pumpAndSettle();
        expect(logoutCalls, 2);
        expect(adapter.signOutCalls, 1);
        expect(find.byType(AuthScreen), findsOneWidget);
        expect(find.byType(HomeScreen), findsNothing);
        expect(
          tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
          isFalse,
        );
      },
    );
  });

  group('AuthApiClient Unit Tests', () {
    test('returns AuthSuccess when server responds 200 OK', () async {
      final fakeClient = FakeHttpClient((request) async {
        expect(request.url.path, '/auth/social/google');
        expect(request.method, 'POST');
        final body = jsonDecode(await request.finalize().bytesToString());
        expect(body['idToken'], 'valid-google-id-token');

        return http.Response(
          jsonEncode({
            'authenticated': true,
            'user': {
              'id': 'usr-123',
              'email': 'loccoc.user@gmail.com',
              'role': 'user',
              'status': 'active',
              'emailVerifiedAt': '2026-10-26T12:00:00Z',
            },
            'accessToken': 'header.jwtpayload.signature',
            'refreshToken': 'opaque-refresh-token',
            'tokenType': 'Bearer',
            'expiresIn': 900,
            'refreshExpiresIn': 2592000,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = AuthApiClient(httpClient: fakeClient);
      final result = await client.loginWithGoogleToken(
        idToken: 'valid-google-id-token',
      );

      expect(result, isA<AuthSuccess>());
      final success = result as AuthSuccess;
      expect(success.session.authenticated, isTrue);
      expect(success.session.user.id, 'usr-123');
      expect(success.session.user.email, 'loccoc.user@gmail.com');
      expect(success.session.accessToken, 'header.jwtpayload.signature');
    });

    test(
      'returns a neutral AuthFailure for 401 without claiming the account is locked',
      () async {
        final fakeClient = FakeHttpClient((request) async {
          return http.Response(
            jsonEncode({'message': 'Invalid social ID token'}),
            401,
            headers: {'content-type': 'application/json'},
          );
        });

        final client = AuthApiClient(httpClient: fakeClient);
        final result = await client.loginWithGoogleToken(idToken: 'bad-token');

        expect(result, isA<AuthFailure>());
        final failure = result as AuthFailure;
        expect(failure.statusCode, 401);
        expect(
          failure.message,
          contains('Không thể xác thực đăng nhập Google'),
        );
        expect(failure.message, isNot(contains('khóa')));
      },
    );

    test(
      'returns AuthFailure with status 429 when rate limit reached',
      () async {
        final fakeClient = FakeHttpClient((request) async {
          return http.Response(
            jsonEncode({'message': 'Too Many Requests'}),
            429,
            headers: {'content-type': 'application/json'},
          );
        });

        final client = AuthApiClient(httpClient: fakeClient);
        final result = await client.loginWithGoogleToken(idToken: 'token');

        expect(result, isA<AuthFailure>());
        final failure = result as AuthFailure;
        expect(failure.statusCode, 429);
        expect(failure.message, contains('quá nhanh'));
      },
    );

    test(
      'returns AuthFailure with status 503 when service unavailable',
      () async {
        final fakeClient = FakeHttpClient((request) async {
          return http.Response('', 503);
        });

        final client = AuthApiClient(httpClient: fakeClient);
        final result = await client.loginWithGoogleToken(idToken: 'token');

        expect(result, isA<AuthFailure>());
        final failure = result as AuthFailure;
        expect(failure.statusCode, 503);
        expect(failure.message, contains('bảo trì'));
      },
    );
  });

  group('GoogleAuthService Flow Tests', () {
    test('returns AuthCancelled when adapter returns null', () async {
      final fakeAdapter = FakeGoogleSignInAdapter(accountData: null);
      final service = GoogleAuthService(signInAdapter: fakeAdapter);

      final result = await service.signInWithGoogle();
      expect(result, isA<AuthCancelled>());
      expect(fakeAdapter.signInCalls, 1);
    });

    test(
      'returns AuthFailure when adapter throws an unexpected error',
      () async {
        final fakeAdapter = FakeGoogleSignInAdapter(
          errorToThrow: Exception('Google Play Services unavailable'),
        );
        final service = GoogleAuthService(signInAdapter: fakeAdapter);

        final result = await service.signInWithGoogle();
        expect(result, isA<AuthFailure>());
        expect(
          (result as AuthFailure).message,
          contains('Google Play Services'),
        );
      },
    );
  });

  group('Google Sign-in UI & Widget Tests', () {
    testWidgets('renders Google sign-in button and divider', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: AuthScreen()));

      expect(find.byType(AuthDivider), findsOneWidget);
      expect(find.text(AppStrings.orDivider), findsOneWidget);
      expect(find.byType(GoogleSignInButton), findsOneWidget);
      expect(find.text(AppStrings.loginWithGoogle), findsOneWidget);
      expect(find.byType(GoogleLogo), findsOneWidget);
    });

    testWidgets(
      'clicking Google button signs in and navigates to HomeScreen on success',
      (tester) async {
        final fakeAdapter = FakeGoogleSignInAdapter(
          accountData: const GoogleSignInAccountData(
            idToken: 'mock-google-id-token',
            email: 'vietnam.dev@loccoc.vn',
            displayName: 'LocCoc Tester',
          ),
        );

        final fakeHttpClient = FakeHttpClient((request) async {
          if (request.url.path == '/auth/logout') {
            expect(
              request.headers['Authorization'],
              'Bearer mock-access-token-jwt-1234567890',
            );
            return http.Response('{"revoked":true}', 200);
          }
          return http.Response(
            jsonEncode({
              'authenticated': true,
              'user': {
                'id': 'acc-999',
                'email': 'vietnam.dev@loccoc.vn',
                'role': 'user',
                'status': 'active',
                'emailVerifiedAt': '2026-10-26T10:00:00Z',
              },
              'accessToken': 'mock-access-token-jwt-1234567890',
              'refreshToken': 'mock-refresh-token',
              'tokenType': 'Bearer',
              'expiresIn': 900,
              'refreshExpiresIn': 2592000,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        });

        final authService = GoogleAuthService(
          signInAdapter: fakeAdapter,
          apiClient: AuthApiClient(httpClient: fakeHttpClient),
        );

        await tester.pumpWidget(
          MaterialApp(home: AuthScreen(googleAuthService: authService)),
        );

        // Tap Google Sign-in button
        await tester.tap(find.byType(GoogleSignInButton));
        await tester.pumpAndSettle();

        // Verified: Navigated to HomeScreen with user's info
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('vietnam.dev@loccoc.vn'), findsOneWidget);
        expect(find.text(AppStrings.welcomeBack), findsOneWidget);
        expect(find.text('USER'), findsOneWidget);
        expect(find.text('ACTIVE'), findsOneWidget);

        // Test logout from HomeScreen using AppBar action
        await tester.tap(find.byIcon(Icons.logout_rounded));
        await tester.pumpAndSettle();

        // Verified: Navigated back to AuthScreen
        expect(find.byType(AuthScreen), findsOneWidget);
        expect(fakeAdapter.signOutCalls, 1);
      },
    );

    testWidgets('shows cancellation notice when user cancels Google sign-in', (
      tester,
    ) async {
      final fakeAdapter = FakeGoogleSignInAdapter(accountData: null);
      final authService = GoogleAuthService(signInAdapter: fakeAdapter);

      await tester.pumpWidget(
        MaterialApp(home: AuthScreen(googleAuthService: authService)),
      );

      await tester.tap(find.byType(GoogleSignInButton));
      await tester.pumpAndSettle();

      expect(find.text(AppStrings.googleLoginCancelled), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
    });

    testWidgets('shows error snackbar when backend rejects social login', (
      tester,
    ) async {
      final fakeAdapter = FakeGoogleSignInAdapter(
        accountData: const GoogleSignInAccountData(idToken: 'invalid-id-token'),
      );

      final fakeHttpClient = FakeHttpClient((request) async {
        return http.Response(
          jsonEncode({'message': 'Invalid social ID token'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final authService = GoogleAuthService(
        signInAdapter: fakeAdapter,
        apiClient: AuthApiClient(httpClient: fakeHttpClient),
      );

      await tester.pumpWidget(
        MaterialApp(home: AuthScreen(googleAuthService: authService)),
      );

      await tester.tap(find.byType(GoogleSignInButton));
      await tester.pumpAndSettle();

      expect(
        find.text('Không thể xác thực đăng nhập Google. Vui lòng thử lại.'),
        findsOneWidget,
      );
      expect(find.byType(HomeScreen), findsNothing);
    });
  });
}
