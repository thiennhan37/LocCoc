import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../data/chat_api.dart';
import '../data/chat_socket_client.dart';
import '../domain/chat_models.dart';

String newChatMessageId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

String chatError(Object e) {
  if (e is ArgumentError) return 'Tin nhắn cần có từ 1 đến 2000 ký tự.';
  if (e is AuthApiException) {
    if (e.statusCode == 401) {
      return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
    }
    if (e.statusCode == 403) return 'Hiện không thể tiếp tục hội thoại này.';
    if (e.statusCode == 404) return 'Không tìm thấy hội thoại.';
    if (e.statusCode == 429) {
      return 'Bạn gửi quá nhanh. Hãy thử lại sau ít phút.';
    }
    if (e.statusCode == 409) {
      return 'Mã tin nhắn đã được dùng với nội dung khác.';
    }
  }
  return 'Chưa thể kết nối. Nội dung đã soạn vẫn được giữ lại.';
}

/// Owns all foreground chat state. A controller belongs to one signed-in account.
class ChatController extends ChangeNotifier {
  final ChatRepository api;
  final ChatRealtime socket;
  final String Function() idGenerator;
  late final String accountId = api.accountId;
  late final StreamSubscription<ChatEvent> _subscription;
  final _conversations = <String, ChatConversation>{};
  final _inboxIds = <String>{};
  final _messages = <String, List<ChatBubble>>{};
  final _drafts = <String, String>{};
  final _syncedThrough = <String, BigInt>{};
  final _timers = <String, Timer>{};
  final _attempts = <String, int>{};
  final _typingExpiry = <String, Timer>{};
  final _typing = <String>{};
  final _resyncing = <String, Future<void>>{};
  final _reading = <String>{};
  final _opening = <String>{};
  final _olderLoading = <String>{};
  final _older = <String, bool>{};
  final _rejectedTokens = <String>{};
  Timer? _inboxDebounce, _typingStop, _reconnectTimer, _typingThrottle;
  (String, bool)? _pendingTyping;
  bool _inboxRefreshPending = false;
  int _reconnectDelay = 1;
  bool _disposed = false,
      _started = false,
      _foreground = true,
      _refreshing = false;
  int _inboxGeneration = 0;
  String? _socketToken, _visible;
  String? error;
  bool connected = false, inboxLoading = false;
  String? nextCursor;
  ChatController({
    required this.api,
    required this.socket,
    String Function()? idGenerator,
  }) : idGenerator = idGenerator ?? newChatMessageId {
    // Capture identity before any asynchronous work can complete.
    accountId;
    _subscription = socket.events.listen(_event);
  }
  bool get _valid => !_disposed && api.accountId == accountId;
  bool get foreground => _foreground;
  bool get expired => _expired;
  bool _expired = false;
  List<ChatConversation> get conversations {
    if (!_valid) return [];
    return _inboxIds
        .map((id) => _conversations[id])
        .whereType<ChatConversation>()
        .toList()
      ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  }

  ChatConversation? conversation(String id) =>
      _valid ? _conversations[id] : null;
  List<ChatBubble> messages(String id) =>
      _valid ? List.unmodifiable(_messages[id] ?? []) : [];
  String draft(String id) => _valid ? _drafts[id] ?? '' : '';
  bool isTyping(String id) => _valid && _typing.contains(id);
  bool opening(String id) => _opening.contains(id);
  bool hasOlder(String id) => _older[id] ?? false;
  bool loadingOlder(String id) => _olderLoading.contains(id);
  void _notify() {
    if (!_valid) return;
    if (_started &&
        _foreground &&
        !_expired &&
        !_refreshing &&
        _reconnectTimer?.isActive != true &&
        _socketToken != api.accessToken) {
      _socketToken = api.accessToken;
      socket.connect(_socketToken!);
    }
    notifyListeners();
  }

  void start() {
    if (!_valid || _expired) return;
    _started = true;
    _notify();
  }

  void setDraft(String id, String text) {
    if (!_valid) return;
    _drafts[id] = text;
  }

  void _mergeConversation(ChatConversation next) {
    if (!_valid || _expired) return;
    final old = _conversations[next.id];
    if (old != null) {
      next = next.copyWith(
        unreadCount: next.lastReadSequence < old.lastReadSequence
            ? old.unreadCount
            : next.unreadCount,
        lastMessage:
            old.lastMessage != null &&
                (next.lastMessage == null ||
                    old.lastMessage!.sequence > next.lastMessage!.sequence)
            ? old.lastMessage
            : next.lastMessage,
        lastReadSequence: next.lastReadSequence > old.lastReadSequence
            ? next.lastReadSequence
            : old.lastReadSequence,
        peerLastReadSequence:
            next.peerLastReadSequence > old.peerLastReadSequence
            ? next.peerLastReadSequence
            : old.peerLastReadSequence,
      );
    }
    _conversations[next.id] = next;
  }

