import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/post_api.dart';
import 'package:mobile_app/core/network/api_client.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  final bytes = Uint8List.fromList([137, 80, 78, 71]);
  test(
    'photo upload requires a session instead of anonymous transport',
    () async {
      await expectLater(
        PostApi().publishPhoto(
          ownerId: fixtures.session.user.id,
          requestId: 'id',
          png: bytes,
        ),
        throwsA(isA<ApiException>()),
      );
    },
  );
  test(
    'upload sends Bearer and refresh retries the exact photo request once',
    () async {
      final uploads = <String>[];
      final tokens = <String?>[];
      var refreshes = 0;
      final session = fixtures.apiFor((r) async {
        if (r.url.path == '/auth/refresh') {
          refreshes++;
          return fixtures.json({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
            'tokenType': 'Bearer',
            'expiresIn': 900,
            'refreshExpiresIn': 3600,
          });
        }
        expect(r.url.path, '/posts/photos');
        uploads.add(r.body);
        tokens.add(r.headers['authorization']);
        if (tokens.length == 1) {
          return fixtures.json({'code': 'UNAUTHENTICATED'}, 401);
        }
        expect(jsonDecode(r.body)['ownerId'], fixtures.session.user.id);
        return fixtures.json({'id': 'id', 'mediaKey': '/posts/media/id'}, 201);
      });
      final result = await PostApi(session: session).publishPhoto(
        ownerId: fixtures.session.user.id,
        requestId: 'id',
        png: bytes,
      );
      expect(result['id'], 'id');
      expect(tokens, ['Bearer old-access', 'Bearer new-access']);
      expect(refreshes, 1);
      expect(uploads[0], uploads[1]);
    },
  );
  test('mismatching account and invalidated session never upload', () async {
    var calls = 0;
    final session = fixtures.apiFor((r) async {
      calls++;
      return fixtures.json({});
    });
    final api = PostApi(session: session);
    await expectLater(
      api.publishPhoto(ownerId: 'somebody-else', requestId: 'id', png: bytes),
      throwsA(isA<ApiException>()),
    );
    session.invalidate();
    await expectLater(
      api.publishPhoto(
        ownerId: fixtures.session.user.id,
        requestId: 'id',
        png: bytes,
      ),
      throwsA(isA<Exception>()),
    );
    expect(calls, 0);
  });
}
