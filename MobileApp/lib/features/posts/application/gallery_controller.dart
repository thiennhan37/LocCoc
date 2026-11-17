import 'package:flutter/foundation.dart';
import '../data/feed_api.dart';

enum GalleryFilter { all, friends, mine }

/// A chronological snapshot independent of the prioritized home feed.
class GalleryController extends ChangeNotifier {
  GalleryController(this.api, this.ownerId);
  final FeedApi api;
  final String ownerId;
  List<FeedPost> _posts = [];
  GalleryFilter _filter = GalleryFilter.all;
  GalleryFilter get filter => _filter;
  set filter(GalleryFilter value) {
    if (_disposed || _filter == value) return;
    _filter = value;
    notifyListeners();
  }

  List<FeedPost> get items => List.unmodifiable(
    _posts.where(
      (post) => switch (_filter) {
        GalleryFilter.all => true,
        GalleryFilter.friends => post.ownerId != ownerId,
        GalleryFilter.mine => post.ownerId == ownerId,
      },
    ),
  );
  bool loading = false;
  String? error;
  bool _disposed = false;
  int _generation = 0;

  Future<void> refresh() async {
    if (_disposed) return;
    final generation = ++_generation;
    loading = true;
    error = null;
    notifyListeners();
    final posts = <String, FeedPost>{};
    final cursors = <String>{};
    String? cursor;
    try {
      do {
        final page = await api.page(cursor: cursor);
        if (_disposed || generation != _generation) return;
        for (final post in page.data) {
          if (post.mediaType == 0) posts[post.id] = post;
        }
        cursor = page.nextCursor;
        if (cursor != null && !cursors.add(cursor)) {
          throw const FormatException('Repeated feed cursor');
        }
      } while (cursor != null);
      final sorted = posts.values.toList()
        ..sort((a, b) {
          final order = b.createdAt.compareTo(a.createdAt);
          return order == 0 ? b.id.compareTo(a.id) : order;
        });
      _posts = sorted;
    } catch (_) {
      if (!_disposed && generation == _generation) {
        error = 'Không tải được thư viện ảnh. Hãy thử lại.';
      }
    } finally {
      if (!_disposed && generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}