  void _merge(ChatMessage message) {
    if (!_valid || _expired) return;
    final list = _messages.putIfAbsent(message.conversationId, () => []);
    list.removeWhere(
      (b) =>
          b.message.id == message.id ||
          (b.message.senderId == message.senderId &&
              b.message.clientMessageId == message.clientMessageId),
    );
    list.add(ChatBubble(message, ChatSendStatus.sent));
    _timers
        .remove('${message.conversationId}/${message.clientMessageId}')
        ?.cancel();
    list.sort((a, b) {
      if (a.status == ChatSendStatus.sent && b.status == ChatSendStatus.sent) {
        return a.message.sequence.compareTo(b.message.sequence);
      }
      if (a.status == ChatSendStatus.sent) return -1;
      if (b.status == ChatSendStatus.sent) return 1;
      return a.message.createdAt.compareTo(b.message.createdAt);
    });
    final c = _conversations[message.conversationId];
    if (c != null &&
        (c.lastMessage == null || message.sequence > c.lastMessage!.sequence)) {
      _conversations[c.id] = c.copyWith(lastMessage: message);
    }
  }

  void _handleError(Object e) {
    error = chatError(e);
    if (e is AuthApiException && e.statusCode == 401) _expire();
  }

  void _expire() {
    _expired = true;
    connected = false;
    _socketToken = null;
    socket.disconnect();
    _messages.clear();
    _drafts.clear();
    _conversations.clear();
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
  }

  Future<void> loadInbox({bool more = false}) async {
    if (!_valid || _expired) return;
    if (inboxLoading) {
      // A socket invalidation is a new first-page snapshot, never another page
      // from the stale cursor chain currently being fetched.
      if (!more) _inboxRefreshPending = true;
      return;
    }
    final ticket = ++_inboxGeneration;
    inboxLoading = true;
    error = null;
    _notify();
    try {
      final result = await api.inbox(cursor: more ? nextCursor : null);
      if (!_valid || ticket != _inboxGeneration) return;
      if (!more) _inboxIds.clear();
      for (final row in result.data) {
        _inboxIds.add(row.id);
        _mergeConversation(row);
      }
      nextCursor = result.nextCursor;
    } catch (e) {
      if (_valid && ticket == _inboxGeneration) _handleError(e);
    } finally {
      if (_valid && ticket == _inboxGeneration) {
        inboxLoading = false;
        final refresh = _inboxRefreshPending;
        _inboxRefreshPending = false;
        _notify();
        if (refresh && !_expired && _foreground) unawaited(loadInbox());
      }
    }
  }

  Future<ChatConversation?> openDirect(String peerId) async {
    if (!_valid || _expired) return null;
    try {
      final result = await api.openDirect(peerId);
      if (!_valid) return null;
      _mergeConversation(result);
      _inboxIds.add(result.id);
      _notify();
      return result;
    } catch (e) {
      if (_valid) {
        _handleError(e);
        _notify();
      }
      return null;
    }
  }

  Future<void> open(String id) async {
    if (!_valid || _expired) return;
    _visible = id;
    start();
    _opening.add(id);
    error = null;
    _notify();
    try {
      await _refreshConversation(id);
      if (!_valid || _expired) return;
      if (!_syncedThrough.containsKey(id)) {
        final page = await api.history(id);
        if (!_valid) return;
        for (final message in page.data) {
          _merge(message);
        }
        _older[id] = page.hasMore;
        _syncedThrough[id] = page.data.isEmpty
            ? BigInt.zero
            : page.data.last.sequence;
      } else {
        await resync(id);
      }
      if (!_valid) return;
      await markRead(id);
    } catch (e) {
      if (_valid) _handleError(e);
    } finally {
      if (_valid) {
        _opening.remove(id);
        _notify();
      }
    }
  }

  void closeConversation(String id) {
    if (_visible == id) {
      sendTyping(id, false);
      _visible = null;
    }
  }

  Future<void> resync(String id) {
    if (!_valid || _expired) return Future.value();
    return _resyncing[id] ??= _resync(id).whenComplete(() {
      // Returning remove's Future would make this Future await itself.
      _resyncing.remove(id);
    });
  }

