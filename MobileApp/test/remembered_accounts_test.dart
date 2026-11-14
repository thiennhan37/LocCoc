import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/features/auth/data/services/account_vault.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/auth/domain/models/auth_result.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';
import 'package:mobile_app/features/users/presentation/profile_gate.dart';

AuthSession session(String id, [String token = 'one']) => AuthSession(
  authenticated: true,
  user: AuthUser(
    id: id,
    email: '$id@example.com',
    role: 'user',
    status: 'active',
  ),
  accessToken: 'access-$id-$token',
  refreshToken: 'refresh-$id-$token',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 3600,
);

class MemoryVault {
  final values = <String, String>{};
  bool failWrite = false;
  AccountVault open({
    DateTime Function()? now,
    String origin = 'https://api.example.com',
  }) => AccountVault(
    read: (key) async => values[key],
    write: (key, value) async {
      if (failWrite) throw StateError('storage unavailable');
      values[key] = value;
    },
    supported: true,
    origin: origin,
    now: now,
  );
}

class Adapter implements GoogleSignInAdapter {
  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async => null;
  @override
  Future<void> signOut() async {}
}

class Api extends AuthApiClient {
  bool profileComplete = true;
  int refreshCalls = 0;
  int logoutCalls = 0;
  Object? refreshError;
  Object? logoutError;
  Completer<void>? barrier;
  @override
  Future<AuthResult> loginWithPassword({
    required String email,
    required String password,
    String? platform,
  }) async => AuthSuccess(session('a'));
  @override
  Future<AuthSession> refreshSession(AuthSession current) async {
    refreshCalls++;
    await barrier?.future;
    if (refreshError case final error?) throw error;
    return session(current.user.id, 'rotated-$refreshCalls');
  }

  @override
  Future<void> logout({required String accessToken}) async {
    logoutCalls++;
    if (logoutError case final error?) throw error;
  }

  @override
  Future<Map<String, dynamic>> serviceRequest(
    String method,
    String area,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    if (area == 'notifications') return {'unseenCount': 0, 'unreadCount': 0};
    final id = accessToken.split('-')[1];
    return {
      'id': id,
      'username': profileComplete ? id : null,
      'displayName': 'Account $id',
      'avatarUrl': null,
    };
  }
}

GoogleAuthService service(AccountVault vault, Api api) =>
    GoogleAuthService(vault: vault, apiClient: api, signInAdapter: Adapter());

