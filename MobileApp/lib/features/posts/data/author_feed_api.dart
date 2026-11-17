import 'feed_api.dart';

/// Preserve server authorization while skipping pages without the chosen author.
class AuthorFeedApi implements FeedApi {
  AuthorFeedApi(this.source, this.selectedOwner);
  final FeedApi source;
  final String? Function() selectedOwner;
  @override
  Future<FeedPage> page({String? cursor}) async {
    final owner = selectedOwner();
    final visited = <String>{};
    var next = cursor;
    do {
      final result = await source.page(cursor: next);
      if (owner == null) return result;
      final posts = result.data.where((p) => p.ownerId == owner).toList();
      if (posts.isNotEmpty || result.nextCursor == null) {
        return FeedPage(posts, result.nextCursor);
      }
      next = result.nextCursor;
      if (!visited.add(next!)) throw const FormatException('Repeated cursor');
    } while (true);
  }

  @override
  Uri imageUri(String key) => source.imageUri(key);
  @override
  Future<void> seen(String id) => source.seen(id);
}