  Future<void> _refreshConversation(String id) async {
    try {
      final detail = await api.detail(id);
      if (_valid) _mergeConversation(detail);
    } on AuthApiException catch (e) {
      if (e.statusCode != 503) rethrow;
      if (!_valid) return;
      // History has its own authenticated participant check. A temporary
      // profile/policy outage must deny new interactions without blocking it.
      final current = _conversations[id];
      if (current != null) {
        _conversations[id] = current.copyWith(canInteract: false);
      }
      _handleError(e);
    }
  }

  Future<void> _resync(String id) async {
    try {
      await _refreshConversation(id);
      if (!_valid || _expired) return;
      var cursor = _syncedThrough[id] ?? BigInt.zero;
      while (_valid) {
        final page = await api.history(id, after: cursor.toString());
        if (!_valid) return;
        for (final message in page.data) {
          _merge(message);
        }
        if (page.data.isNotEmpty) {
          final next = page.data.last.sequence;
          if (next <= cursor) {
            throw const FormatException('Non-advancing history cursor');
          }
          cursor = next;
          _syncedThrough[id] = cursor;
        }
        if (!page.hasMore) break;
        if (page.data.isEmpty) {
          throw const FormatException('Empty history cursor');
        }
      }
      if (!_valid) return;
      await markRead(id);
    } catch (e) {
      if (_valid) _handleError(e);
    }
    if (_valid) _notify();
  }

  Future<void> loadOlder(String id) async {
    if (!_valid || _olderLoading.contains(id) || !hasOlder(id)) return;
    final confirmed = messages(
      id,
    ).where((b) => b.status == ChatSendStatus.sent);
    if (confirmed.isEmpty) return;
    _olderLoading.add(id);
    _notify();
    try {
      final page = await api.history(
        id,
        before: confirmed.first.message.sequence.toString(),
      );
      if (!_valid) return;
      for (final message in page.data) {
        _merge(message);
      }
      _older[id] = page.hasMore;
    } catch (e) {
      if (_valid) _handleError(e);
    } finally {
      if (_valid) {
        _olderLoading.remove(id);
        _notify();
      }
    }
  }

  Future<bool> sendText(String text) async {
    final id = _visible;
    if (!_valid ||
        _expired ||
        id == null ||
        conversation(id)?.canInteract != true ||
        !_foreground) {
      return false;
    }
    late final String normalized;
    try {
      normalized = validateChatText(text);
    } catch (e) {
      _handleError(e);
      _notify();
      return false;
    }
    final clientId = idGenerator();
    final message = ChatMessage(
      id: 'local:$clientId',
      conversationId: id,
      senderId: accountId,
      clientMessageId: clientId,
      sequence: BigInt.zero,
      text: normalized,
      createdAt: DateTime.now(),
    );
    _messages
        .putIfAbsent(id, () => [])
        .add(ChatBubble(message, ChatSendStatus.pending));
    _drafts[id] = '';
    sendTyping(id, false);
    _notify();
    // Do not keep the composer waiting for the network or an uncertain request.
    unawaited(_send(message));
    return true;
  }

  Future<void> retry(String id, String clientId) async {
    if (!_valid || _expired || conversation(id)?.canInteract != true) return;
    final matches = messages(id).where(
      (b) =>
          b.message.clientMessageId == clientId &&
          b.status == ChatSendStatus.failed,
    );
    if (matches.isEmpty) return;
    await _send(matches.first.message);
  }

  void _status(ChatMessage message, ChatSendStatus status) {
    final list = _messages[message.conversationId];
    if (list == null) return;
    final i = list.indexWhere(
      (b) =>
          b.message.clientMessageId == message.clientMessageId &&
          b.message.senderId == accountId,
    );
    if (i >= 0 && list[i].status != ChatSendStatus.sent) {
      list[i] = ChatBubble(list[i].message, status);
    }
  }

  Future<void> _send(ChatMessage message) async {
    final key = '${message.conversationId}/${message.clientMessageId}';
    final attempt = (_attempts[key] ?? 0) + 1;
    _attempts[key] = attempt;
    _status(message, ChatSendStatus.pending);
    _timers.remove(key)?.cancel();
    _timers[key] = Timer(const Duration(seconds: 10), () {
      if (_valid && _attempts[key] == attempt) {
        _status(message, ChatSendStatus.failed);
        _notify();
      }
    });
    _notify();
    try {
      final confirmed = await api.send(
        message.conversationId,
        message.clientMessageId,
        message.text,
      );
      if (!_valid) return;
      _merge(confirmed);
      _notify();
    } catch (e) {
      if (!_valid || _attempts[key] != attempt) return;
      _timers.remove(key)?.cancel();
      _status(message, ChatSendStatus.failed);
      _handleError(e);
      if (e is AuthApiException &&
          (e.statusCode == 403 || e.statusCode == 404)) {
        final c = _conversations[message.conversationId];
        if (c != null) _conversations[c.id] = c.copyWith(canInteract: false);
      }
      _notify();
    }
  }

