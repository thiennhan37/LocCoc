/// Chat sequences use BigInt: JSON decimal strings must never pass through double.
BigInt chatSequence(Object? value) {
  if (value is! String || !RegExp(r'^(0|[1-9][0-9]*)$').hasMatch(value)) {
    throw const FormatException('Invalid chat sequence');
  }
  return BigInt.parse(value);
}

String validateChatText(String value) {
  final text = value.trim();
  if (text.isEmpty || text.runes.length > 2000) {
    throw ArgumentError('Tin nhắn cần có từ 1 đến 2000 ký tự.');
  }
  return text;
}

class ChatPeer {
  final String id, username, displayName;
  final String? avatarUrl;
  const ChatPeer(this.id, this.username, this.displayName, this.avatarUrl);
  factory ChatPeer.fromJson(Map<String, dynamic> json) => ChatPeer(
    json['id'] as String,
    json['username'] as String? ?? '',
    json['displayName'] as String? ??
        json['username'] as String? ??
        'Người dùng',
    json['avatarUrl'] as String?,
  );
}

class ChatMessage {
  final String id, conversationId, senderId, clientMessageId, text;
  final BigInt sequence;
  final DateTime createdAt;
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.clientMessageId,
    required this.sequence,
    required this.text,
    required this.createdAt,
  });
  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String,
    conversationId: json['conversationId'] as String,
    senderId: json['senderId'] as String,
    clientMessageId: json['clientMessageId'] as String,
    sequence: chatSequence(json['sequence']),
    text: json['text'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'conversationId': conversationId,
    'senderId': senderId,
    'clientMessageId': clientMessageId,
    'sequence': sequence.toString(),
    'text': text,
    'createdAt': createdAt.toUtc().toIso8601String(),
  };
}

class ChatConversation {
  final String id;
  final ChatPeer? peer;
  final bool canInteract;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final BigInt lastReadSequence, peerLastReadSequence;
  final DateTime updatedAt;
  const ChatConversation({
    required this.id,
    required this.peer,
    required this.canInteract,
    required this.lastMessage,
    required this.unreadCount,
    required this.lastReadSequence,
    required this.peerLastReadSequence,
    required this.updatedAt,
  });
  factory ChatConversation.fromJson(Map<String, dynamic> json) =>
      ChatConversation(
        id: json['id'] as String,
        peer: json['peer'] == null
            ? null
            : ChatPeer.fromJson(Map<String, dynamic>.from(json['peer'] as Map)),
        canInteract: json['canInteract'] == true,
        lastMessage: json['lastMessage'] == null
            ? null
            : ChatMessage.fromJson(
                Map<String, dynamic>.from(json['lastMessage'] as Map),
              ),
        unreadCount: json['unreadCount'] as int? ?? 0,
        lastReadSequence: chatSequence(json['lastReadSequence']),
        peerLastReadSequence: chatSequence(json['peerLastReadSequence']),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );
  ChatConversation copyWith({
    ChatMessage? lastMessage,
    int? unreadCount,
    BigInt? lastReadSequence,
    BigInt? peerLastReadSequence,
    bool? canInteract,
  }) => ChatConversation(
    id: id,
    peer: peer,
    canInteract: canInteract ?? this.canInteract,
    lastMessage: lastMessage ?? this.lastMessage,
    unreadCount: unreadCount ?? this.unreadCount,
    lastReadSequence: lastReadSequence ?? this.lastReadSequence,
    peerLastReadSequence: peerLastReadSequence ?? this.peerLastReadSequence,
    updatedAt: lastMessage?.createdAt ?? updatedAt,
  );
}

class ChatInboxPage {
  final List<ChatConversation> data;
  final String? nextCursor;
  const ChatInboxPage(this.data, this.nextCursor);
}

class ChatMessagePage {
  final List<ChatMessage> data;
  final bool hasMore;
  const ChatMessagePage(this.data, this.hasMore);
}

class ChatFriendPage {
  final List<ChatPeer> data;
  final bool hasMore;
  const ChatFriendPage(this.data, this.hasMore);
}

class ChatReadResult {
  final String sequence;
  final int unreadCount;
  const ChatReadResult(this.sequence, this.unreadCount);
}

enum ChatSendStatus { pending, sent, failed }

class ChatBubble {
  final ChatMessage message;
  final ChatSendStatus status;
  const ChatBubble(this.message, this.status);
}
