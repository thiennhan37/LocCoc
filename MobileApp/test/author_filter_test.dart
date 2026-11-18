import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/author_feed_api.dart';
import 'package:mobile_app/features/home/presentation/widgets/author_picker.dart';
import 'package:mobile_app/core/widgets/user_avatar.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'package:mobile_app/features/posts/application/feed_controller.dart';
import 'package:mobile_app/features/posts/presentation/feed_sliver.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  testWidgets(
    'author posts load the next page only after swiping near the end',
    (tester) async {
      final cursors = <String?>[];
      final api = AuthorFeedApi(
        SessionFeedApi(
          fixtures.apiFor((r) async {
            expect(r.url.queryParameters['ownerId'], 'friend');
            expect(r.url.queryParameters['limit'], '10');
            final cursor = r.url.queryParameters['cursor'];
            cursors.add(cursor);
            return fixtures.json({
              'data': List.generate(
                cursor == null ? 10 : 1,
                (i) => {
                  'id': cursor == null ? 'post-$i' : 'last',
                  'ownerId': 'friend',
                  'mediaKey': 'legacy',
                  'authorName': 'Friend',
                  'caption': null,
                  'createdAt': '2026-11-18T00:00:00Z',
                  'mine': false,
                  'seen': false,
                  'mediaType': 1,
                },
              ),
              'nextCursor': cursor == null ? 'next' : null,
            });
          }),
        ),
        () => 'friend',
      );
      final controller = FeedController(api);
      addTearDown(controller.dispose);
      await controller.refresh();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: FeedPages(controller: controller, active: true)),
        ),
      );
      await tester.pumpAndSettle();
      expect(controller.items.length, 10);
      expect(cursors, [null]);
      for (var i = 0; i < 8; i++) {
        await tester.drag(find.byType(PageView), const Offset(0, -500));
        await tester.pumpAndSettle();
      }
      expect(cursors, [null, 'next']);
      expect(controller.items.length, 11);
      expect(controller.hasMore, isFalse);
      await controller.loadMore();
      expect(cursors, [null, 'next']);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'owner filter requests one bounded server page and resets owner selection',
    () async {
      final queries = <Map<String, String>>[];
      final source = SessionFeedApi(
        fixtures.apiFor((r) async {
          queries.add(r.url.queryParameters);
          return fixtures.json({
            'data': [],
            'nextCursor': queries.length == 1 ? 'next' : null,
          });
        }),
      );
      String? owner = 'friend';
      final api = AuthorFeedApi(source, () => owner);
      final first = await api.page();
      expect(queries, [
        {'limit': '10', 'ownerId': 'friend'},
      ]);
      await api.page(cursor: first.nextCursor);
      expect(queries.last, {
        'limit': '10',
        'ownerId': 'friend',
        'cursor': 'next',
      });
      owner = 'other';
      await api.page();
      expect(queries.last, {'limit': '10', 'ownerId': 'other'});
      owner = null;
      await api.page();
      expect(queries.last, {'limit': '20'});
    },
  );

  testWidgets(
    'picker uses real friend names and avatars, supports more and self',
    (tester) async {
      final api = fixtures.apiFor(
        (r) async => fixtures.json({
          'data': [
            {
              'id': 'friend-${r.url.queryParameters['page']}',
              'displayName': 'Tên ${r.url.queryParameters['page']}',
              'avatarUrl': null,
            },
          ],
          'hasMore': r.url.queryParameters['page'] == '1',
        }),
      );
      AuthorChoice? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () async {
                  selected = await showAuthorPicker(
                    context,
                    api: api,
                    selfName: 'Bạn',
                    selfAvatar: null,
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('Tên 1'), findsOneWidget);
      expect(find.byType(UserAvatar), findsNWidgets(2));
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(find.text('Tên 2'), findsOneWidget);
      await tester.tap(find.text('Tên 2'));
      await tester.pumpAndSettle();
      expect(selected?.id, 'friend-2');
    },
  );
}
