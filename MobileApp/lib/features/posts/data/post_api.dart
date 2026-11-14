import '../../../core/constants/api_constants.dart';
import 'dart:convert';
import 'dart:typed_data';
import '../../../core/network/api_client.dart';

class PostApi {
  Future<Map<String, dynamic>> publishPhoto({
    required String ownerId,
    required String requestId,
    required Uint8List png,
    String caption = '',
  }) async {
    if (png.isEmpty ||
        png.length > 5 * 1024 * 1024 ||
        caption.length > 200 ||
        ownerId.isEmpty) {
      throw const ApiException(
        'Ảnh hoặc tin nhắn không hợp lệ. Ảnh tối đa 5 MB.',
      );
    }
    final response = await _client.request(
      'POST',
      baseUrl.resolve(ApiConstants.photoPostsPath),
      body: {
        'requestId': requestId,
        'ownerId': ownerId,
        'imageBase64': base64Encode(png),
        'caption': caption,
      },
    );
    if (response['id'] != requestId || response['mediaKey'] is! String) {
      throw const ApiException('Phản hồi gửi ảnh không hợp lệ. Hãy thử lại.');
    }
    return response;
  }

  final Uri baseUrl;
  final ApiClient _client;
  PostApi({Uri? baseUrl, ApiClient? client})
    : baseUrl = baseUrl ?? Uri.parse(ApiConstants.baseUrl),
      _client = client ?? ApiClient();

  // Metadata for media already uploaded; backend currently accepts ownerId without JWT.
  Future<Map<String, dynamic>> create({
    required String ownerId,
    required String mediaKey,
    required int mediaType,
    String? thumbKey,
    String? caption,
    int? width,
    int? height,
  }) {
    if (ownerId.isEmpty ||
        mediaKey.trim().isEmpty ||
        mediaKey.length > 500 ||
        (mediaType != 0 && mediaType != 1) ||
        (caption?.length ?? 0) > 200 ||
        (thumbKey?.length ?? 0) > 500 ||
        (width != null && width <= 0) ||
        (height != null && height <= 0)) {
      throw const ApiException('Dữ liệu bài đăng không hợp lệ.');
    }
    return _client.request(
      'POST',
      baseUrl.resolve(ApiConstants.postsPath),
      body: {
        'ownerId': ownerId,
        'mediaKey': mediaKey,
        'mediaType': mediaType,
        'thumbKey': ?thumbKey,
        'caption': ?caption,
        'width': ?width,
        'height': ?height,
      },
    );
  }

  Future<void> delete({required String postId, required String ownerId}) async {
    if (postId.isEmpty || ownerId.isEmpty) {
      throw const ApiException('Thiếu mã bài đăng hoặc chủ bài.');
    }
    final uri = baseUrl
        .resolve('${ApiConstants.postsPath}/${Uri.encodeComponent(postId)}')
        .replace(queryParameters: {'ownerId': ownerId});
    await _client.request('DELETE', uri);
  }
}
