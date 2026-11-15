import 'dart:async';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/chat/presentation/chat_friends_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/chat/domain/chat_models.dart';
import 'package:mobile_app/features/chat/data/chat_api.dart';
import 'package:mobile_app/features/chat/data/chat_socket_client.dart';
import 'package:mobile_app/features/chat/presentation/chat_controller.dart';

ChatMessage message(
  String seq, {
  String client = 'client-1',
  String sender = 'me',
  String conversationId = 'conversation',
}) => ChatMessage.fromJson({
  'id': 'message-$seq',
  'conversationId': conversationId,
  'senderId': sender,
  'clientMessageId': client,
  'sequence': seq,
  'text': 'Xin chào 👋',
  'createdAt': '2026-11-13T08:00:00Z',
});
ChatConversation conversation({
  String id = 'conversation',
  String mine = '0',
  String theirs = '0',
  bool allowed = true,
}) => ChatConversation.fromJson({
  'id': id,
  'peer': {
    'id': 'peer',
    'username': 'ban',
    'displayName': 'Bạn',
    'avatarUrl': null,
  },
  'canInteract': allowed,
  'lastMessage': null,
  'unreadCount': 0,
  'lastReadSequence': mine,
  'peerLastReadSequence': theirs,
  'updatedAt': '2026-11-13T08:00:00Z',
});

class FakeChatApi implements ChatRepository {
  @override
  String accountId = 'me';
  @override
  String accessToken = 'token';
  ChatConversation current = conversation();
  final sent = <String>[];
  final readPositions = <String>[];
  final afters = <String?>[];
  Future<ChatMessage> Function(String id, String text)? onSend;
  Future<ChatMessagePage> Function(String? after)? onHistory;
  Future<ChatConversation> Function()? onDetail;
  Future<ChatInboxPage> Function(String? cursor)? onInbox;
  int refreshes = 0;
  Future<ChatReadResult> Function(String sequence)? onRead;
  Future<ChatFriendPage> Function(int page)? onFriends;
  @override
  Future<void> refreshForSocket() async {
    refreshes++;
    accessToken = 'fresh';
  }

  @override
  Future<ChatInboxPage> inbox({String? cursor}) async =>
      onInbox == null ? ChatInboxPage([current], null) : onInbox!(cursor);
  @override
  Future<ChatConversation> detail(String id) async =>
      onDetail == null ? current : onDetail!();
  @override
  Future<ChatMessagePage> history(
    String id, {
    String? before,
    String? after,
  }) async {
    afters.add(after);
    return onHistory == null ? ChatMessagePage([], false) : onHistory!(after);
  }

  @override
  Future<ChatMessage> send(
    String conversationId,
    String clientId,
    String text,
  ) async {
    sent.add(clientId);
    return onSend == null
        ? message('1', client: clientId)
        : onSend!(clientId, text);
  }

  @override
  Future<ChatReadResult> read(String id, String sequence) async {
    readPositions.add(sequence);
    return onRead == null ? ChatReadResult(sequence, 0) : onRead!(sequence);
  }

  @override
  Future<ChatConversation> openDirect(String peerId) async => current;
  @override
  Future<ChatFriendPage> friends(int page) async =>
      onFriends == null ? ChatFriendPage([], false) : onFriends!(page);
}

class FakeRealtime implements ChatRealtime {
  final stream = StreamController<ChatEvent>.broadcast(sync: true);
  final tokens = <String>[];
  int disconnects = 0;
  final typingUpdates = <(String, bool)>[];
  @override
  Stream<ChatEvent> get events => stream.stream;
  @override
  void connect(String token) {
    tokens.add(token);
  }

  @override
  void disconnect() {
    disconnects++;
  }

  @override
  void typing(String id, bool typing) {
    typingUpdates.add((id, typing));
  }

  @override
  void dispose() {
    stream.close();
  }

  void emit(String name, Map<String, dynamic> payload) =>
      stream.add(ChatEvent(name, payload));
}

Future<void> flush() async {
  await Future<void>.delayed(Duration.zero);
}