  Future<void> markRead(String id) async {
    if (!_valid ||
        _expired ||
        !_foreground ||
        _visible != id ||
        conversation(id)?.canInteract != true ||
        _reading.contains(id)) {
      return;
    }
    final confirmed = messages(
      id,
    ).where((b) => b.status == ChatSendStatus.sent);
    if (confirmed.isEmpty) return;
    final sequence = confirmed.last.message.sequence;
    if (sequence <= _conversations[id]!.lastReadSequence) return;
    _reading.add(id);
    var progressed = false;
    try {
      final result = await api.read(id, sequence.toString());
      if (!_valid) return;
      final c = _conversations[id];
      if (c == null) return;
      final read = chatSequence(result.sequence);
      progressed = read >= sequence;
      if (read >= c.lastReadSequence) {
        _conversations[id] = c.copyWith(
          lastReadSequence: read,
          unreadCount: result.unreadCount,
        );
      }
    } catch (e) {
      if (_valid) _handleError(e);
    } finally {
      _reading.remove(id);
    }
    if (_valid) {
      _notify();
      final latest = messages(id).where((b) => b.status == ChatSendStatus.sent);
      if (progressed &&
          latest.isNotEmpty &&
          latest.last.message.sequence > sequence) {
        unawaited(markRead(id));
      }
    }
  }

  void sendTyping(String id, bool typing) {
    if (!_valid ||
        !_foreground ||
        !connected ||
        _visible != id ||
        conversation(id)?.canInteract != true) {
      return;
    }
    _typingStop?.cancel();
    if (typing) {
      _typingStop = Timer(
        const Duration(seconds: 2),
        () => sendTyping(id, false),
      );
    }
    // Both transitions share one socket-level throttle. A quick send/clear
    // coalesces its stop behind the previous start rather than causing429.
    _pendingTyping = (id, typing);
    _flushOutgoingTyping();
  }

  void _flushOutgoingTyping() {
    if (_typingThrottle?.isActive == true) return;
    final update = _pendingTyping;
    _pendingTyping = null;
    if (update == null ||
        !_valid ||
        !_foreground ||
        !connected ||
        _visible != update.$1 ||
        conversation(update.$1)?.canInteract != true) {
      return;
    }
    socket.typing(update.$1, update.$2);
    // Small margin tolerates transport jitter around the server's1s window.
    _typingThrottle = Timer(const Duration(milliseconds: 1100), () {
      _typingThrottle = null;
      _flushOutgoingTyping();
    });
  }

  void setForeground(bool value) {
    if (!_valid || _foreground == value) return;
    if (!value && _visible != null) sendTyping(_visible!, false);
    _foreground = value;
    if (!value) {
      _reconnectTimer?.cancel();
      _typing.clear();
      for (final timer in _typingExpiry.values) {
        timer.cancel();
      }
      _typingExpiry.clear();
      socket.disconnect();
      _socketToken = null;
      connected = false;
      _typingStop?.cancel();
      _typingThrottle?.cancel();
      _pendingTyping = null;
    } else if (!_expired) {
      start();
      unawaited(loadInbox());
      if (_visible != null) unawaited(resync(_visible!));
    }
    _notify();
  }

  Future<void> _refreshAuth() async {
    if (!_valid || _refreshing || _expired || !_foreground) return;
    // Another feature may have refreshed the shared session since this socket
    // connected. Try that credential before asking the authority again.
    if (_socketToken != null && _socketToken != api.accessToken) {
      _socketToken = null;
      _notify();
      return;
    }
    final token = api.accessToken;
    if (!_rejectedTokens.add(token)) return;
    _refreshing = true;
    socket.disconnect();
    connected = false;
    try {
      await api.refreshForSocket();
      if (!_valid) return;
      if (api.accessToken == token) {
        error = 'Phiên chat chưa thể xác thực. Hãy mở lại hoặc đăng nhập lại.';
        _socketToken = token;
      } else {
        _socketToken = null;
      }
    } catch (e) {
      if (_valid) {
        _handleError(e);
        if (e is AuthApiException && e.statusCode == 403) _expire();
      }
    } finally {
      _refreshing = false;
      if (_valid) _notify();
    }
  }

