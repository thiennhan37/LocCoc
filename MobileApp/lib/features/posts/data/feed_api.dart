import '../../../core/constants/api_constants.dart';
import '../../users/data/user_api_client.dart';

class FeedPost {
  final String id, ownerId, mediaKey, authorName;
  final String? caption;
  final DateTime createdAt;
  final bool mine, seen;
  final int mediaType;
  const FeedPost({
    required this.id,
    required this.ownerId,
    required this.mediaKey,
    required this.authorName,
    required this.caption,
    required this.createdAt,
    required this.mine,
    required this.seen,
    required this.mediaType,
  });
  factory FeedPost.fromJson(Map<String, dynamic> json) => FeedPost(
    id: json['id'] as String,
    ownerId: json['ownerId'] as String,
    mediaKey: json['mediaKey'] as String,
    authorName: json['authorName'] as String,
    caption: json['caption'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
    mine: json['mine'] as bool,
    seen: json['seen'] as bool,
    mediaType: json['mediaType'] as int,
  );
}

class FeedPage {
  final List<FeedPost> data;
  final String? nextCursor;
  const FeedPage(this.data, this.nextCursor);
}

abstract interface class FeedApi {
  Future<FeedPage> page({String? cursor});
  Future<void> seen(String id);
  Uri imageUri(String key);
}

class SessionFeedApi implements FeedApi {
  final UserApiClient account;
  SessionFeedApi(this.account);
  @override
  Future<FeedPage> page({String? cursor}) async {
    final path = ApiConstants.feedPath.substring('/posts/'.length);
    final query = Uri(
      queryParameters: {'limit': '20', 'cursor': ?cursor},
    ).query;
    final json = await account.request('GET', '$path?$query', area: 'posts');
    final rows = json['data'];
    if (rows is! List) throw const FormatException('Invalid feed');
    return FeedPage(
      rows
          .map((row) => FeedPost.fromJson(row as Map<String, dynamic>))
          .toList(),
      json['nextCursor'] as String?,
    );
  }

  @override
  Future<void> seen(String id) async {
    await account.request(
      'PUT',
      ApiConstants.seenPath(id).substring('/posts/'.length),
      area: 'posts',
    );
  }

  @override
  Uri imageUri(String key) {
    if (!RegExp(r'^/posts/media/[a-fA-F0-9-]{36}$').hasMatch(key)) {
      throw const FormatException('Unsupported local media');
    }
    return Uri.parse(account.auth.origin).resolve(key);
  }
}
