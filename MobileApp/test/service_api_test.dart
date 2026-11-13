import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/api_client.dart';
import 'package:mobile_app/features/auth/data/auth_api.dart';
import 'package:mobile_app/features/posts/data/post_api.dart';

class RecordingClient extends ApiClient {
  final calls = <Map<String, dynamic>>[];
  Map<String, dynamic> response = {};
  ApiException? failure;
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Uri uri, {
    Map<String, dynamic>? body,
    String? token,
  }) async {
    calls.add({'method': method, 'uri': uri, 'body': body, 'token': token});
    if (failure != null) throw failure!;
    return response;
  }
}

void main() {
  setUp(AuthApi.clearSession);
  test(
    'photo upload encodes bytes and preserves request ID through API',
    () async {
      final client = RecordingClient()
        ..response = {
          'id': 'request-id',
          'mediaKey': '/posts/media/request-id',
        };
      final api = PostApi(client: client);
      final png = Uint8List.fromList([137, 80, 78, 71]);
      await api.publishPhoto(
        ownerId: 'owner',
        requestId: 'request-id',
        png: png,
        caption: 'Chào',
      );
      expect((client.calls.single['uri'] as Uri).path, '/posts/photos');
      expect(client.calls.single['body'], {
        'ownerId': 'owner',
        'requestId': 'request-id',
        'imageBase64': base64Encode(png),
        'caption': 'Chào',
      });
      client.response = {
        'id': 'unexpected',
        'mediaKey': '/posts/media/unexpected',
      };
      await expectLater(
        api.publishPhoto(ownerId: 'owner', requestId: 'request-id', png: png),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test(
    'register and OTP requests match backend and false is not success',
    () async {
      final client = RecordingClient();
      final api = AuthApi(client: client);
      await api.register(email: ' a@example.test ', password: 'secret');
      expect((client.calls.last['uri'] as Uri).path, '/auth/register');
      expect(client.calls.last['body'], {
        'email': 'a@example.test',
        'password': 'secret',
      });
      client.response = {'verified': false};
      expect(
        await api.verifyOtp(email: 'a@example.test', otp: '123456'),
        false,
      );
      expect(client.calls.last['token'], isNull);
      await api.resendOtp(phone: '+84912345678');
      expect(client.calls.last['body'], {
        'phone': '+84912345678',
        'channel': 'phone',
      });
    },
  );
  test(
    'refresh coalesces calls and rotates credentials; password change rotates again',
    () async {
      final client = RecordingClient()
        ..response = {
          'accessToken': 'new-access',
          'refreshToken': 'new-refresh',
        };
      final api = AuthApi(client: client);
      AuthApi.accessToken = 'old-access';
      AuthApi.refreshToken = 'old-refresh';
      await Future.wait([api.refresh(), api.refresh()]);
      expect(client.calls.length, 1);
      expect(client.calls.single['body'], {'refreshToken': 'old-refresh'});
      expect(AuthApi.accessToken, 'new-access');
      client.response = {
        'accessToken': 'changed-access',
        'refreshToken': 'changed-refresh',
      };
      await api.changePassword(
        currentPassword: 'old',
        newPassword: 'new-password',
      );
      expect(client.calls.last['token'], 'new-access');
      expect(AuthApi.refreshToken, 'changed-refresh');
      await api.logoutAll();
      expect((client.calls.last['uri'] as Uri).path, '/auth/logout-all');
      expect(client.calls.last['token'], 'changed-access');
      expect(AuthApi.accessToken, isNull);
    },
  );
  test(
    'failed refresh clears rejected session, server failure preserves it',
    () async {
      final client = RecordingClient()
        ..failure = const ApiException('server', statusCode: 503);
      final api = AuthApi(client: client);
      AuthApi.refreshToken = 'token';
      await expectLater(api.refresh(), throwsA(isA<ApiException>()));
      expect(AuthApi.refreshToken, 'token');
      client.failure = const ApiException('expired', statusCode: 401);
      await expectLater(api.refresh(), throwsA(isA<ApiException>()));
      expect(AuthApi.refreshToken, isNull);
    },
  );
  test(
    'post metadata and encoded delete query use post routes without auth',
    () async {
      final client = RecordingClient();
      final api = PostApi(client: client);
      await api.create(
        ownerId: 'owner',
        mediaKey: 'photos/a.jpg',
        mediaType: 0,
        caption: 'Hello',
      );
      expect((client.calls.last['uri'] as Uri).path, '/posts');
      expect(client.calls.last['body'], {
        'ownerId': 'owner',
        'mediaKey': 'photos/a.jpg',
        'mediaType': 0,
        'caption': 'Hello',
      });
      await api.delete(postId: 'post-id', ownerId: 'owner');
      expect(client.calls.last['method'], 'DELETE');
      expect((client.calls.last['uri'] as Uri).queryParameters, {
        'ownerId': 'owner',
      });
      expect(client.calls.last['token'], isNull);
    },
  );
}
