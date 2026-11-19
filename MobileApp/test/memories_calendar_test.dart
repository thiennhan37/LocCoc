import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'package:mobile_app/features/home/application/memories_controller.dart';
import 'package:mobile_app/features/home/presentation/widgets/memories_calendar.dart';

FeedPost post(String id, String owner, DateTime at) => FeedPost(
  id: id,
  ownerId: owner,
  mediaKey: '/$id',
  authorName: owner,
  caption: id,
  createdAt: at,
  mine: owner == 'me',
  seen: false,
  mediaType: 0,
);

class MemoryApi implements FeedApi {
  final calls = <String?>[];
  bool fail = false;
  @override
  Future<FeedPage> page({String? cursor}) async {
    calls.add(cursor);
    if (fail) throw Exception('offline');
    return cursor == null
        ? FeedPage([
            post('old', 'me', DateTime(2026, 11, 17, 9)),
            post('friend', 'friend', DateTime(2026, 11, 18)),
          ], 'next')
        : FeedPage([
            post('new', 'me', DateTime(2026, 11, 17, 20)),
            post('oct', 'me', DateTime(2026, 10, 2)),
          ], null);
  }

  @override
  Uri imageUri(String key) => Uri.parse('https://example.com$key');
  @override
  Future<void> seen(String id) async {}
}

class DeferredMemoryApi extends MemoryApi {
  final requests = <Completer<FeedPage>>[];
  @override
  Future<FeedPage> page({String? cursor}) {
    final request = Completer<FeedPage>();
    requests.add(request);
    return request.future;
  }
}

void main() {
  test('late refresh and disposed responses cannot update history', () async {
    final api = DeferredMemoryApi();
    final controller = MemoriesController(api, 'me');
    final first = controller.refresh();
    final second = controller.refresh();
    final timestamp = DateTime.parse('2026-11-17T23:30:00Z');
    api.requests[1].complete(
      FeedPage([post('current', 'me', timestamp)], null),
    );
    await second;
    api.requests[0].complete(
      FeedPage([post('stale', 'me', DateTime(2020))], null),
    );
    await first;
    final local = timestamp.toLocal();
    expect(
      controller.days.keys.single,
      DateTime(local.year, local.month, local.day),
    );
    expect(controller.days.values.single.single.id, 'current');
    final pending = controller.refresh();
    controller.dispose();
    api.requests[2].complete(const FeedPage([], null));
    await pending;
    expect(controller.days.values.single.single.id, 'current');
  });

  testWidgets(
    'empty leap-month calendar fits compact screens with large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = MemoriesController(MemoryApi(), 'me');
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: MemoriesCalendar(
                controller: controller,
                now: DateTime(2024, 2, 29),
              ),
            ),
          ),
        ),
      );
      expect(find.text('Tháng 2 2024'), findsOneWidget);
      expect(find.byTooltip('29/2/2024'), findsOneWidget);
      expect(find.byTooltip('30/2/2024'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'loads every page, excludes friends and sorts each local day newest first',
    () async {
      final api = MemoryApi();
      final controller = MemoriesController(api, 'me');
      addTearDown(controller.dispose);
      await controller.refresh();
      expect(api.calls, [null, 'next']);
      expect(controller.days.length, 2);
      expect(controller.days[DateTime(2026, 11, 17)]!.map((p) => p.id), [
        'new',
        'old',
      ]);
      expect(controller.days.containsKey(DateTime(2026, 11, 18)), false);
      expect(controller.loading, false);
      api.fail = true;
      await controller.refresh();
      expect(controller.error, isNotNull);
      api.fail = false;
      await controller.refresh();
      expect(controller.error, isNull);
      expect(controller.days[DateTime(2026, 11, 17)]!.length, 2);
    },
  );

  testWidgets(
    'calendar shows months, latest thumbnail and all posts on day tap',
    (tester) async {
      final controller = MemoriesController(MemoryApi(), 'me');
      addTearDown(controller.dispose);
      await controller.refresh();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MemoriesCalendar(
              controller: controller,
              now: DateTime(2026, 11, 17),
              imageBuilder: (post) => Text('image-${post.id}'),
            ),
          ),
        ),
      );
      expect(find.text('Tháng 11 2026'), findsOneWidget);
      expect(find.text('image-new'), findsOneWidget);
      expect(find.text('image-old'), findsNothing);
      expect(find.text('image-friend'), findsNothing);
      await tester.tap(find.text('image-new'));
      await tester.pumpAndSettle();
      expect(find.text('17/11/2026 · 2 bài đăng'), findsOneWidget);
      expect(find.text('new'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