void main() {
  test(
    'profile dependency failure still loads participant history and disables sending',
    () async {
      final api = FakeChatApi();
      api.onDetail = () async => throw AuthApiException(503);
      api.onHistory = (_) async => ChatMessagePage([message('1')], false);
      final c = ChatController(api: api, socket: FakeRealtime());
      addTearDown(c.dispose);
      await c.open('conversation');
      expect(c.messages('conversation'), hasLength(1));
      expect(await c.sendText('Không gửi'), false);
      expect(api.sent, isEmpty);
    },
  );
  test(
    'profile failure on resync preserves existing history but fails closed for interaction',
    () async {
      final api = FakeChatApi();
      api.onHistory = (_) async => ChatMessagePage([message('1')], false);
      final c = ChatController(api: api, socket: FakeRealtime());
      addTearDown(c.dispose);
      await c.open('conversation');
      api.onDetail = () async => throw AuthApiException(503);
      api.onHistory = (_) async =>
          ChatMessagePage([message('2', client: 'second')], false);
      await c.resync('conversation');
      expect(c.messages('conversation'), hasLength(2));
      expect(c.conversation('conversation')!.canInteract, false);
      expect(await c.sendText('Không gửi'), false);
    },
  );
  test('participant denial does not fetch history after detail404', () async {
    final api = FakeChatApi();
    api.onDetail = () async => throw AuthApiException(404);
    final c = ChatController(api: api, socket: FakeRealtime());
    addTearDown(c.dispose);
    await c.open('conversation');
    expect(api.afters, isEmpty);
    expect(c.messages('conversation'), isEmpty);
  });
  test('expired authority does not fall back to participant history', () async {
    final api = FakeChatApi();
    api.onDetail = () async => throw AuthApiException(401);
    final c = ChatController(api: api, socket: FakeRealtime());
    addTearDown(c.dispose);
    await c.open('conversation');
    expect(api.afters, isEmpty);
    expect(c.expired, true);
    expect(c.messages('conversation'), isEmpty);
  });

  test(
    'conversation policy denial preserves session history and drafts while resyncing permission',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      api.onHistory = (_) async => ChatMessagePage([message('1')], false);
      var details = 0;
      api.onDetail = () async {
        details++;
        return api.current;
      };
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      api.current = conversation(id: 'other');
      api.onHistory = (_) async => ChatMessagePage([
        message('1', conversationId: api.current.id),
      ], false);
      await c.open('other');
      c.setDraft('other', 'Nháp hội thoại khác');
      api.current = conversation();
      await c.open('conversation');
      c.setDraft('conversation', 'Bản nháp cần giữ');
      final disconnects = socket.disconnects;
      api.current = conversation(allowed: false);
      socket.emit('chat:error', {'code': 403, 'message': 'Not friends'});
      await flush();
      expect(c.expired, false);
      expect(c.messages('conversation'), hasLength(1));
      expect(c.draft('conversation'), 'Bản nháp cần giữ');
      expect(c.conversation('conversation')!.canInteract, false);
      expect(c.messages('other'), hasLength(1));
      expect(c.draft('other'), 'Nháp hội thoại khác');
      expect(c.conversation('other')!.canInteract, true);
      expect(details, 3);
      expect(socket.disconnects, disconnects);
    },
  );
  testWidgets(
    'typing stop is coalesced behind the same throttle as typing start',
    (tester) async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      await c.open('conversation');
      socket.emit('connect', {});
      await tester.pump();
      c.sendTyping('conversation', true);
      c.sendTyping('conversation', false);
      expect(socket.typingUpdates, [('conversation', true)]);
      await tester.pump(const Duration(milliseconds: 1100));
      expect(socket.typingUpdates, [
        ('conversation', true),
        ('conversation', false),
      ]);
      c.dispose();
    },
  );
  testWidgets(
    'rate limited typing operation leaves a healthy socket connected',
    (tester) async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      c.start();
      socket.emit('connect', {});
      await tester.pump();
      final disconnects = socket.disconnects;
      socket.emit('chat:error', {
        'code': 429,
        'message': 'Too many typing updates',
      });
      await tester.pump(const Duration(seconds: 3));
      expect(c.connected, true);
      expect(socket.disconnects, disconnects);
      expect(socket.tokens, ['token']);
      c.dispose();
    },
  );
  testWidgets(
    'inbox invalidation during a slow first-page load runs a queued refresh',
    (tester) async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final pending = Completer<ChatInboxPage>();
      var calls = 0;
      api.onInbox = (_) {
        calls++;
        return calls == 1
            ? pending.future
            : Future.value(ChatInboxPage([conversation()], null));
      };
      final c = ChatController(api: api, socket: socket);
      final loading = c.loadInbox();
      socket.emit('conversation:updated', {'conversationId': 'conversation'});
      await tester.pump(const Duration(milliseconds: 400));
      pending.complete(const ChatInboxPage([], null));
      await tester.pump();
      await loading;
      expect(c.conversations.map((row) => row.id), ['conversation']);
      expect(calls, 2);
      c.dispose();
    },
  );
  testWidgets(
    'inbox invalidation during pagination queues first page rather than another old page',
    (tester) async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final pending = Completer<ChatInboxPage>();
      final cursors = <String?>[];
      api.onInbox = (cursor) {
        cursors.add(cursor);
        return cursor == 'old-page'
            ? pending.future
            : Future.value(ChatInboxPage([conversation()], 'old-page'));
      };
      final c = ChatController(api: api, socket: socket);
      await c.loadInbox();
      final loading = c.loadInbox(more: true);
      socket.emit('conversation:updated', {'conversationId': 'conversation'});
      await tester.pump(const Duration(milliseconds: 400));
      pending.complete(const ChatInboxPage([], null));
      await tester.pump();
      await loading;
      expect(cursors, [null, 'old-page', null]);
      expect(c.conversations, hasLength(1));
      c.dispose();
    },
  );

  test(
    'socket rejection of an older token reuses an already refreshed session',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      c.start();
      api.accessToken = 'refreshed-by-another-feature';
      socket.emit('auth:error', {});
      await flush();
      expect(api.refreshes, 0);
      expect(socket.tokens, ['token', 'refreshed-by-another-feature']);
    },
  );
  test('stale inbox cannot regress persisted read cursors', () async {
    final api = FakeChatApi()..current = conversation(mine: '9', theirs: '8');
    final c = ChatController(api: api, socket: FakeRealtime());
    addTearDown(c.dispose);
    await c.open('conversation');
    api.current = conversation(mine: '1', theirs: '2');
    await c.loadInbox();
    expect(c.conversation('conversation')!.lastReadSequence, BigInt.from(9));
    expect(
      c.conversation('conversation')!.peerLastReadSequence,
      BigInt.from(8),
    );
  });
  test(
    'read catches messages arriving during an in-flight read request',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final pending = Completer<ChatReadResult>();
      api.onRead = (sequence) => sequence == '1'
          ? pending.future
          : Future.value(ChatReadResult(sequence, 0));
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      await c.open('conversation');
      socket.emit('message:new', {
        'message': message('1', sender: 'peer', client: 'first').toJson(),
      });
      socket.emit('message:new', {
        'message': message('2', sender: 'peer', client: 'second').toJson(),
      });
      pending.complete(const ChatReadResult('1', 0));
      await flush();
      await flush();
      expect(api.readPositions, ['1', '2']);
    },
  );
  testWidgets(
    'temporary socket authority failure retries with backoff, preserving drafts',
    (tester) async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      c.start();
      c.setDraft('conversation', 'Chưa gửi');
      socket.emit('chat:error', {'code': 503, 'message': 'Unavailable'});
      await tester.pump(const Duration(seconds: 3));
      expect(socket.tokens, ['token', 'token']);
      expect(c.draft('conversation'), 'Chưa gửi');
      c.dispose();
    },
  );
  test(
    'friend pagination retains loaded matches and rejects stale switched-account response',
    () async {
      final api = FakeChatApi();
      api.onFriends = (page) async => ChatFriendPage([
        ChatPeer('friend-$page', 'ban$page', 'Bạn $page', null),
      ], page == 1);
      final friends = ChatFriendsController(api);
      addTearDown(friends.dispose);
      await friends.load();
      await friends.load(more: true);
      expect(friends.matching('bạn').map((p) => p.id), [
        'friend-1',
        'friend-2',
      ]);
      final response = Completer<ChatFriendPage>();
      api.onFriends = (_) => response.future;
      final loading = friends.load();
      api.accountId = 'other';
      response.complete(
        const ChatFriendPage([
          ChatPeer('private', 'private', 'Private', null),
        ], false),
      );
      await loading;
      expect(friends.matching(''), isEmpty);
    },
  );

  test('server sequences stay exact above JS integer precision', () {
    expect(
      message('9007199254740993').sequence,
      BigInt.parse('9007199254740993'),
    );
    expect(validateChatText('  👋\nXin chào  '), '👋\nXin chào');
    expect(() => validateChatText('😀' * 2001), throwsArgumentError);
    expect(() => validateChatText('   '), throwsArgumentError);
  });
  test('event before POST response merges one confirmed bubble', () async {
    final api = FakeChatApi();
    final socket = FakeRealtime();
    final response = Completer<ChatMessage>();
    api.onSend = (id, text) => response.future;
    final c = ChatController(
      api: api,
      socket: socket,
      idGenerator: () => 'client-1',
    );
    addTearDown(c.dispose);
    await c.open('conversation');
    final sending = c.sendText('Xin chào 👋');
    socket.emit('message:new', {'message': message('1').toJson()});
    expect(c.messages('conversation'), hasLength(1));
    response.complete(message('1'));
    await sending;
    expect(c.messages('conversation'), hasLength(1));
    expect(c.messages('conversation').single.status, ChatSendStatus.sent);
  });
  testWidgets('uncertain request allows retry with same UUID and content', (
    tester,
  ) async {
    final api = FakeChatApi();
    final socket = FakeRealtime();
    final response = Completer<ChatMessage>();
    api.onSend = (id, text) => response.future;
    final c = ChatController(
      api: api,
      socket: socket,
      idGenerator: () => 'client-1',
    );
    await c.open('conversation');
    unawaited(c.sendText(' Xin chào 👋 '));
    await tester.pump(const Duration(seconds: 11));
    expect(c.messages('conversation').single.status, ChatSendStatus.failed);
    api.onSend = (id, text) async {
      expect(text, 'Xin chào 👋');
      return message('1', client: id);
    };
    await c.retry('conversation', 'client-1');
    expect(api.sent, ['client-1', 'client-1']);
    response.complete(message('1'));
    await tester.pump();
    expect(c.messages('conversation'), hasLength(1));
    c.dispose();
  });
  test(
    'reconnect loads every missed page and recovers both read cursors',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      await c.open('conversation');
      api.current = conversation(mine: '2', theirs: '3');
      api.onHistory = (after) async => after == '0'
          ? ChatMessagePage([
              message('1', client: '1'),
              message('2', client: '2'),
            ], true)
          : ChatMessagePage([message('3', client: '3')], false);
      socket.emit('connect', {});
      await flush();
      await flush();
      expect(api.afters, [null, '0', '2']);
      expect(
        c.messages('conversation').map((m) => m.message.sequence.toString()),
        ['1', '2', '3'],
      );
      expect(
        c.conversation('conversation')!.peerLastReadSequence,
        BigInt.from(3),
      );
      expect(c.conversation('conversation')!.lastReadSequence, BigInt.from(3));
    },
  );
  test(
    'history completion after account switch never exposes old account data',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final response = Completer<ChatMessagePage>();
      api.onHistory = (_) => response.future;
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      final opening = c.open('conversation');
      await flush();
      api.accountId = 'other';
      response.complete(ChatMessagePage([message('1')], false));
      await opening;
      expect(c.messages('conversation'), isEmpty);
    },
  );
  test('dispose cancels pending events and REST responses', () async {
    final api = FakeChatApi();
    final socket = FakeRealtime();
    final response = Completer<ChatConversation>();
    api.onDetail = () => response.future;
    final c = ChatController(api: api, socket: socket);
    final opening = c.open('conversation');
    c.dispose();
    response.complete(conversation());
    await opening;
    expect(c.messages('conversation'), isEmpty);
    expect(socket.disconnects, greaterThan(0));
  });
  test(
    'socket authentication error refreshes once per rejected token',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      c.start();
      socket.emit('auth:error', {});
      socket.emit('auth:error', {});
      await flush();
      expect(api.refreshes, 1);
      expect(socket.tokens, ['token', 'fresh']);
    },
  );
  test(
    'read only advances while visible and foreground, peer read never regresses',
    () async {
      final api = FakeChatApi();
      final socket = FakeRealtime();
      final c = ChatController(api: api, socket: socket);
      addTearDown(c.dispose);
      await c.open('conversation');
      c.setForeground(false);
      socket.emit('message:new', {
        'message': message('1', sender: 'peer').toJson(),
      });
      await flush();
      expect(api.readPositions, isEmpty);
      c.setForeground(true);
      socket.emit('conversation:read', {
        'conversationId': 'conversation',
        'accountId': 'peer',
        'sequence': '9',
      });
      socket.emit('conversation:read', {
        'conversationId': 'conversation',
        'accountId': 'peer',
        'sequence': '2',
      });
      expect(
        c.conversation('conversation')!.peerLastReadSequence,
        BigInt.from(9),
      );
    },
  );
}