void main() {
  late MemoryVault memory;
  late AccountVault vault;
  late Api api;
  late GoogleAuthService auth;
  setUp(() {
    memory = MemoryVault();
    vault = memory.open();
    api = Api();
    auth = service(vault, api);
  });

  Future<void> showHome(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: session('a'),
          googleAuthService: auth,
          profile: const {'username': 'a', 'displayName': 'Account a'},
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> startLogout(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.logout_rounded));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'declining session retention revokes but always remembers the account',
    (tester) async {
      await auth.acceptLogin(session('a'), remember: false, retain: false);
      await showHome(tester);
      await startLogout(tester);
      expect(find.byKey(const Key('logout_retention_dialog')), findsOneWidget);
      expect(api.logoutCalls, 0);
      await tester.tap(find.byKey(const Key('logout_identity_only')));
      await tester.pumpAndSettle();
      expect(api.logoutCalls, 1);
      expect((await vault.list()).single.email, 'a@example.com');
      expect((await vault.list()).single.canContinue, isFalse);
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(await vault.activeId(), isNull);
    },
  );

  testWidgets(
    'saving at logout retains only that account and does not auto-enter',
    (tester) async {
      await vault.remember(session('b'), remember: true, retain: false);
      await auth.acceptLogin(session('a'), remember: true, retain: false);
      await showHome(tester);
      await startLogout(tester);
      await tester.tap(find.byKey(const Key('logout_keep_session')));
      await tester.pumpAndSettle();
      final saved = await vault.list();
      expect(saved.singleWhere((a) => a.id == 'a').canContinue, isTrue);
      expect(saved.singleWhere((a) => a.id == 'b').canContinue, isFalse);
      expect(api.logoutCalls, 0);
      expect(api.refreshCalls, 0);
      expect(auth.session, isNull);
      expect(await vault.activeId(), isNull);
      expect(find.text('Chọn tài khoản'), findsOneWidget);
    },
  );

  testWidgets(
    'cancelling logout changes neither session nor retained credentials',
    (tester) async {
      await auth.acceptLogin(session('a'), remember: true, retain: false);
      await showHome(tester);
      await startLogout(tester);
      await tester.tap(find.byKey(const Key('logout_cancel')));
      await tester.pumpAndSettle();
      expect(auth.session!.accessToken, session('a').accessToken);
      expect(api.logoutCalls, 0);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(find.byType(HomeScreen), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'already retained logout skips confirmation and preserves saved session',
    (tester) async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await showHome(tester);
      await startLogout(tester);
      expect(find.byKey(const Key('logout_retention_dialog')), findsNothing);
      expect(find.byType(AuthScreen), findsOneWidget);
      expect((await vault.list()).single.canContinue, isTrue);
      expect(await vault.activeId(), isNull);
      expect(api.logoutCalls, 0);
    },
  );

  testWidgets(
    'chooser can revoke a saved session without removing the account',
    (tester) async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.leaveRetainingSession(session('a'));
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(googleAuthService: auth, autoRestore: false),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('remove_session_a')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_remove_session')));
      await tester.pumpAndSettle();
      expect(api.logoutCalls, 1);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(find.byKey(const ValueKey('saved_a')), findsOneWidget);
      expect(find.byKey(const ValueKey('remove_session_a')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('saved_a')));
      await tester.pumpAndSettle();
      expect(find.byType(TextFormField), findsNWidgets(2));
    },
  );

  testWidgets('onboarding uses the same logout retention prompt', (
    tester,
  ) async {
    api.profileComplete = false;
    await auth.acceptLogin(session('a'), remember: true, retain: false);
    await tester.pumpWidget(
      MaterialApp(
        home: ProfileGate(session: session('a'), authService: auth),
      ),
    );
    await tester.pumpAndSettle();
    await startLogout(tester);
    expect(find.byKey(const Key('logout_retention_dialog')), findsOneWidget);
    await tester.tap(find.byKey(const Key('logout_keep_session')));
    await tester.pumpAndSettle();
    expect(find.byType(AuthScreen), findsOneWidget);
    expect((await vault.list()).single.canContinue, isTrue);
    expect(api.logoutCalls, 0);
  });

  test(
    'failed rotation cannot resurrect an old credential by saving at logout',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      api.refreshError = const AuthApiException(401);
      await expectLater(
        auth.refreshSession(session('a')),
        throwsA(isA<AuthApiException>()),
      );
      await expectLater(
        auth.leaveRetainingSession(session('a')),
        throwsA(isA<AuthApiException>()),
      );
      expect((await vault.list()).single.canContinue, isFalse);
    },
  );

  test(
    'native vault survives restart but discards Keychain entries after reinstall',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({});
      final native = AccountVault(
        origin: 'https://native.example.com',
        supported: true,
      );
      await native.remember(session('a'), remember: true, retain: true);
      final restarted = AccountVault(
        origin: 'https://native.example.com',
        supported: true,
      );
      expect((await restarted.list()).single.canContinue, isTrue);
      SharedPreferences.setMockInitialValues({});
      final reinstalled = AccountVault(
        origin: 'https://native.example.com',
        supported: true,
      );
      expect(await reinstalled.list(), isEmpty);
    },
  );

  test(
    'identity and session consent are independent and access tokens are never persisted',
    () async {
      await auth.acceptLogin(session('a'), remember: false, retain: false);
      expect(await vault.list(), isEmpty);
      await auth.acceptLogin(session('a'), remember: true, retain: false);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(memory.values.values.single, isNot(contains('refresh-a-one')));
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      final raw = memory.values.values.single;
      expect(raw, contains('refresh-a-one'));
      expect(raw, isNot(contains('access-a-one')));
      expect(raw, isNot(contains('password')));
      expect(
        (await memory.open(origin: 'https://other.example.com').list()),
        isEmpty,
      );
    },
  );

  test(
    'restart validates and persists rotated token before returning a session',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      final restarted = service(memory.open(), api);
      final restored = await restarted.resume((await vault.activeId())!);
      expect(api.refreshCalls, 1);
      expect(restored!.refreshToken, 'refresh-a-rotated-1');
      expect(memory.values.values.single, contains('refresh-a-rotated-1'));
      expect(memory.values.values.single, isNot(contains('refresh-a-one')));
    },
  );

  test(
    'expired retained credentials require login without a refresh request',
    () async {
      final old = memory.open(now: () => DateTime.utc(2020));
      await old.remember(session('a'), remember: true, retain: true);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(await auth.resume('a'), isNull);
      expect(api.refreshCalls, 0);
    },
  );

  test(
    'interruption after credential consumption cannot replay on restart',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      expect(await vault.consume('a'), isNotNull);
      final restarted = service(memory.open(), api);
      expect(await restarted.resume('a'), isNull);
      expect(api.refreshCalls, 0);
    },
  );

  test(
    'revoked refresh clears credentials and keeps remembered identity',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      api.refreshError = const AuthApiException(401);
      await expectLater(auth.resume('a'), throwsA(isA<AuthApiException>()));
      expect((await vault.list()).single.canContinue, isFalse);
      expect(auth.session, isNull);
    },
  );

  test(
    'lost refresh response fails closed rather than retrying a consumed token',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      api.refreshError = TimeoutException('lost response');
      await expectLater(auth.resume('a'), throwsA(isA<TimeoutException>()));
      expect(await service(memory.open(), api).resume('a'), isNull);
      expect(api.refreshCalls, 1);
    },
  );

  test(
    'concurrent refreshes rotate once; stale client cannot replay old token',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      api.barrier = Completer<void>();
      final first = auth.refreshSession(session('a'));
      final second = auth.refreshSession(session('a'));
      await Future<void>.delayed(Duration.zero);
      expect(api.refreshCalls, 1);
      api.barrier!.complete();
      final refreshed = await Future.wait([first, second]);
      expect(refreshed[0].refreshToken, refreshed[1].refreshToken);
      expect(
        (await auth.refreshSession(session('a'))).refreshToken,
        refreshed[0].refreshToken,
      );
      expect(api.refreshCalls, 1);
    },
  );

  test(
    'switch keeps opted-in session but disables automatic entry and stale refresh',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.suspend();
      expect(await vault.activeId(), isNull);
      expect((await vault.list()).single.canContinue, isTrue);
      expect(api.logoutCalls, 0);
      await expectLater(
        auth.refreshSession(session('a')),
        throwsA(isA<AuthApiException>()),
      );
      auth.updateSession(session('a'));
      expect(auth.session, isNull);
      await auth.acceptLogin(session('b'), remember: true, retain: true);
      await expectLater(
        auth.refreshSession(session('a')),
        throwsA(isA<AuthApiException>()),
      );
      expect(await vault.activeId(), 'b');
    },
  );

  test('switch revokes a session which was not retained', () async {
    await auth.acceptLogin(session('a'), remember: true, retain: false);
    await auth.suspend();
    expect(api.logoutCalls, 1);
    expect(auth.session, isNull);
  });

  test(
    'logout revokes and retains only identity; deletion forgets identity',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.signOut(session: session('a'));
      expect(api.logoutCalls, 1);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(await vault.activeId(), isNull);
      expect(memory.values.values.single, isNot(contains('refresh-a-one')));
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.clearSession();
      expect(await vault.list(), isEmpty);
    },
  );

  test(
    'remove retained account validates and revokes its session before forgetting',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.suspend();
      await auth.removeSaved('a');
      expect(api.refreshCalls, 1);
      expect(api.logoutCalls, 1);
      expect(await vault.list(), isEmpty);
    },
  );

  test(
    'failed revocation preserves a rotated credential for removal retry',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      await auth.suspend();
      api.logoutError = const AuthApiException(503);
      await expectLater(
        auth.removeSaved('a'),
        throwsA(isA<AuthApiException>()),
      );
      expect((await vault.list()).single.canContinue, isTrue);
      api.logoutError = null;
      await auth.removeSaved('a');
      expect(await vault.list(), isEmpty);
    },
  );

  test('storage failure before rotation sends no refresh request', () async {
    await auth.acceptLogin(session('a'), remember: true, retain: true);
    memory.failWrite = true;
    await expectLater(auth.resume('a'), throwsStateError);
    expect(api.refreshCalls, 0);
    memory.failWrite = false;
    expect((await vault.list()).single.canContinue, isTrue);
  });

  test(
    'corrupt vault fails closed and unsupported platforms persist nothing',
    () async {
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      memory.values.updateAll((_, _) => jsonEncode({'version': 999}));
      await expectLater(vault.list(), throwsFormatException);
      final unsupported = AccountVault(
        supported: false,
        read: (_) async => throw StateError('unexpected'),
      );
      await unsupported.remember(session('a'), remember: true, retain: true);
      expect(await unsupported.list(), isEmpty);
    },
  );

  testWidgets('logged-out chooser prefills email, never password', (
    tester,
  ) async {
    await auth.acceptLogin(session('a'), remember: true, retain: false);
    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(googleAuthService: auth, autoRestore: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Chọn tài khoản'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('saved_a')));
    await tester.pumpAndSettle();
    final inputs = tester
        .widgetList<TextFormField>(find.byType(TextFormField))
        .toList();
    expect(inputs[0].controller!.text, 'a@example.com');
    expect(inputs[1].controller!.text, isEmpty);
    expect(api.refreshCalls, 0);
  });

  testWidgets('cold start enters only after server accepts the saved session', (
    tester,
  ) async {
    await auth.acceptLogin(session('a'), remember: true, retain: true);
    AuthSession? entered;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(
          googleAuthService: service(memory.open(), api),
          onLoginSuccess: (value) => entered = value,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(entered!.accessToken, 'access-a-rotated-1');
    expect(api.refreshCalls, 1);
  });

  testWidgets('revoked saved session stays outside authenticated UI', (
    tester,
  ) async {
    await auth.acceptLogin(session('a'), remember: true, retain: true);
    api.refreshError = const AuthApiException(401);
    var entered = false;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(
          googleAuthService: auth,
          onLoginSuccess: (_) => entered = true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(entered, isFalse);
    expect(find.byType(AuthScreen), findsOneWidget);
    expect((await vault.list()).single.canContinue, isFalse);
  });

  testWidgets('login has no storage choices; retention is decided at logout', (
    tester,
  ) async {
    AuthSession? entered;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(
          googleAuthService: auth,
          onLoginSuccess: (value) => entered = value,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(find.byType(TextFormField), findsNWidgets(2));
    await tester.enterText(find.byType(TextFormField).first, 'a@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'example-pass');
    await tester.ensureVisible(find.text('Đăng nhập'));
    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();
    expect(entered!.user.id, 'a');
    expect((await vault.list()).single.canContinue, isFalse);
  });

  testWidgets(
    'switch clears navigation and profile state before entering another account',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await vault.remember(session('b'), remember: true, retain: true);
      await auth.acceptLogin(session('a'), remember: true, retain: true);
      final links = ProfileLinkSession();
      addTearDown(links.dispose);
      await tester.pumpWidget(
        ProfileLinkScope(
          session: links,
          child: MaterialApp(
            home: HomeScreen(
              session: session('a'),
              googleAuthService: auth,
              initialTab: 2,
              profile: const {'username': 'a', 'displayName': 'Account a'},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Chuyển tài khoản'));
      await tester.tap(find.text('Chuyển tài khoản'));
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsNothing);
      expect(links.api, isNull);
      expect(await vault.activeId(), isNull);
      await tester.tap(find.byKey(const ValueKey('saved_b')));
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(auth.session!.user.id, 'b');
      expect(links.api!.session.user.id, 'b');
      expect(
        tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
        isFalse,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
