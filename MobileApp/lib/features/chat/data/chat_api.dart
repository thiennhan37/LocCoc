import '../../users/data/user_api_client.dart';
import '../domain/chat_models.dart';

abstract interface class ChatRepository {
  String get accountId;
  String get accessToken;
  Future<void> refreshForSocket();
  Future<ChatInboxPage> inbox({String? cursor});
  Future<ChatConversation> detail(String id);
  Future<ChatConversation> openDirect(String peerId);
  Future<ChatMessagePage> history(String id, {String? before, String? after});
  Future<ChatMessage> send(String conversationId, String clientId, String text);
  Future<ChatReadResult> read(String id, String sequence);
  Future<ChatFriendPage> friends(int page);
}

class ChatApi implements ChatRepository {
  final UserApiClient users;
  ChatApi(this.users) {
    if (!users.session.authenticated ||
        users.session.accessToken.isEmpty ||
        users.session.accessToken.startsWith('demo-')) {
      throw ArgumentError('Chat requires an authenticated session');
    }
  }
  @override
  String get accountId => users.session.user.id;
  @override
  String get accessToken => users.session.accessToken;
  // An authority-backed HTTP request reuses the same single-flight 401 refresh
  // as every other feature, including concurrent REST and socket failures.
  @override
  Future<void> refreshForSocket() async {
    await users.me();
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) => users.request(method, path, area: 'chat', body: body);
  @override
  Future<ChatInboxPage> inbox({String? cursor}) async {
    final query = Uri(
      queryParameters: {'limit': '20', 'cursor': ?cursor},
    ).query;
    final result = await _request('GET', 'conversations?$query');
    return ChatInboxPage(
      (result['data'] as List)
          .map(
            (e) =>
                ChatConversation.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList(),
      result['nextCursor'] as String?,
    );
  }

  @override
  Future<ChatConversation> detail(String id) async => ChatConversation.fromJson(
    Map<String, dynamic>.from(
      (await _request(
            'GET',
            'conversations/${Uri.encodeComponent(id)}',
          ))['conversation']
          as Map,
    ),
  );
  @override
  Future<ChatConversation> openDirect(String peerId) async =>
      ChatConversation.fromJson(
        Map<String, dynamic>.from(
          (await _request(
                'POST',
                'conversations/direct',
                body: {'peerId': peerId},
              ))['conversation']
              as Map,
        ),
      );
  @override
  Future<ChatMessagePage> history(
    String id, {
    String? before,
    String? after,
  }) async {
    if (before != null && after != null) {
      throw ArgumentError('Only one cursor is allowed');
    }
    final query = Uri(
      queryParameters: {'limit': '100', 'before': ?before, 'after': ?after},
    ).query;
    final result = await _request(
      'GET',
      'conversations/${Uri.encodeComponent(id)}/messages?$query',
    );
    return ChatMessagePage(
      (result['data'] as List)
          .map((e) => ChatMessage.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      result['hasMore'] == true,
    );
  }

  @override
  Future<ChatMessage> send(
    String conversationId,
    String clientId,
    String text,
  ) async => ChatMessage.fromJson(
    Map<String, dynamic>.from(
      (await _request(
            'POST',
            'conversations/${Uri.encodeComponent(conversationId)}/messages',
            body: {'clientMessageId': clientId, 'text': validateChatText(text)},
          ))['message']
          as Map,
    ),
  );
  @override
  Future<ChatReadResult> read(String id, String sequence) async {
    final result = await _request(
      'PATCH',
      'conversations/${Uri.encodeComponent(id)}/read',
      body: {'sequence': sequence},
    );
    return ChatReadResult(
      result['lastReadSequence'] as String,
      result['unreadCount'] as int,
    );
  }

  @override
  Future<ChatFriendPage> friends(int page) async {
    final result = await users.list('friends', page: page);
    return ChatFriendPage(
      (result['data'] as List).map((e) {
        final row = Map<String, dynamic>.from(e as Map);
        return ChatPeer.fromJson(
          row['peer'] is Map
              ? Map<String, dynamic>.from(row['peer'] as Map)
              : row,
        );
      }).toList(),
      result['hasMore'] == true,
    );
  }
}
