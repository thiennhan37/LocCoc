import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../../core/constants/api_constants.dart';

class ChatEvent {
  final String name;
  final Map<String, dynamic> data;
  const ChatEvent(this.name, this.data);
}

abstract interface class ChatRealtime {
  Stream<ChatEvent> get events;
  void connect(String token);
  void disconnect();
  void typing(String id, bool typing);
  void dispose();
}

typedef ChatSocketFactory =
    io.Socket Function(String uri, Map<String, dynamic> options);

class ChatSocketClient implements ChatRealtime {
  final String origin;
  final ChatSocketFactory factory;
  final _events = StreamController<ChatEvent>.broadcast(sync: true);
  io.Socket? _socket;
  bool _disposed = false;
  ChatSocketClient({String? origin, ChatSocketFactory? factory})
    : origin = origin ?? ApiConstants.chatSocketUrl,
      factory = factory ?? io.io;
  @override
  Stream<ChatEvent> get events => _events.stream;
  void _emit(String event, Object? payload) {
    if (_disposed) return;
    _events.add(
      ChatEvent(
        event,
        payload is Map ? Map<String, dynamic>.from(payload) : {},
      ),
    );
  }

  @override
  void connect(String token) {
    if (_disposed) return;
    disconnect();
    final socket = factory('${origin.replaceAll(RegExp(r'/+$'), '')}/chat', {
      'transports': ['websocket'],
      'path': '/socket.io',
      'autoConnect': false,
      'forceNew': true,
      'multiplex': false,
      'reconnection': true,
      'reconnectionDelay': 1000,
      'reconnectionDelayMax': 10000,
      'auth': {'accessToken': token},
    });
    _socket = socket;
    bool current() => identical(_socket, socket) && !_disposed;
    socket.onConnect((_) {
      if (current()) _emit('connect', {});
    });
    socket.onDisconnect((_) {
      if (current()) _emit('disconnect', {});
    });
    socket.onConnectError((error) {
      if (!current()) return;
      final data = error is Map ? error['data'] ?? error : null;
      final code = data is Map ? data['code'] : null;
      if (code == 401 || code == '401') {
        socket.disconnect();
        _emit('auth:error', {});
      } else {
        _emit('chat:error', data);
      }
    });
    for (final event in [
      'message:new',
      'conversation:updated',
      'typing:updated',
      'conversation:read',
      'chat:error',
    ]) {
      socket.on(event, (payload) {
        if (current()) _emit(event, payload);
      });
    }
    socket.connect();
  }

  @override
  void typing(String id, bool typing) => _socket?.emit('typing:update', {
    'conversationId': id,
    'isTyping': typing,
  });
  @override
  void disconnect() {
    final old = _socket;
    _socket = null;
    old?.dispose();
  }

  @override
  void dispose() {
    if (_disposed) return;
    disconnect();
    _disposed = true;
    unawaited(_events.close());
  }
}
