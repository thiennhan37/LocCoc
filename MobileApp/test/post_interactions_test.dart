import 'package:mobile_app/features/posts/application/feed_controller.dart';
import 'package:mobile_app/features/posts/presentation/feed_sliver.dart';
import 'feed_pager_test.dart' show FakeFeed;
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/post_reaction_api.dart';
import 'package:mobile_app/features/posts/presentation/post_actions.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'user_social_test.dart' as fixtures;

final post = FeedPost(
  id: 'post',
  ownerId: 'author',
  mediaKey: 'legacy',
  authorName: 'Author',
  caption: null,
  createdAt: DateTime(2026),
  mine: false,
  seen: false,
  mediaType: 1,
);

class FakeReactions implements PostReactionsRepository {
  ReactionSummary state = const ReactionSummary({'💛': 2}, null);
  bool fail = false;
  int writes = 0;
  Completer<void>? barrier;
  @override
  Future<ReactionSummary> load(String id) async => state;
  @override
  Future<ReactionSummary> set(String id, String? emoji) async {
    writes++;
    await barrier?.future;
    if (fail) throw Exception('offline');
    return state = ReactionSummary({'💛': emoji == '💛' ? 3 : 2}, emoji);
  }
}

void main() {
  testWidgets(
    'own post shows counts but cannot submit reactions or message self',
    (tester) async {
      final api = FakeReactions();
      final ownPost = FeedPost(
        id: post.id,
        ownerId: post.ownerId,
        mediaKey: post.mediaKey,
        authorName: post.authorName,
        caption: post.caption,
        createdAt: post.createdAt,
        mine: true,
        seen: false,
        mediaType: post.mediaType,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: Center(
              child: PostActions(
                post: ownPost,
                reactions: api,
                active: true,
                onMessage: (_) async {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Cảm xúc'), findsOneWidget);
      expect(find.byKey(const ValueKey('message-author')), findsNothing);
      for (final emoji in postReactionEmoji.take(3)) {
        expect(
          tester
              .widget<IconButton>(find.byKey(ValueKey('reaction-$emoji')))
              .onPressed,
          isNull,
        );
      }
      expect(
        tester
            .widget<IconButton>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is IconButton && widget.tooltip == 'Thêm cảm xúc',
              ),
            )
            .onPressed,
        isNull,
      );
      expect(api.writes, 0);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'small large-text post keeps centered photo and reaction controls visible',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final feed = FeedController(FakeFeed());
      addTearDown(feed.dispose);
      await feed.refresh();
      final reactions = FakeReactions();
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: FeedPages(
                controller: feed,
                active: true,
                reactions: reactions,
                onMessage: (_) async {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('message-author')).hitTestable(),
        findsOneWidget,
      );
      final photo = tester.getRect(
        find.byKey(const ValueKey('post-photo-post-0')),
      );
      expect(photo.center.dx, closeTo(160, 1));
      expect(photo.width, greaterThan(100));
      await tester.tap(find.byTooltip('Thêm cảm xúc'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('😂 0'));
      await tester.pumpAndSettle();
      expect(reactions.state.myReaction, '😂');
      expect(find.text('😂'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  test('reaction API uses JWT and idempotent PUT/DELETE', () async {
    final methods = <String>[];
    final api = PostReactionApi(
      fixtures.apiFor((request) async {
        expect(request.headers['Authorization'], 'Bearer old-access');
        methods.add(request.method);
        expect(
          request.url.path,
          request.method == 'GET'
              ? '/posts/post/reactions'
              : '/posts/post/reaction',
        );
        if (request.method == 'PUT') {
          expect(jsonDecode(request.body), {'emoji': '💛'});
        }
        return fixtures.json({
          'counts': {'💛': 1},
          'myReaction': request.method == 'DELETE' ? null : '💛',
        });
      }),
    );
    await api.load('post');
    await api.set('post', '💛');
    await api.set('post', null);
    expect(methods, ['GET', 'PUT', 'DELETE']);
  });
  testWidgets(
    'reactions persist confirmed selection, block duplicate taps and preserve state on failure',
    (tester) async {
      final api = FakeReactions();
      var chats = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: Center(
              child: PostActions(
                post: post,
                reactions: api,
                active: true,
                onMessage: (_) async {
                  chats++;
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      api.barrier = Completer<void>();
      await tester.tap(find.byKey(const ValueKey('reaction-💛')));
      await tester.tap(find.byKey(const ValueKey('reaction-💛')));
      await tester.pump();
      expect(api.writes, 1);
      api.barrier!.complete();
      await tester.pumpAndSettle();
      expect(api.state.myReaction, '💛');
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.selected == true,
        ),
        findsOneWidget,
      );
      api.fail = true;
      await tester.tap(find.byKey(const ValueKey('reaction-💛')));
      await tester.pumpAndSettle();
      expect(api.state.myReaction, '💛');
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.selected == true,
        ),
        findsOneWidget,
      );
      api.fail = false;
      await tester.tap(find.byKey(const ValueKey('reaction-💛')));
      await tester.pumpAndSettle();
      expect(api.state.myReaction, isNull);
      await tester.tap(find.byKey(const ValueKey('message-author')));
      await tester.pumpAndSettle();
      expect(chats, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