  void _event(ChatEvent event) {
    if (!_valid) {
      socket.disconnect();
      return;
    }
    if (_expired || !_foreground) return;
    try {
      switch (event.name) {
        case 'connect':
          _reconnectTimer?.cancel();
          _reconnectDelay = 1;
          connected = true;
          error = null;
          unawaited(loadInbox());
          if (_visible != null) unawaited(resync(_visible!));
        case 'disconnect':
          connected = false;
        case 'auth:error':
          unawaited(_refreshAuth());
        case 'message:new':
          final m = ChatMessage.fromJson(
            Map<String, dynamic>.from(event.data['message'] as Map),
          );
          _merge(m);
          if (m.conversationId == _visible) {
            unawaited(markRead(m.conversationId));
          }
          _scheduleInbox();
        case 'conversation:updated':
          _scheduleInbox();
        case 'conversation:read':
          final id = event.data['conversationId'] as String;
          final c = _conversations[id];
          if (c != null) {
            final sequence = chatSequence(event.data['sequence']);
            if (event.data['accountId'] == accountId) {
              if (sequence > c.lastReadSequence) {
                _conversations[id] = c.copyWith(lastReadSequence: sequence);
              }
            } else if (event.data['accountId'] == c.peer?.id &&
                sequence > c.peerLastReadSequence) {
              _conversations[id] = c.copyWith(peerLastReadSequence: sequence);
            }
          }
        case 'typing:updated':
          final id = event.data['conversationId'] as String;
          if (event.data['accountId'] != _conversations[id]?.peer?.id) break;
          _typingExpiry.remove(id)?.cancel();
          if (event.data['isTyping'] == true) {
            _typing.add(id);
            _typingExpiry[id] = Timer(const Duration(seconds: 3), () {
              if (_valid) {
                _typing.remove(id);
                _notify();
              }
            });
          } else {
            _typing.remove(id);
          }
        case 'chat:error':
          final code = event.data['code'];
          if (code == 401 || code == '401') {
            unawaited(_refreshAuth());
          } else if (code == 403 || code == '403') {
            // This is an operation policy denial, not session revocation. The
            // server does not identify its conversation, so recheck the active
            // detail and inbox without removing any participant history.
            error = 'Hiện không thể tiếp tục hội thoại này.';
            final active = _visible;
            if (active != null) {
              final current = _conversations[active];
              if (current != null) {
                _conversations[active] = current.copyWith(canInteract: false);
              }
              unawaited(resync(active));
            }
            _scheduleInbox();
          } else if (code == 429 || code == '429') {
            error = 'Thao tác quá nhanh. Hãy thử lại sau ít giây.';
          } else {
            connected = false;
            error = 'Kết nối chat tạm gián đoạn. Đang thử kết nối lại…';
            _scheduleReconnect();
          }
      }
    } catch (_) {
      error = 'Không thể cập nhật tin nhắn. Hãy tải lại hội thoại.';
    }
    _notify();
  }

  void _scheduleReconnect() {
    if (!_valid ||
        _expired ||
        !_foreground ||
        _reconnectTimer?.isActive == true) {
      return;
    }
    socket.disconnect();
    _reconnectTimer = Timer(Duration(seconds: _reconnectDelay), () {
      _reconnectTimer = null;
      if (_valid && !_expired && _foreground) {
        _socketToken = null;
        _notify();
      }
    });
    _reconnectDelay = min(_reconnectDelay * 2, 10);
  }

  void _scheduleInbox() {
    _inboxDebounce?.cancel();
    _inboxDebounce = Timer(
      const Duration(milliseconds: 350),
      () => unawaited(loadInbox()),
    );
  }

  @override
  void dispose() {
    if (_disposed) return;
    if (_visible != null) sendTyping(_visible!, false);
    _disposed = true;
    _inboxGeneration++;
    unawaited(_subscription.cancel());
    _inboxDebounce?.cancel();
    _reconnectTimer?.cancel();
    _typingStop?.cancel();
    _typingThrottle?.cancel();
    _pendingTyping = null;
    for (final t in [..._timers.values, ..._typingExpiry.values]) {
      t.cancel();
    }
    _messages.clear();
    _conversations.clear();
    _inboxIds.clear();
    _drafts.clear();
    socket.disconnect();
    socket.dispose();
    super.dispose();
  }
}
