import 'dart:typed_data';
import 'feed_api.dart';

/// Fetch one authorized server page for the selected author.
class AuthorFeedApi implements FeedApi, ProtectedFeedImages, FeedImageCache {
  AuthorFeedApi(this.source, this.selectedOwner);
  final SessionFeedApi source;
  final String? Function() selectedOwner;
  @override
  Future<FeedPage> page({String? cursor}) =>
      source.page(cursor: cursor, ownerId: selectedOwner());

  @override
  Future<Uint8List> image(String key) => source.image(key);
  @override
  void clearImages() => source.clearImages();

  @override
  Uri imageUri(String key) => source.imageUri(key);
  @override
  Future<void> seen(String id) => source.seen(id);
}
