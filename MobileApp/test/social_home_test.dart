import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  Finder countValue(String value) => find.descendant(
    of: find.byKey(const Key('profile_friend_count')),
    matching: find.text(value),
  );

  testWidgets(
    'profile displays exact API count and refreshes after friends navigation',
    (tester) async {
      var count = 37;
      var friendsReads = 0;
      final api = fixtures.apiFor((request) async {
        if (request.url.path.endsWith('social-summary')) {
          return fixtures.json({'friendCount': count});
        }
        if (request.url.path == '/users/friends') {
          friendsReads++;
          return fixtures.json({'data': [], 'hasMore': false});
        }
        return fixtures.json({'unseenCount': 0, 'unreadCount': 0});
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(countValue('37'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('profile_friend_count')));
      await tester.tap(find.byKey(const Key('profile_friend_count')));
      await tester.pumpAndSettle();
      expect(friendsReads, 1);
      expect(
        tester.widget<FriendsScreen>(find.byType(FriendsScreen)).initialTab,
        3,
      );
      count = 2;
      final retained = tester.state(find.byType(FriendsScreen));
      await tester.tap(find.text('Cá nhân'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bạn bè của bạn'));
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(FriendsScreen)), same(retained));
      expect(friendsReads, 1);
      await tester.tap(find.text('Cá nhân'));
      await tester.pumpAndSettle();
      expect(countValue('2'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('summary errors show unknown and retry can display a real zero', (
    tester,
  ) async {
    var failing = true;
    final api = fixtures.apiFor((request) async {
      if (request.url.path.endsWith('social-summary')) {
        return fixtures.json(
          failing ? {} : {'friendCount': 0},
          failing ? 503 : 200,
        );
      }
      return fixtures.json({'unseenCount': 0, 'unreadCount': 0});
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: fixtures.session,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
          initialTab: 2,
          profile: const {'username': 'alice', 'displayName': 'Alice'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(countValue('—'), findsOneWidget);
    failing = false;
    await tester.ensureVisible(find.text('Thử tải lại số bạn bè'));
    await tester.tap(find.text('Thử tải lại số bạn bè'));
    await tester.pumpAndSettle();
    expect(countValue('0'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'home search opens account search and a result opens the safe profile',
    (tester) async {
      var sent = false;
      final api = fixtures.apiFor((request) async {
        if (request.url.path == '/users/search') {
          expect(request.url.queryParameters['q'], 'antony');
          return fixtures.json({
            'data': [fixtures.peer('antony4')],
            'hasMore': false,
          });
        }
        if (request.url.path == '/users/friend-requests') {
          sent = true;
          return fixtures.json({'id': 'request'}, 201);
        }
        if (request.url.path.startsWith('/users/profiles/')) {
          return fixtures.json(
            fixtures.peer(
              'antony4',
              status: sent ? 'OUTGOING_PENDING' : 'NONE',
              requestId: sent ? 'request' : null,
            ),
          );
        }
        return fixtures.json({
          'unseenCount': 0,
          'unreadCount': 0,
          'friendCount': 0,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Thêm tin'));
      await tester.tap(find.text('Thêm tin'));
      await tester.pumpAndSettle();
      expect(find.byType(FriendsScreen), findsNothing);
      expect(
        find.text('Tính năng thêm tin, ảnh sẽ được phát triển sau.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.byKey(const Key('home_account_search')));
      await tester.tap(find.byKey(const Key('home_account_search')));
      await tester.pumpAndSettle();
      expect(find.byType(FriendsScreen), findsOneWidget);
      expect(find.text('Tìm tài khoản'), findsOneWidget);
      expect(find.byKey(const Key('friend-search')), findsOneWidget);
      expect(find.byType(ChoiceChip), findsNothing);
      for (final label in const [
        'Tìm bạn',
        'Lời mời đến',
        'Đã gửi',
        'Bạn bè',
        'Đã chặn',
        'Gợi ý',
      ]) {
        expect(find.text(label), findsNothing);
      }
      expect(find.byKey(const Key('friends_privacy_button')), findsNothing);
      await tester.enterText(find.byKey(const Key('friend-search')), 'antony');
      await tester.pump(const Duration(milliseconds: 351));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem hồ sơ'));
      await tester.pumpAndSettle();
      expect(find.byType(UsernameProfileScreen), findsOneWidget);
      expect(find.text('@antony4'), findsOneWidget);
      await tester.ensureVisible(find.text('Kết bạn'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kết bạn'));
      await tester.pumpAndSettle();
      expect(sent, isTrue);
      expect(find.text('Đã gửi lời mời'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
