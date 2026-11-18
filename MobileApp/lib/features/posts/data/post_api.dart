import '../../users/data/user_api_client.dart';
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
    final current = session;
    if (current == null ||
        !current.session.authenticated ||
        current.session.accessToken.isEmpty ||
        current.session.accessToken.startsWith('demo-') ||
        current.session.user.id != ownerId) {
      throw const ApiException(
        'Hãy đăng nhập đúng tài khoản để gửi ảnh.',
        statusCode: 401,
      );
    }
    final response = await current.request(
      'POST',
      'photos',
      area: 'posts',
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

  final UserApiClient? session;
  PostApi({this.session});

  // Legacy metadata writes also require a live authenticated session.
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
    return _authenticated(ownerId).request(
      'POST',
      '',
      area: 'posts',
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

  UserApiClient _authenticated(String ownerId) {
    final current = session;
    if (current == null ||
        !current.isCurrent ||
        !current.session.authenticated ||
        current.session.user.id != ownerId) {
      throw const ApiException(
        'Hãy đăng nhập đúng tài khoản.',
        statusCode: 401,
      );
    }
    return current;
  }

  Future<void> delete({required String postId, required String ownerId}) async {
    if (!RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(postId)) {
      throw const ApiException('Bài đăng không hợp lệ.');
    }
    await _authenticated(ownerId).request('DELETE', postId, area: 'posts');
  }
}
