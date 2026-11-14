import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/notifications/data/notification_api.dart';
import 'package:mobile_app/features/notifications/presentation/notifications_screen.dart';
import 'user_social_test.dart' as fixtures;

Map<String, dynamic> item(String id) => {
  'id': id,
  'type': 'FRIEND_REQUEST_RECEIVED',
  'actor': {'id': 'peer', 'displayName': 'Minh', 'avatarUrl': null},
  'data': {'friendRequestId': 'request'},
  'isRead': false,
};
void main() {
  testWidgets(
    'acknowledges the exact first-page marker without reading individual items',
    (tester) async {
      final seen = <String>[];
      final calls = <String>[];
      final api = NotificationApi(
        fixtures.apiFor((r) async {
          calls.add('${r.method} ${r.url.path}');
          if (r.method == 'PATCH') {
            seen.add(jsonDecode(r.body)['seenCursor'] as String);
            return fixtures.json({'unseenCount': 1, 'unreadCount': 2});
          }
          return fixtures.json({
            'items': [item('one')],
            'seenCursor': 'server-boundary-100',
            'pageInfo': {'nextCursor': null, 'hasMore': false},
          });
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationsScreen(api: api, onChanged: () {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(seen, ['server-boundary-100']);
      expect(calls, ['GET /notifications', 'PATCH /notifications/seen']);
      expect(find.text('Minh đã gửi lời mời kết bạn.'), findsOneWidget);
    },
  );
  testWidgets(
    'loads older pages with cursor and does not acknowledge a new marker',
    (tester) async {
      final markers = <String>[];
      String? passed;
      final api = NotificationApi(
        fixtures.apiFor((r) async {
          if (r.method == 'PATCH') {
            markers.add(jsonDecode(r.body)['seenCursor'] as String);
            return fixtures.json({});
          }
          passed = r.url.queryParameters['cursor'];
          return fixtures.json({
            'items': [item(passed == null ? 'first' : 'older')],
            'seenCursor': passed == null ? 'boundary' : null,
            'pageInfo': {
              'nextCursor': passed == null ? 'next-page' : null,
              'hasMore': passed == null,
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
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(passed, 'next-page');
      expect(markers, ['boundary']);
      expect(find.byType(ListTile), findsNWidgets(2));
    },
  );
  testWidgets('a failed list load does not mark inbox seen', (tester) async {
    var mutations = 0;
    final api = NotificationApi(
      fixtures.apiFor((r) async {
        if (r.method != 'GET') mutations++;
        return fixtures.json({'message': 'Unavailable'}, 503);
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationsScreen(api: api, onChanged: () {}),
      ),
    );
    await tester.pumpAndSettle();
    expect(mutations, 0);
    expect(find.text('Thử lại'), findsOneWidget);
  });
  testWidgets(
    'tapping a cancelled request reads only that item and shows unavailable',
    (tester) async {
      final paths = <String>[];
      final api = NotificationApi(
        fixtures.apiFor((r) async {
          paths.add('${r.method} ${r.url.path}');
          if (r.url.path == '/notifications/one/read') {
            return fixtures.json({'isRead': true});
          }
          if (r.url.path.startsWith('/users/friend-requests/')) {
            return fixtures.json({'status': 'CANCELLED'});
          }
          return fixtures.json({});
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => openNotification(context, api, item('one')),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(paths, [
        'PATCH /notifications/one/read',
        'GET /users/friend-requests/request',
      ]);
      expect(
        find.textContaining('Nội dung này không còn khả dụng'),
        findsOneWidget,
      );
    },
  );
}
