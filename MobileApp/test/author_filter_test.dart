import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/author_feed_api.dart';
import 'package:mobile_app/features/home/presentation/widgets/author_picker.dart';
import 'package:mobile_app/core/widgets/user_avatar.dart';
import 'memories_calendar_test.dart' show MemoryApi;
import 'user_social_test.dart' as fixtures;

void main() {
  test(
    'owner filter skips empty pages without losing later own posts',
    () async {
      final source = MemoryApi();
      final api = AuthorFeedApi(source, () => 'me');
      final first = await api.page();
      expect(first.data.map((p) => p.id), ['old']);
      final last = await api.page(cursor: first.nextCursor);
      expect(last.data.map((p) => p.id), ['new', 'oct']);
      final absent = AuthorFeedApi(source, () => 'absent');
      expect((await absent.page()).data, isEmpty);
      expect(source.calls, [null, 'next', null, 'next']);
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
