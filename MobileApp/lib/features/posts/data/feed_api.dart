import 'dart:typed_data';
import '../../../core/constants/api_constants.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../../users/data/user_api_client.dart';

class FeedPost {
  final String id, ownerId, mediaKey, authorName;
  final String? caption;
  final DateTime createdAt;
  final DateTime? capturedAt;
  DateTime get occurredAt => capturedAt ?? createdAt;
  final bool mine, seen;
  final int mediaType;
  const FeedPost({
    required this.id,
    required this.ownerId,
    required this.mediaKey,
    required this.authorName,
    required this.caption,
    required this.createdAt,
    this.capturedAt,
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
    capturedAt: DateTime.tryParse(json['capturedAt'] as String? ?? ''),
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

abstract interface class ProtectedFeedImages {
  Future<Uint8List> image(String key);
}

abstract interface class FeedImageCache {
  void clearImages();
}

class SessionFeedApi implements FeedApi, ProtectedFeedImages, FeedImageCache {
  final UserApiClient account;
  final _images = <String, Future<Uint8List>>{};
  static const _maxImages = 6;
  int? _socialRevision;
  SessionFeedApi(this.account);
  @override
  void clearImages() => _images.clear();
  @override
  Future<FeedPage> page({String? cursor, String? ownerId}) async {
    final path = ApiConstants.feedPath.substring('/posts/'.length);
    final query = Uri(
      queryParameters: {
        'limit': ownerId == null ? '20' : '10',
        'cursor': ?cursor,
        'ownerId': ?ownerId,
      },
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
  Future<Uint8List> image(String key) {
    imageUri(key); // Validate fixed relative route before sending credentials.
    if (!account.isCurrent) {
      clearImages();
      return Future.error(const SessionChangedException());
    }
    if (_socialRevision != account.socialRevision) {
      clearImages();
      _socialRevision = account.socialRevision;
    }
    final cached = _images.remove(key);
    if (cached != null) {
      _images[key] = cached;
      return cached;
    }
    late final Future<Uint8List> pending;
    pending = account
        .postImage(key.split('/').last, preview: true)
        .then(
          (bytes) {
            if (!account.isCurrent) throw const SessionChangedException();
            return bytes;
          },
          onError: (Object error, StackTrace stack) {
            if (identical(_images[key], pending)) _images.remove(key);
            Error.throwWithStackTrace(error, stack);
          },
        );
    _images[key] = pending;
    while (_images.length > _maxImages) {
      _images.remove(_images.keys.first);
    }
    return pending;
  }

  @override
  Uri imageUri(String key) {
    if (!RegExp(r'^/posts/media/[a-fA-F0-9-]{36}$').hasMatch(key)) {
      throw const FormatException('Unsupported local media');
    }
    return Uri.parse(account.auth.origin).resolve(key);
  }
}
