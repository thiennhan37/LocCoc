import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/application/gallery_controller.dart';
import 'package:mobile_app/features/posts/presentation/photo_gallery_screen.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'memories_calendar_test.dart' show MemoryApi, DeferredMemoryApi, post;

class GalleryApi extends MemoryApi {
  @override
  Future<FeedPage> page({String? cursor}) async {
    calls.add(cursor);
    if (this.fail) throw Exception('offline');
    return cursor == null
        ? FeedPage([post('own', 'me', DateTime(2026, 10))], 'next')
        : FeedPage([
            post('friend', 'friend', DateTime(2026, 11)),
            FeedPost(
              id: 'video',
              ownerId: 'me',
              mediaKey: '/video',
              authorName: 'Me',
              caption: null,
              createdAt: DateTime(2026, 12),
              mine: true,
              seen: false,
              mediaType: 1,
            ),
          ], null);
  }
}

void main() {
  test('ignores superseded refresh and response after disposal', () async {
    final api = DeferredMemoryApi();
    final controller = GalleryController(api, 'me');
    final old = controller.refresh();
    final current = controller.refresh();
    api.requests[1].complete(
      FeedPage([post('latest', 'me', DateTime(2026))], null),
    );
    await current;
    api.requests[0].complete(const FeedPage([], null));
    await old;
    expect(controller.items.single.id, 'latest');
    final pending = controller.refresh();
    controller.dispose();
    api.requests[2].complete(const FeedPage([], null));
    await pending;
    expect(controller.items.single.id, 'latest');
  });

  test('sorts all pages chronologically and filters ownership', () async {
    final api = GalleryApi();
    final controller = GalleryController(api, 'me');
    addTearDown(controller.dispose);
    await controller.refresh();
    expect(api.calls, [null, 'next']);
    expect(controller.items.map((p) => p.id), ['friend', 'own']);
    controller.filter = GalleryFilter.mine;
    expect(controller.items.single.id, 'own');
    controller.filter = GalleryFilter.friends;
    expect(controller.items.single.id, 'friend');
    api.fail = true;
    await controller.refresh();
    expect(controller.error, isNotNull);
    expect(controller.items.single.id, 'friend');
    expect(controller.loading, false);
  });

  testWidgets('grid has three columns, filters and opens selected image', (
    tester,
  ) async {
    final controller = GalleryController(GalleryApi(), 'me');
    addTearDown(controller.dispose);
    await controller.refresh();
    await tester.pumpWidget(
      MaterialApp(
        home: PhotoGalleryScreen(
          controller: controller,
          imageBuilder: (post) => Text('photo-${post.id}'),
        ),
      ),
    );
    final grid = tester.widget<GridView>(find.byType(GridView));
    expect(
      (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
          .crossAxisCount,
      3,
    );
    expect(find.text('photo-friend'), findsOneWidget);
    await tester.tap(find.byType(DropdownButton<GalleryFilter>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Của tôi').last);
    await tester.pumpAndSettle();
    expect(find.text('photo-friend'), findsNothing);
    expect(find.text('photo-own'), findsOneWidget);
    await tester.tap(find.text('photo-own'));
    await tester.pumpAndSettle();
    expect(find.text('own'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
