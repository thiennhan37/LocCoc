import 'package:flutter/foundation.dart';
import '../data/chat_api.dart';
import '../domain/chat_models.dart';
import 'chat_controller.dart';

/// Paginates the real friend API and filters only profiles already downloaded.
class ChatFriendsController extends ChangeNotifier {
  final ChatRepository api;
  late final String _accountId = api.accountId;
  final _rows = <ChatPeer>[];
  int _page = 0, _generation = 0;
  bool _disposed = false;
  bool loading = false, hasMore = false;
  String? error;
  ChatFriendsController(this.api) {
    _accountId;
  }
  bool get _valid => !_disposed && api.accountId == _accountId;
  List<ChatPeer> matching(String query) {
    if (!_valid) return [];
    final normalized = query.trim().toLowerCase();
    return _rows
        .where(
          (row) =>
              row.username.toLowerCase().contains(normalized) ||
              row.displayName.toLowerCase().contains(normalized),
        )
        .toList();
  }

  Future<void> load({bool more = false}) async {
    if (!_valid || loading) return;
    final ticket = ++_generation;
    final page = more ? _page + 1 : 1;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final result = await api.friends(page);
      if (!_valid || ticket != _generation) return;
      if (!more) _rows.clear();
      for (final row in result.data) {
        if (!_rows.any((existing) => existing.id == row.id)) _rows.add(row);
      }
      _page = page;
      hasMore = result.hasMore;
    } catch (e) {
      if (_valid && ticket == _generation) error = chatError(e);
    } finally {
      if (_valid && ticket == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _generation++;
    _rows.clear();
    super.dispose();
  }
}
