import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/auth/presentation/widgets/session_boundary.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/settings/presentation/change_password_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_privacy_screen.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/users/presentation/edit_profile_screen.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';
import 'account_security_test.dart' as security;
import 'remembered_accounts_test.dart' as f;
import 'user_social_test.dart' as social;

void main() {
  late f.MemoryVault memory;
  late security.SecurityBackend backend;
  late GoogleAuthService auth;
  late UserApiClient api;
  setUp(() async {
    memory = f.MemoryVault();
    backend = security.SecurityBackend();
    auth = f.service(memory.open(), backend);
    await auth.acceptLogin(f.session('a'), remember: true, retain: true);
    api = UserApiClient(
      auth: backend,
      session: auth.session!,
      coordinator: auth,
      onSessionChanged: auth.updateSession,
    );
  });
  Future<void> fillPassword(
    WidgetTester tester, {
    String old = 'current-password',
    String next = 'a different long passphrase 2026',
  }) async {
    await tester.enterText(find.byKey(const Key('current_password')), old);
    await tester.enterText(find.byKey(const Key('new_password')), next);
    await tester.enterText(find.byKey(const Key('confirm_new_password')), next);
    await tester.ensureVisible(find.byKey(const Key('submit_change_password')));
  }

  Future<void> showHome(
    WidgetTester tester, {
    ProfileLinkSession? links,
  }) async {
    await tester.pumpWidget(
      ProfileLinkScope(
        session: links ?? ProfileLinkSession(),
        child: MaterialApp(
          theme: AppTheme.lightTheme,
          home: SessionBoundary(
            auth: auth,
            api: api,
            child: HomeScreen(
              session: api.session,
              userApi: api,
              googleAuthService: auth,
              initialTab: 2,
              profile: const {
                'id': 'a',
                'username': 'alice',
                'displayName': 'Alice',
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> openSettings(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(const Key('profile_settings')));
    await tester.tap(find.byKey(const Key('profile_settings')));
    await tester.pumpAndSettle();
  }

  Future<void> reachSettings(WidgetTester tester, String key) async {
    await tester.scrollUntilVisible(
      find.byKey(Key(key)),
      200,
      scrollable: find
          .descendant(
            of: find.byType(SettingsPrivacyScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'settings reaches password form, explains Google-only limitation, and wrong password stays signed in',
    (tester) async {
      backend.handler = (area, path, _, _) async {
        if (path == 'change-password') throw const AuthApiException(401);
        if (area == 'notifications') return {'unseenCount': 0};
        if (path == 'me/social-summary') return {'friendCount': 0};
        return {'items': []};
      };
      await showHome(tester);
      await openSettings(tester);
      await reachSettings(tester, 'change_password_settings');
      await tester.tap(find.byKey(const Key('change_password_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(ChangePasswordScreen), findsOneWidget);
      expect(
        find.textContaining('Chức năng đặt mật khẩu đầu tiên chưa được hỗ trợ'),
        findsOneWidget,
      );
      await fillPassword(tester, old: 'wrong');
      await tester.tap(find.byKey(const Key('submit_change_password')));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Mật khẩu hiện tại chưa đúng'),
        findsOneWidget,
      );
      expect(auth.session, isNotNull);
      expect(backend.refreshCalls, 0);
      expect(find.byType(AuthScreen), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'confirmation mismatch and common-password policy prevent a request',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(home: ChangePasswordScreen(account: api)),
      );
      await fillPassword(tester, next: 'Password123!');
      await tester.tap(find.byKey(const Key('submit_change_password')));
      await tester.pumpAndSettle();
      expect(find.textContaining('quá phổ biến'), findsOneWidget);
      expect(backend.passwordCalls, 0);
      await fillPassword(tester);
      await tester.enterText(
        find.byKey(const Key('confirm_new_password')),
        'mismatch',
      );
      await tester.tap(find.byKey(const Key('submit_change_password')));
      await tester.pumpAndSettle();
      expect(find.text('Mật khẩu nhập lại chưa khớp.'), findsOneWidget);
      expect(backend.passwordCalls, 0);
    },
  );

  for (final storageFailure in [false, true]) {
    testWidgets(
      'acknowledged password replaces nested session boundaries once${storageFailure ? ' despite failed persistence' : ''}',
      (tester) async {
        final links = ProfileLinkSession()
          ..attach(api, auth, {'username': 'alice'});
        await showHome(tester, links: links);
        await openSettings(tester);
        await reachSettings(tester, 'change_password_settings');
        await tester.tap(find.byKey(const Key('change_password_settings')));
        await tester.pumpAndSettle();
        await fillPassword(tester);
        if (storageFailure) memory.failWrite = true;
        await tester.tap(find.byKey(const Key('submit_change_password')));
        await tester.pumpAndSettle();
        expect(backend.passwordCalls, 1);
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.byType(ChangePasswordScreen), findsNothing);
        expect(find.byType(AuthScreen), findsNothing);
        expect(links.api, isNot(same(api)));
        expect(links.api!.session.accessToken, 'access-a-password-changed');
        expect(auth.session!.user.id, 'a');
        expect(api.isCurrent, isFalse);
        expect(
          tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
          isFalse,
        );
        expect(
          find.textContaining(
            storageFailure ? 'chưa xác nhận lưu phiên' : 'Đã đổi mật khẩu.',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        links.dispose();
      },
    );
  }

  testWidgets(
    'uncertain password result disables replay and permits explicit reauthentication',
    (tester) async {
      backend.handler = (area, path, _, _) async {
        if (path == 'change-password') {
          throw TimeoutException('private transport internals');
        }
        if (area == 'notifications') return {'unseenCount': 0};
        return {'friendCount': 0};
      };
      await showHome(tester);
      await openSettings(tester);
      await reachSettings(tester, 'change_password_settings');
      await tester.tap(find.byKey(const Key('change_password_settings')));
      await tester.pumpAndSettle();
      await fillPassword(tester);
      await tester.tap(find.byKey(const Key('submit_change_password')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Chưa xác định được kết quả'), findsOneWidget);
      expect(find.textContaining('private transport'), findsNothing);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('submit_change_password')),
            )
            .onPressed,
        isNull,
      );
      expect(auth.session, isNotNull);
      expect(backend.passwordCalls, 1);
      await tester.ensureVisible(
        find.byKey(const Key('password_reauthenticate')),
      );
      await tester.tap(find.byKey(const Key('password_reauthenticate')));
      await tester.pumpAndSettle();
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(auth.session, isNull);
      expect(backend.refreshCalls, 0);
    },
  );

  testWidgets(
    '429 displays server Retry-After while keeping password form/session',
    (tester) async {
      final realApi = AuthApiClient(
        httpClient: MockClient(
          (_) async => http.Response(
            '{"message":"internal service detail"}',
            429,
            headers: {'retry-after': '37'},
          ),
        ),
      );
      auth = GoogleAuthService(
        apiClient: realApi,
        vault: memory.open(),
        signInAdapter: f.Adapter(),
      );
      await auth.acceptLogin(f.session('a'), remember: true, retain: false);
      api = UserApiClient(
        auth: realApi,
        session: auth.session!,
        coordinator: auth,
      );
      await tester.pumpWidget(
        MaterialApp(home: ChangePasswordScreen(account: api)),
      );
      await fillPassword(tester);
      await tester.tap(find.byKey(const Key('submit_change_password')));
      await tester.pumpAndSettle();
      expect(find.textContaining('37 giây'), findsOneWidget);
      expect(find.textContaining('internal service'), findsNothing);
      expect(auth.session, isNotNull);
      realApi.close();
    },
  );

  testWidgets('password save is single-flight while response is pending', (
    tester,
  ) async {
    final reply = Completer<Map<String, dynamic>>();
    backend.handler = (_, _, _, _) => reply.future;
    await tester.pumpWidget(
      MaterialApp(home: ChangePasswordScreen(account: api)),
    );
    await fillPassword(tester);
    await tester.tap(find.byKey(const Key('submit_change_password')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('submit_change_password')));
    await tester.pump();
    expect(backend.passwordCalls, 1);
    reply.complete(security.replacementPair());
    await tester.pumpAndSettle();
    expect(backend.passwordCalls, 1);
  });

  testWidgets(
    'logout-all cancellation sends nothing; confirmed double tap ends current session once',
    (tester) async {
      await auth.vault.remember(
        f.session('b'),
        remember: true,
        retain: true,
        active: false,
      );
      await showHome(tester);
      await openSettings(tester);
      await reachSettings(tester, 'logout_all_settings');
      await tester.tap(find.byKey(const Key('logout_all_settings')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(backend.logoutAllCalls, 0);
      expect(auth.session, isNotNull);
      final reply = Completer<Map<String, dynamic>>();
      backend.handler = (_, path, _, _) async => path == 'logout-all'
          ? reply.future
          : {'unseenCount': 0, 'friendCount': 0};
      await tester.tap(find.byKey(const Key('logout_all_settings')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_logout_all')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('logout_all_settings')));
      await tester.pump();
      expect(backend.logoutAllCalls, 1);
      reply.complete({'revokedSessions': 2});
      await tester.pumpAndSettle();
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      expect(find.byKey(const Key('logout_retention_dialog')), findsNothing);
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'a').canContinue,
        isFalse,
      );
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'b').canContinue,
        isTrue,
      );
      expect(
        tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
        isFalse,
      );
    },
  );

  testWidgets(
    'EditProfile avatar-only payload omits name and phone during name cooldown',
    (tester) async {
      Map<String, dynamic>? patch;
      final user = social.apiFor((r) async {
        if (r.method == 'PATCH') {
          patch = jsonDecode(r.body) as Map<String, dynamic>;
        }
        return social.json({
          'displayName': 'Alice',
          'username': 'alice',
          'phone': '+84375456123',
          'avatarUrl': patch?['avatarUrl'],
          'nextDisplayNameChangeAt': '2026-12-10T12:00:00Z',
        });
      });
      await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: user)));
      await tester.pumpAndSettle();
      expect(find.textContaining('+84375456123'), findsOneWidget);
      expect(
        find.textContaining('Chức năng sửa số chưa được hỗ trợ'),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const Key('edit_profile_avatar_url')),
        'https://images.example.com/a.png',
      );
      await tester.ensureVisible(find.byKey(const Key('save_display_name')));
      await tester.tap(find.byKey(const Key('save_display_name')));
      await tester.pumpAndSettle();
      expect(patch, {'avatarUrl': 'https://images.example.com/a.png'});
    },
  );

  testWidgets(
    'name cooldown conflict retains avatar input without claiming a partial save',
    (tester) async {
      final user = social.apiFor(
        (r) async => r.method == 'PATCH'
            ? social.json({
                'code': 'DISPLAY_NAME_CHANGE_TOO_SOON',
                'nextDisplayNameChangeAt': '2026-12-12T00:00:00Z',
              }, 409)
            : social.json({
                'displayName': 'Alice',
                'username': 'alice',
                'avatarUrl': null,
              }),
      );
      await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: user)));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('edit_display_name')),
        'Changed name',
      );
      await tester.enterText(
        find.byKey(const Key('edit_profile_avatar_url')),
        'https://images.example.com/new.png',
      );
      await tester.ensureVisible(find.byKey(const Key('save_display_name')));
      await tester.tap(find.byKey(const Key('save_display_name')));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Bạn chỉ được đổi tên mỗi 30 ngày'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('edit_profile_avatar_url')),
            )
            .controller!
            .text,
        'https://images.example.com/new.png',
      );
    },
  );

  for (final screen in ['password', 'profile']) {
    testWidgets('$screen form fits 360px at 200% text with keyboard', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = const FakeViewPadding(bottom: 260);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: screen == 'password'
              ? ChangePasswordScreen(account: api)
              : EditProfileScreen(api: api),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
