import '../../users/data/user_api_client.dart';

const postReactionEmoji = ['💛', '🔥', '😍', '😂', '👏'];

class ReactionSummary {
  final Map<String, int> counts;
  final String? myReaction;
  const ReactionSummary(this.counts, this.myReaction);
  factory ReactionSummary.fromJson(Map<String, dynamic> json) {
    final raw = json['counts'];
    final mine = json['myReaction'];
    if (raw is! Map || (mine != null && !postReactionEmoji.contains(mine))) {
      throw const FormatException('Invalid reaction summary');
    }
    final counts = <String, int>{};
    for (final emoji in postReactionEmoji) {
      final count = raw[emoji] ?? 0;
      if (count is! int || count < 0) {
        throw const FormatException('Invalid reaction count');
      }
      counts[emoji] = count;
    }
    return ReactionSummary(Map.unmodifiable(counts), mine as String?);
  }
}

abstract interface class PostReactionsRepository {
  Future<ReactionSummary> load(String id);
  Future<ReactionSummary> set(String id, String? emoji);
}

class PostReactionApi implements PostReactionsRepository {
  final UserApiClient users;
  final String accountId;
  PostReactionApi(this.users) : accountId = users.session.user.id;
  void _checkAccount() {
    if (!users.session.authenticated || users.session.user.id != accountId) {
      throw StateError('Session changed');
    }
  }

  Future<ReactionSummary> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    _checkAccount();
    final data = await users.request(method, path, area: 'posts', body: body);
    _checkAccount();
    return ReactionSummary.fromJson(data);
  }

  @override
  Future<ReactionSummary> load(String id) =>
      _request('GET', '${Uri.encodeComponent(id)}/reactions');
  @override
  Future<ReactionSummary> set(String id, String? emoji) {
    if (emoji != null && !postReactionEmoji.contains(emoji)) {
      throw ArgumentError('Unsupported reaction');
    }
    return _request(
      emoji == null ? 'DELETE' : 'PUT',
      '${Uri.encodeComponent(id)}/reaction',
      body: emoji == null ? null : {'emoji': emoji},
    );
  }
}
