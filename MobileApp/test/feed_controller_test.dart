import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'package:mobile_app/features/posts/application/feed_controller.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';

FeedPost post(String id) => FeedPost.fromJson({
  'id': id,
  'ownerId': 'owner',
  'mediaKey': '/posts/media/$id',
  'mediaType': 0,
  'caption': 'hello',
  'createdAt': '2026-11-13T00:00:00Z',
  'authorName': 'Alice',
  'mine': true,
  'seen': false,
});

class FakeFeedApi implements FeedApi {
  final pending = <Completer<FeedPage>>[];
  final cursors = <String?>[];
  final seenIds = <String>[];
  bool failSeen = false;
  @override
  Future<FeedPage> page({String? cursor}) {
    cursors.add(cursor);
    final c = Completer<FeedPage>();
    pending.add(c);
    return c.future;
  }

  @override
  Future<void> seen(String id) async {
    seenIds.add(id);
    if (failSeen) throw Exception('offline');
  }

  @override
  Uri imageUri(String key) => Uri.parse('http://localhost:8080$key');
}

class CachedFeedApi extends FakeFeedApi implements FeedImageCache {
  int clears = 0;
  @override
  void clearImages() => clears++;
}

class PrefetchFeedApi extends FakeFeedApi implements ProtectedFeedImages {
  final images = <String>[];
  final downloads = <Completer<Uint8List>>[];
  @override
  Future<Uint8List> image(String key) {
    images.add(key);
    final pending = Completer<Uint8List>();
    downloads.add(pending);
    return pending.future;
  }
}

void main() {
  test(
    'warms three photos before display and coalesces rapid swipes into the latest window',
    () async {
      final api = PrefetchFeedApi();
      final feed = FeedController(api);
      final refresh = feed.refresh();
      api.pending.last.complete(
        FeedPage(List.generate(8, (i) => post('$i')), null),
      );
      await refresh; // Metadata is ready even with all image downloads outstanding.
      expect(feed.loading, isFalse);
      expect(api.images, [
        '/posts/media/0',
        '/posts/media/1',
        '/posts/media/2',
      ]);
      expect(api.seenIds, isEmpty);
      feed.prepareImages(1);
      feed.prepareImages(4);
      expect(api.images.length, 3); // At most one background batch.
      api.downloads[0].completeError(Exception('offline'));
      api.downloads[1].complete(Uint8List(0));
      api.downloads[2].complete(Uint8List(0));
      await Future<void>.delayed(Duration.zero);
      expect(api.images.skip(3), [
        '/posts/media/4',
        '/posts/media/5',
        '/posts/media/6',
      ]);
      expect(feed.error, isNull);
      feed.prepareImages(7);
      feed.dispose();
      for (final pending in api.downloads.skip(3)) {
        pending.complete(Uint8List(0));
      }
      await Future<void>.delayed(Duration.zero);
      expect(api.images.length, 6);
      expect(api.seenIds, isEmpty);
    },
  );
  test(
    'refresh warms only the replacement feed after an in-flight batch completes',
    () async {
      final api = PrefetchFeedApi();
      final feed = FeedController(api);
      final initial = feed.refresh();
      api.pending.last.complete(FeedPage([post('old')], null));
      await initial;
      final refresh = feed.refresh();
      api.pending.last.complete(FeedPage([post('fresh')], null));
      await refresh;
      api.downloads.first.complete(Uint8List(0));
      await Future<void>.delayed(Duration.zero);
      expect(api.images, ['/posts/media/old', '/posts/media/fresh']);
      api.downloads.last.complete(Uint8List(0));
      await Future<void>.delayed(Duration.zero);
      feed.dispose();
    },
  );
  test('refresh and disposal discard cached protected images', () async {
    final api = CachedFeedApi();
    final feed = FeedController(api);
    final initial = feed.refresh();
    expect(api.clears, 1);
    api.pending.last.complete(FeedPage([post('a')], null));
    await initial;
    final refresh = feed.refresh();
    expect(api.clears, 2);
    api.pending.last.complete(const FeedPage([], null));
    await refresh;
    feed.dispose();
    expect(api.clears, 3);
  });
  test(
    'expired pagination starts a fresh traversal instead of retrying old cursor',
    () async {
      final api = FakeFeedApi();
      final feed = FeedController(api);
      final initial = feed.refresh();
      api.pending.last.complete(FeedPage([post('a')], 'expired'));
      await initial;
      final more = feed.loadMore();
      api.pending.last.completeError(const AuthApiException(400, code: '1006'));
      await Future<void>.delayed(Duration.zero);
      expect(api.cursors.last, isNull);
      api.pending.last.complete(FeedPage([post('fresh')], null));
      await more;
      expect(feed.items.single.id, 'fresh');
      expect(feed.error, isNull);
      feed.dispose();
    },
  );
  test(
    'refresh discards old pages and view writes never reorder items',
    () async {
      final api = FakeFeedApi();
      final feed = FeedController(api);
      final a = feed.refresh();
      final b = feed.refresh();
      api.pending[1].complete(FeedPage([post('new'), post('friend')], 'next'));
      await b;
      api.pending[0].complete(FeedPage([post('old')], null));
      await a;
      expect(feed.items.map((p) => p.id), ['new', 'friend']);
      expect(await feed.markSeen('new'), isTrue);
      expect(feed.items.map((p) => p.id), ['new', 'friend']);
      expect(await feed.markSeen('new'), isTrue);
      expect(api.seenIds, ['new']);
      final more = feed.loadMore();
      api.pending.last.complete(FeedPage([post('friend'), post('last')], null));
      await more;
      expect(api.cursors.last, 'next');
      expect(feed.items.map((p) => p.id), ['new', 'friend', 'last']);
      feed.dispose();
    },
  );
  test('failed seen stays retryable; failed pagination keeps data', () async {
    final api = FakeFeedApi();
    final feed = FeedController(api);
    final first = feed.refresh();
    api.pending.last.complete(FeedPage([post('a')], 'cursor'));
    await first;
    api.failSeen = true;
    expect(await feed.markSeen('a'), isFalse);
    api.failSeen = false;
    expect(await feed.markSeen('a'), isTrue);
    final more = feed.loadMore();
    api.pending.last.completeError(Exception('offline'));
    await more;
    expect(feed.items.single.id, 'a');
    expect(feed.error, isNotNull);
    expect(feed.hasMore, isTrue);
    feed.dispose();
  });
}
