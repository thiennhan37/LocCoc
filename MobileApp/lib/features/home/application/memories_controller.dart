import 'package:flutter/foundation.dart';
import '../../posts/data/feed_api.dart';

/// Personal history, independent of the home feed's pagination and seen order.
class MemoriesController extends ChangeNotifier {
  MemoriesController(this.api, this.ownerId);
  final FeedApi api;
  final String ownerId;
  Map<DateTime, List<FeedPost>> _days = {};
  Map<DateTime, List<FeedPost>> get days => Map.unmodifiable(_days);
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
          if (post.ownerId == ownerId) posts[post.id] = post;
        }
        cursor = page.nextCursor;
        if (cursor != null && !cursors.add(cursor)) {
          throw const FormatException('Repeated feed cursor');
        }
      } while (cursor != null);
      final grouped = <DateTime, List<FeedPost>>{};
      final sorted = posts.values.toList()
        ..sort((a, b) {
          final order = b.createdAt.compareTo(a.createdAt);
          return order == 0 ? b.id.compareTo(a.id) : order;
        });
      for (final post in sorted) {
        final local = post.createdAt.toLocal();
        final day = DateTime(local.year, local.month, local.day);
        (grouped[day] ??= []).add(post);
      }
      _days = grouped.map(
        (day, posts) => MapEntry(day, List.unmodifiable(posts)),
      );
    } catch (_) {
      if (!_disposed && generation == _generation) {
        error = 'Không tải được kỷ niệm. Hãy thử lại.';
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
