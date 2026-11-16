import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/application/feed_controller.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'package:mobile_app/features/posts/presentation/feed_sliver.dart';

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
