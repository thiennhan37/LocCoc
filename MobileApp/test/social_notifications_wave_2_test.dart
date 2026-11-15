import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/paginated_rows.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'package:mobile_app/features/users/presentation/mutual_friends.dart';
import 'package:mobile_app/features/notifications/data/notification_api.dart';
import 'package:mobile_app/features/notifications/data/push_notifications.dart';
import 'package:mobile_app/features/notifications/presentation/notifications_screen.dart';
import 'package:mobile_app/features/notifications/presentation/notification_labels.dart';
import 'user_social_test.dart' as f;
import 'notifications_test.dart' as n;

void main() {
  test(
    'page merge deduplicates within and across batches, preserving loaded order',
    () {
      expect(
        mergeUniqueRows(
          [
            {'id': 'a'},
            {'id': 'a'},
          ],
          [
            {'id': 'a'},
            {'id': 'b'},
            {'id': 'b'},
            {'id': 'c'},
          ],
        ).map((row) => row['id']),
        ['a', 'b', 'c'],
      );
    },
  );
  test(
    'notification actor is trimmed name, payload username, then generic label',
    () {
      expect(
        notificationActorLabel({'displayName': '  Minh  ', 'username': 'an'}),
        'Minh',
      );
      expect(
        notificationActorLabel({'displayName': '  ', 'username': ' an '}),
        '@an',
      );
      expect(notificationActorLabel({'username': '  '}), 'Một người dùng');
      expect(notificationActorLabel(null), 'Một người dùng');
      final date = DateTime.parse('2026-11-11T01:02:00Z').toLocal();
      expect(
        localNotificationTime('2026-11-11T01:02:00Z'),
        startsWith(
          '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}',
        ),
      );
      expect(localNotificationTime('bad timestamp'), 'Chưa rõ thời gian');
    },
  );

  testWidgets(
    'friend cards dedupe pages, clear search, and isolate action taps from card navigation',
    (tester) async {
      var searches = 0, profileReads = 0, sends = 0;
      final api = f.apiFor((r) async {
        if (r.url.path == '/users/search') {
          searches++;
          return f.json({
            'data': searches == 1
                ? [f.peer('an'), f.peer('an')]
                : [f.peer('an'), f.peer('binh'), f.peer('binh')],
            'hasMore': searches == 1,
            'nextCursor': 'next',
          });
        }
        if (r.url.path == '/users/friend-requests') {
          sends++;
          return f.json({'id': 'request'}, 201);
        }
        profileReads++;
        return f.json(
          f.peer('an', status: 'OUTGOING_PENDING', requestId: 'request'),
        );
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 351));
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsOneWidget);
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsOneWidget);
      expect(find.text('@binh'), findsOneWidget);
      await tester.tap(find.text('Kết bạn').first);
      await tester.pumpAndSettle();
      expect(sends, 1);
      expect(profileReads, 0);
      expect(searches, 2);
      await tester.tap(find.text('Name an'));
      await tester.pumpAndSettle();
      expect(find.byType(UsernameProfileScreen), findsOneWidget);
      expect(profileReads, 1);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(searches, 2);
      await tester.tap(find.byKey(const Key('clear_friend_search')));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('friend-search')))
            .controller!
            .text,
        '',
      );
      expect(find.text('@an'), findsNothing);
      expect(searches, 2);
    },
  );

  testWidgets(
    'single incoming request action retains other loaded pages and next page number',
    (tester) async {
      final pages = <String?>[];
      final api = f.apiFor((r) async {
        if (r.method == 'POST') return f.json({'status': 'ACCEPTED'});
        final page = r.url.queryParameters['page'];
        pages.add(page);
        return f.json({
          'data': [
            for (final name in page == '1' ? ['an', 'binh'] : ['chi'])
              {
                'id': 'request-$name',
                'peer': f.peer(name, status: 'INCOMING_PENDING'),
              },
          ],
          'hasMore': true,
        });
      });
      await tester.pumpWidget(
        MaterialApp(home: FriendsScreen(api: api, initialTab: 1)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chấp nhận').first);
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsNothing);
      expect(find.text('@binh'), findsOneWidget);
      expect(find.text('@chi'), findsOneWidget);
      expect(pages, ['1', '2']);
      await tester.ensureVisible(find.text('Xem thêm'));
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(pages, ['1', '2', '3']);
      expect(find.text('@chi'), findsOneWidget);
    },
  );

  testWidgets(
    'embedded filters hide search, blocked chip and privacy button while standalone initialTab 4 remains supported',
    (tester) async {
      final api = f.apiFor((_) async => f.json({'data': [], 'hasMore': false}));
      await tester.pumpWidget(
        MaterialApp(home: FriendsScreen(api: api, embedded: true)),
      );
      expect(find.widgetWithText(ChoiceChip, 'Tìm bạn'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Đã chặn'), findsNothing);
      expect(find.byKey(const Key('friends_privacy_button')), findsNothing);
      await tester.pumpWidget(
        MaterialApp(
          home: FriendsScreen(
            key: const ValueKey('blocked'),
            api: api,
            initialTab: 4,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Đã chặn'))
            .selected,
        isTrue,
      );
    },
  );

  testWidgets(
    'mutual friend return without changes retains loaded pages and cursor',
    (tester) async {
      var lists = 0;
      final api = f.apiFor((r) async {
        if (r.url.path.endsWith('/mutual-friends')) {
          lists++;
          return f.json({
            'state': 'available',
            'data': lists == 1
                ? [f.peer('an')]
                : [f.peer('an'), f.peer('binh'), f.peer('binh')],
            'hasMore': true,
            'nextCursor': 'cursor:$lists',
          });
        }
        return f.json(f.peer('an'));
      });
      await tester.pumpWidget(
        MaterialApp(
          home: MutualFriendsScreen(api: api, targetId: 'target'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsOneWidget);
      expect(find.text('@binh'), findsOneWidget);
      await tester.tap(find.text('@an'));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(lists, 2);
      expect(find.text('@binh'), findsOneWidget);
    },
  );

  testWidgets(
    'inbox displays local time/payload actor without enrichment and retains pages after a tap',
    (tester) async {
      final cursors = <String?>[];
      var reads = 0, profileEnrichment = 0;
      Map<String, dynamic> item(String id) => {
        ...n.item(id),
        'actor': {'id': 'peer', 'displayName': '  ', 'username': 'alice'},
        'createdAt': '2026-11-11T01:02:00Z',
      };
      final api = NotificationApi(
        f.apiFor((r) async {
          if (r.url.path.startsWith('/users/profiles')) profileEnrichment++;
          if (r.url.path.startsWith('/users/')) {
            return f.json({'status': 'CANCELLED'});
          }
          if (r.url.path.endsWith('/read')) {
            reads++;
            return f.json({'isRead': true});
          }
          if (r.method == 'PATCH') return f.json({});
          final cursor = r.url.queryParameters['cursor'];
          cursors.add(cursor);
          return f.json({
            'items': cursor == null
                ? [item('one'), item('one')]
                : [item('one'), item('two'), item('two')],
            'pageInfo': {
              'hasMore': true,
              'nextCursor': cursor == null ? 'next:1' : 'next:2',
            },
          });
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationsScreen(api: api, onChanged: () {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('@alice đã gửi lời mời kết bạn.'), findsOneWidget);
      expect(
        find.text(localNotificationTime('2026-11-11T01:02:00Z')),
        findsOneWidget,
      );
      expect(profileEnrichment, 0);
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.byType(ListTile), findsNWidgets(2));
      await tester.tap(find.text('@alice đã gửi lời mời kết bạn.').first);
      await tester.pumpAndSettle();
      expect(reads, 1);
      expect(profileEnrichment, 0);
      expect(cursors, [null, 'next:1']);
      expect(find.byType(ListTile), findsNWidgets(2));
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(cursors, [null, 'next:1', 'next:2']);
    },
  );

  testWidgets(
    'mutual pagination clears earlier identities when the server hides the section',
    (tester) async {
      var reads = 0;
      final api = f.apiFor((_) async {
        reads++;
        return f.json(
          reads == 1
              ? {
                  'state': 'available',
                  'data': [f.peer('an')],
                  'hasMore': true,
                  'nextCursor': 'next',
                }
              : {'state': 'hidden', 'data': [], 'hasMore': false},
        );
      });
      await tester.pumpWidget(
        MaterialApp(
          home: MutualFriendsScreen(api: api, targetId: 'target'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsOneWidget);
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsNothing);
      expect(
        find.text('Mục bạn chung hiện không được hiển thị.'),
        findsOneWidget,
      );
      expect(find.text('Xem thêm'), findsNothing);
    },
  );

  for (final fail in [false, true]) {
    test(
      'push ${fail ? 'failed' : 'successful'} server registration is distinct from Firebase and permission',
      () async {
        final api = NotificationApi(
          f.apiFor((_) async => f.json({}, fail ? 503 : 200)),
        );
        final push = PushNotifications(api, (_) {}, () {})
          ..installation = 'test';
        expect(push.diagnostics.value.permission, isNull);
        expect(
          push.diagnostics.value.registration,
          DeviceRegistrationState.unknown,
        );
        final firebaseBefore = push.diagnostics.value.firebaseInitialized;
        await push.register('device-token');
        expect(push.diagnostics.value.firebaseInitialized, firebaseBefore);
        expect(push.diagnostics.value.permission, isNull);
        expect(
          push.diagnostics.value.registration,
          fail
              ? DeviceRegistrationState.failed
              : DeviceRegistrationState.registered,
        );
        push.dispose();
        push.dispose(); // Cleanup is idempotent on all exit paths.
      },
    );
  }
}
