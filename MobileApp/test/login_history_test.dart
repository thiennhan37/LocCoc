import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/settings/data/login_history_api.dart';
import 'package:mobile_app/features/settings/presentation/login_history_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_privacy_screen.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'user_social_test.dart' as fixtures;
import 'remembered_accounts_test.dart' as auth_fixtures;

Map<String, dynamic> row(
  String id, {
  String status = 'ACTIVE',
  bool current = false,
  String platform = 'android',
}) => {
  'id': id,
  'device': {'platform': platform, 'userAgent': 'Test mobile client'},
  'ip': '127.0.0.1',
  'createdAt': '2026-11-02T10:00:00Z',
  'lastUsedAt': '2026-11-02T11:00:00Z',
  'expiresAt': '2026-12-02T10:00:00Z',
  'isCurrent': current,
  'status': status,
  'revokedAt': status == 'REVOKED' ? '2026-11-02T12:00:00Z' : null,
};
Map<String, dynamic> page(List<Map<String, dynamic>> items, [String? cursor]) =>
    {
      'items': items,
      'pageInfo': {'hasMore': cursor != null, 'nextCursor': cursor},
    };

void main() {
  Future<void> show(
    WidgetTester tester,
    UserApiClient account, {
    Future<void> Function()? onEnd,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginHistoryScreen(
          api: LoginHistoryApi(account),
          onCurrentSessionRevoked: onEnd ?? () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'profile settings opens login history with current, revoked and expired states',
    (tester) async {
      final account = fixtures.apiFor(
        (r) async => fixtures.json(
          r.url.path.endsWith('/history')
              ? page([
                  row('current', current: true),
                  row('revoked', status: 'REVOKED', platform: 'web'),
                  row('expired', status: 'EXPIRED', platform: 'ios'),
                ])
              : {'friendCount': 1, 'unseenCount': 0, 'unreadCount': 0},
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: account,
            googleAuthService: GoogleAuthService(apiClient: account.auth),
            initialTab: 2,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('profile_settings')));
      await tester.tap(find.byKey(const Key('profile_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(SettingsPrivacyScreen), findsOneWidget);
      await tester.tap(find.byKey(const Key('login_history_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(LoginHistoryScreen), findsOneWidget);
      expect(find.text('Phiên hiện tại'), findsOneWidget);
      expect(find.text('Còn hiệu lực'), findsOneWidget);
      expect(find.byKey(const ValueKey('history_revoked')), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('history_expired')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.byKey(const ValueKey('history_expired')), findsOneWidget);
      expect(find.byKey(const ValueKey('revoke_expired')), findsNothing);
      expect(find.byKey(const ValueKey('revoke_revoked')), findsNothing);
      expect(find.text(fixtures.session.accessToken), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'history loads subsequent pages without replacing existing entries',
    (tester) async {
      final account = fixtures.apiFor(
        (r) async => fixtures.json(
          r.url.queryParameters['cursor'] == 'next'
              ? page([row('older', status: 'REVOKED')])
              : page([row('first')], 'next'),
        ),
      );
      await show(tester, account);
      await tester.ensureVisible(find.text('Xem thêm'));
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('history_first')), findsOneWidget);
      expect(find.byKey(const ValueKey('history_older')), findsOneWidget);
      expect(find.text('Xem thêm'), findsNothing);
    },
  );

  testWidgets('history error is retryable and empty state is honest', (
    tester,
  ) async {
    var failed = true;
    final account = fixtures.apiFor(
      (r) async => fixtures.json(failed ? {} : page([]), failed ? 503 : 200),
    );
    await show(tester, account);
    expect(
      find.text('Chưa thể tải lịch sử đăng nhập. Hãy thử lại.'),
      findsOneWidget,
    );
    failed = false;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa có lịch sử đăng nhập.'), findsOneWidget);
  });

  testWidgets(
    'other-session logout requires confirmation and refreshes its history state',
    (tester) async {
      var revoked = false, deletes = 0, ended = 0;
      final account = fixtures.apiFor((r) async {
        if (r.method == 'DELETE') {
          deletes++;
          revoked = true;
          return fixtures.json({'revoked': true, 'isCurrent': false});
        }
        return fixtures.json(
          page([row('other', status: revoked ? 'REVOKED' : 'ACTIVE')]),
        );
      });
      await show(
        tester,
        account,
        onEnd: () async {
          ended++;
        },
      );
      await tester.ensureVisible(find.byKey(const ValueKey('revoke_other')));
      await tester.tap(find.byKey(const ValueKey('revoke_other')));
      await tester.pumpAndSettle();
      expect(deletes, 0);
      await tester.tap(find.byKey(const Key('confirm_session_logout')));
      await tester.pumpAndSettle();
      expect(deletes, 1);
      expect(ended, 0);
      expect(find.byKey(const ValueKey('revoke_other')), findsNothing);
      expect(find.byType(LoginHistoryScreen), findsOneWidget);
    },
  );

  testWidgets('cancelled logout sends no revoke request', (tester) async {
    var deletes = 0;
    final account = fixtures.apiFor((r) async {
      if (r.method == 'DELETE') deletes++;
      return fixtures.json(page([row('other')]));
    });
    await show(tester, account);
    await tester.ensureVisible(find.byKey(const ValueKey('revoke_other')));
    await tester.tap(find.byKey(const ValueKey('revoke_other')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(deletes, 0);
    expect(find.byKey(const ValueKey('revoke_other')), findsOneWidget);
  });

  testWidgets('failed revoke preserves the active row and can be retried', (
    tester,
  ) async {
    var fail = true, revoked = false;
    final account = fixtures.apiFor((r) async {
      if (r.method == 'DELETE') {
        if (fail) return fixtures.json({}, 503);
        revoked = true;
        return fixtures.json({'isCurrent': false, 'revoked': true});
      }
      return fixtures.json(
        page([row('other', status: revoked ? 'REVOKED' : 'ACTIVE')]),
      );
    });
    await show(tester, account);
    for (var i = 0; i < 2; i++) {
      await tester.ensureVisible(find.byKey(const ValueKey('revoke_other')));
      await tester.tap(find.byKey(const ValueKey('revoke_other')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_session_logout')));
      await tester.pumpAndSettle();
      if (i == 0) {
        expect(
          find.text(
            'Chưa thể đăng xuất phiên. Hãy kiểm tra kết nối và thử lại.',
          ),
          findsOneWidget,
        );
        fail = false;
      }
    }
    expect(find.byKey(const ValueKey('revoke_other')), findsNothing);
  });

  testWidgets('expired access token is refreshed before retrying history', (
    tester,
  ) async {
    var refreshes = 0, reads = 0;
    final account = fixtures.apiFor((r) async {
      if (r.url.path == '/auth/refresh') {
        refreshes++;
        return fixtures.json({
          'accessToken': 'new-access',
          'refreshToken': 'new-refresh',
        });
      }
      reads++;
      if (r.headers['Authorization'] ==
          'Bearer ${fixtures.session.accessToken}') {
        return fixtures.json({}, 401);
      }
      return fixtures.json(page([row('current', current: true)]));
    });
    await show(tester, account);
    expect(refreshes, 1);
    expect(reads, 2);
    expect(find.text('Phiên hiện tại'), findsOneWidget);
  });

  testWidgets(
    'revoked caller invokes session teardown after failed token refresh',
    (tester) async {
      var ended = 0;
      final account = fixtures.apiFor((r) async => fixtures.json({}, 401));
      await show(
        tester,
        account,
        onEnd: () async {
          ended++;
        },
      );
      expect(ended, 1);
    },
  );

  testWidgets(
    'self logout clears saved credential, keeps identity and removes authenticated navigation',
    (tester) async {
      final memory = auth_fixtures.MemoryVault();
      final vault = memory.open();
      final account = fixtures.apiFor((r) async {
        if (r.method == 'DELETE') {
          return fixtures.json({'revoked': true, 'isCurrent': true});
        }
        if (r.url.path.endsWith('/history')) {
          return fixtures.json(page([row('current', current: true)]));
        }
        return fixtures.json({
          'friendCount': 1,
          'unseenCount': 0,
          'unreadCount': 0,
        });
      });
      final auth = GoogleAuthService(
        apiClient: account.auth,
        vault: vault,
        signInAdapter: auth_fixtures.Adapter(),
      );
      await auth.acceptLogin(fixtures.session, remember: true, retain: true);
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: account,
            googleAuthService: auth,
            initialTab: 2,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('profile_settings')));
      await tester.tap(find.byKey(const Key('profile_settings')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('login_history_settings')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('revoke_current')));
      await tester.tap(find.byKey(const ValueKey('revoke_current')));
      await tester.pumpAndSettle();
      expect(find.text('Đăng xuất trên thiết bị này?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirm_session_logout')));
      await tester.pumpAndSettle();
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      expect((await vault.list()).single.canContinue, isFalse);
      expect(auth.session, isNull);
      expect(find.byKey(const Key('logout_retention_dialog')), findsNothing);
      expect(
        tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
        isFalse,
      );
    },
  );
}
