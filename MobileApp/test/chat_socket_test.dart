import 'package:flutter_test/flutter_test.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:mobile_app/features/chat/data/chat_socket_client.dart';

class LocalSocket extends io.Socket {
  bool released = false;
  LocalSocket()
    : super(
        io.io('http://localhost:9', <String, dynamic>{
          'autoConnect': false,
          'reconnection': false,
          'forceNew': true,
        }).io,
        '/chat',
        {},
      );
  @override
  io.Socket connect() {
    return this;
  }

  @override
  io.Socket disconnect() {
    connected = false;
    return this;
  }

  @override
  void dispose() {
    released = true;
    clearListeners();
  }
}

void main() {
  test(
    'socket handshake uses isolated authenticated websocket namespace, old listeners cannot leak',
    () async {
      final sockets = <LocalSocket>[];
      final options = <Map<String, dynamic>>[];
      final events = <ChatEvent>[];
      final client = ChatSocketClient(
        origin: 'http://10.0.2.2:8083/',
        factory: (uri, config) {
          expect(uri, 'http://10.0.2.2:8083/chat');
          options.add(config);
          final socket = LocalSocket();
          sockets.add(socket);
          return socket;
        },
      );
      final sub = client.events.listen(events.add);
      client.connect('old');
      expect(options.single['path'], '/socket.io');
      expect(options.single['transports'], ['websocket']);
      expect(options.single['forceNew'], true);
      expect(options.single['multiplex'], false);
      expect(options.single['auth'], {'accessToken': 'old'});
      client.connect('fresh');
      expect(sockets.first.released, true);
      sockets.first.emitReserved('message:new', {
        'message': {'secret': 'old account'},
      });
      sockets.last.emitReserved('connect', null);
      sockets.last.emitReserved('connect_error', {
        'data': {'code': 401, 'message': 'Denied'},
      });
      expect(events.map((e) => e.name), ['connect', 'auth:error']);
      expect(options.last['auth'], {'accessToken': 'fresh'});
      client.dispose();
      await sub.cancel();
    },
  );
}
