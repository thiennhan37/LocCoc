import 'package:flutter/foundation.dart';
import '../data/feed_api.dart';
import '../../auth/data/services/auth_api_client.dart';

class FeedController extends ChangeNotifier {
  FeedController(this.api);
  final FeedApi api;
  List<FeedPost> _items = [];
  List<FeedPost> get items => List.unmodifiable(_items);
  bool loading = false;
  bool _disposed = false;
  String? error;
  String? _cursor;
  bool get hasMore => _cursor != null;
  int _generation = 0;
  final _seen = <String>{};
  final _pendingSeen = <String, Future<bool>>{};
  bool isSeen(FeedPost post) => post.seen || _seen.contains(post.id);
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> refresh() async {
    if (_disposed) return;
    final version = ++_generation;
    _items = [];
    _cursor = null;
    _seen.clear();
    error = null;
    loading = true;
    _notify();
    await _load(version, null);
  }

  Future<void> loadMore() async {
    if (_disposed || loading || !hasMore) return;
    loading = true;
    error = null;
    _notify();
    await _load(_generation, _cursor);
  }

  Future<void> _load(int version, String? cursor) async {
    try {
      final page = await api.page(cursor: cursor);
      if (_disposed || version != _generation) return;
      final ids = _items.map((p) => p.id).toSet();
      _items = [..._items, ...page.data.where((p) => ids.add(p.id))];
      _cursor = page.nextCursor;
    } catch (failure) {
      if (!_disposed &&
          version == _generation &&
          cursor != null &&
          failure is AuthApiException &&
          failure.statusCode == 400) {
        await refresh();
        return;
      }
      if (!_disposed && version == _generation) {
        error = 'Không tải được bài đăng. Hãy thử lại.';
      }
    } finally {
      if (!_disposed && version == _generation) {
        loading = false;
        _notify();
      }
    }
  }

  Future<bool> markSeen(String id) {
    if (_disposed) return Future.value(false);
    if (_seen.contains(id) || _items.any((p) => p.id == id && p.seen)) {
      return Future.value(true);
    }
    return _pendingSeen.putIfAbsent(id, () => _writeSeen(id));
  }

  Future<bool> _writeSeen(String id) async {
    try {
      await api.seen(id);
      if (!_disposed) {
        _seen.add(id);
        _notify();
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      _pendingSeen.remove(id);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}
