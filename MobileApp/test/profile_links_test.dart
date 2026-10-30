import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  test('only accepts exact username routes and the configured HTTPS host', () {
    expect(profileUsernameFromLink('/NHAN_nguyen'), 'nhan_nguyen');
    expect(profileUsernameFromLink('https://$appLinkHost/an'), 'an');
    for (final link in [
      '/search/extra',
      '/@an',
      '/a',
      '/an/extra',
      '/an?send=true',
      '/an#send',
      'http://$appLinkHost/an',
      'https://evil.example/an',
      '//evil.example/an',
      '/%61n',
    ]) {
      expect(profileUsernameFromLink(link), isNull, reason: link);
    }
  });

  for (final entry in {
    'SELF': 'Đây là hồ sơ của bạn',
    'NONE': 'Kết bạn',
    'FRIENDS': 'Friends',
    'OUTGOING_PENDING': 'Request Sent',
    'INCOMING_PENDING': 'Chấp nhận',
  }.entries) {
    testWidgets(
      'opening ${entry.key} reads only and shows the correct action',
      (tester) async {
        final methods = <String>[];
        final api = fixtures.apiFor((r) async {
          methods.add(r.method);
          expect(r.url.path, '/users/profiles/by-username/an');
          return fixtures.json(
            fixtures.peer('an', status: entry.key, requestId: 'pending'),
          );
        });
        await tester.pumpWidget(
          MaterialApp(
            home: UsernameProfileScreen(username: 'an', api: api),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(entry.value), findsOneWidget);
        expect(methods, ['GET']);
        if (entry.key != 'NONE') expect(find.text('Kết bạn'), findsNothing);
      },
    );
  }

  testWidgets('send requires a tap and refreshes a concurrent state conflict', (
    tester,
  ) async {
    var status = 'NONE';
    var mutations = 0;
    final api = fixtures.apiFor((r) async {
      if (r.method == 'POST') {
        mutations++;
        status = 'INCOMING_PENDING';
        return fixtures.json({
          'message': 'Changed',
          'code': 'FRIEND_REQUEST_STATE_CHANGED',
        }, 409);
      }
      return fixtures.json(
        fixtures.peer('an', status: status, requestId: 'pending'),
      );
    });
    await tester.pumpWidget(
      MaterialApp(
        home: UsernameProfileScreen(username: 'an', api: api),
      ),
    );
    await tester.pumpAndSettle();
    expect(mutations, 0);
    await tester.tap(find.text('Kết bạn'));
    await tester.pumpAndSettle();
    expect(mutations, 1);
    expect(find.text('Chấp nhận'), findsOneWidget);
    expect(find.text('Từ chối'), findsOneWidget);
  });

  testWidgets(
    'keeps a deep-link destination through login and username onboarding',
    (tester) async {
      tester.binding.platformDispatcher.defaultRouteNameTestValue = '/AN';
      addTearDown(
        tester.binding.platformDispatcher.clearDefaultRouteNameTestValue,
      );
      var claimed = false;
      var reads = 0;
      var requests = 0;
      final api = fixtures.apiFor((r) async {
        if (r.url.path == '/users/me') {
          return fixtures.json({
            'id': fixtures.session.user.id,
            'username': claimed ? 'alice' : null,
            'displayName': 'Alice',
          });
        }
        if (r.url.path == '/users/me/username') {
          claimed = true;
          return fixtures.json({'username': 'alice'}, 201);
        }
        if (r.method != 'GET') requests++;
        reads++;
        return fixtures.json(fixtures.peer('an'));
      });
      final links = ProfileLinkSession()
        ..auth = GoogleAuthService(apiClient: api.auth);
      await tester.pumpWidget(LocCocApp(linkSession: links));
      final nav = tester.state<NavigatorState>(find.byType(Navigator).first);
      await tester.pumpAndSettle();
      final auth = tester.widget<AuthScreen>(find.byType(AuthScreen).last);
      auth.onLoginSuccess!(fixtures.session);
      await tester.pumpAndSettle();
      expect(reads, 0);
      expect(find.text('Chọn username của bạn'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('username')), 'alice');
      await tester.tap(find.text('Lưu username'));
      await tester.pumpAndSettle();
      expect(find.byType(UsernameProfileScreen), findsOneWidget);
      expect(find.text('@an'), findsOneWidget);
      expect(requests, 0);
      expect(reads, 1);
      nav.pop();
      await tester.pumpAndSettle();
      nav.pushNamed('/an'); // A warm link reuses the authenticated session.
      await tester.pumpAndSettle();
      expect(find.text('Kết bạn'), findsOneWidget);
      expect(requests, 0);
      await tester.pumpWidget(const SizedBox());
      links.dispose();
    },
  );
}
