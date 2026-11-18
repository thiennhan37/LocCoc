import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/application/feed_controller.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'package:mobile_app/features/posts/presentation/feed_sliver.dart';
import 'user_social_test.dart' as fixtures;

class FakeFeed implements FeedApi {
  int loads = 0;
  @override
  Future<FeedPage> page({String? cursor}) async {
    loads++;
    return FeedPage(
      List.generate(
        2,
        (i) => FeedPost(
          id: 'post-$i',
          ownerId: 'owner',
          mediaKey: 'legacy',
          authorName: 'Author $i',
          caption: 'duplicate $i',
          createdAt: DateTime(2026),
          mine: false,
          seen: false,
          mediaType: 1,
        ),
      ),
      null,
    );
  }

  @override
  Future<void> seen(String id) async {}
  @override
  Uri imageUri(String key) => throw const FormatException();
}

void main() {
  testWidgets('pager warms images before swiping and paginates four posts early', (
    tester,
  ) async {
    var pages = 0;
    final images = <String>[];
    final queries = <Map<String, String>>[];
    final account = fixtures.apiFor((request) async {
      if (request.url.path == '/posts/feed') {
        pages++;
        final start = pages == 1 ? 0 : 6;
        return fixtures.json({
          'data': List.generate(pages == 1 ? 6 : 2, (i) {
            final id =
                '11111111-1111-4111-8111-${(start + i).toString().padLeft(12, '0')}';
            return {
              'id': id,
              'ownerId': 'friend',
              'mediaKey': '/posts/media/$id',
              'mediaType': 0,
              'authorName': 'Friend ${start + i}',
              'caption': '',
              'createdAt': '2026-11-18T00:00:00Z',
              'mine': false,
              'seen': false,
            };
          }),
          'nextCursor': pages == 1 ? 'next' : null,
        });
      }
      images.add(request.url.path);
      queries.add(request.url.queryParameters);
      return http.Response.bytes(
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAxSURBVFhH7c4hAQAACMAwItKI6OAJAGbi5mrRlf1Z7HEdAAAAAAAAAAAAAAAAAADAAPlINKZoOLjRAAAAAElFTkSuQmCC',
        ),
        200,
        headers: {'content-type': 'image/png'},
      );
    });
    final controller = FeedController(SessionFeedApi(account));
    addTearDown(controller.dispose);
    await controller.refresh();
    Future<void> settleImages() async {
      await tester.pump();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pumpAndSettle();
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: FeedPages(controller: controller, active: false)),
      ),
    );
    await settleImages();
    expect(images.length, 3, reason: images.toString());
    expect(queries, everyElement({'preview': 'true'}));
    expect(find.text('Friend 0').hitTestable(), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(0, -600));
    await settleImages();
    expect(images.length, 4);
    expect(pages, 1);
    await tester.drag(find.byType(PageView), const Offset(0, -600));
    await settleImages();
    expect(pages, 2);
    expect(images.length, 5);
    expect(find.text('Friend 2').hitTestable(), findsOneWidget);
    await tester.drag(find.byType(PageView), const Offset(0, 600));
    await settleImages();
    expect(images.length, 5); // Returning to a warm image makes no new request.
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'feed shows one post per vertical swipe without duplicate caption',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = FeedController(FakeFeed());
      addTearDown(controller.dispose);
      await controller.refresh();
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: CustomScrollView(
              slivers: [FeedSliver(controller: controller, active: true)],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('duplicate 0'), findsNothing);
      final placeholder = find.text('Ảnh này chưa có bản xem trước.').first;
      final tile = tester.widget<ColoredBox>(
        find.ancestor(of: placeholder, matching: find.byType(ColoredBox)).first,
      );
      expect(
        tile.color,
        Theme.of(
          tester.element(placeholder),
        ).colorScheme.surfaceContainerHighest,
      );

      expect(find.text('Author 0').hitTestable(), findsOneWidget);
      final image = find
          .ancestor(of: placeholder, matching: find.byType(ClipRRect))
          .first;
      final viewport = tester.getRect(find.byType(PageView));
      expect(
        (tester.getCenter(image).dx - viewport.center.dx).abs(),
        lessThan(1),
      );
      expect(tester.getCenter(image).dy, greaterThan(viewport.center.dy - 100));

      expect(find.text('Author 1').hitTestable(), findsNothing);
      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(find.text('Author 1').hitTestable(), findsOneWidget);
      expect(find.text('Author 0').hitTestable(), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
