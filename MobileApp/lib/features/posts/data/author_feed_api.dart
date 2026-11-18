import 'feed_api.dart';

/// Fetch one authorized server page for the selected author.
class AuthorFeedApi implements FeedApi {
  AuthorFeedApi(this.source, this.selectedOwner);
  final SessionFeedApi source;
  final String? Function() selectedOwner;
  @override
  Future<FeedPage> page({String? cursor}) =>
      source.page(cursor: cursor, ownerId: selectedOwner());

  @override
  Uri imageUri(String key) => source.imageUri(key);
  @override
  Future<void> seen(String id) => source.seen(id);
}
