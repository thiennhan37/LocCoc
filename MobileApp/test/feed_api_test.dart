import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  test(
    'feed displays capture time with a fallback for older backend responses',
    () {
      final json = {
        'id': 'post',
        'ownerId': 'owner',
        'mediaKey': 'legacy',
        'authorName': 'Friend',
        'createdAt': '2026-11-18T02:00:00Z',
        'capturedAt': '2026-11-01T00:00:00Z',
        'mine': false,
        'seen': false,
        'mediaType': 0,
      };
      expect(FeedPost.fromJson(json).occurredAt, DateTime.utc(2026, 11, 1));
      json.remove('capturedAt');
      final legacy = FeedPost.fromJson(json);
      expect(legacy.occurredAt, legacy.createdAt);
    },
  );
  String key(int n) =>
      '/posts/media/11111111-1111-4111-8111-${n.toString().padLeft(12, '0')}';
  test(
    'feed requests small previews, shares downloads and bounds its session cache',
    () async {
      final paths = <String>[];
      final pending = Completer<http.Response>();
      final account = fixtures.apiFor((request) async {
        paths.add(request.url.path);
        expect(request.url.queryParameters, {'preview': 'true'});
        expect(request.headers['Authorization'], 'Bearer old-access');
        if (paths.length == 1) return pending.future;
        return http.Response.bytes(
          [255, 216, 255],
          200,
          headers: {'content-type': 'image/jpeg'},
        );
      });
      final api = SessionFeedApi(account);
      final a = api.image(key(1));
      final b = api.image(key(1));
      expect(identical(a, b), isTrue);
      pending.complete(
        http.Response.bytes(
          [255, 216, 255],
          200,
          headers: {'content-type': 'image/jpeg'},
        ),
      );
      await Future.wait([a, b]);
      await api.image(key(1));
      expect(paths.length, 1);
      for (var n = 2; n <= 7; n++) {
        await api.image(key(n));
      }
      await api.image(key(1));
      expect(paths.length, 8);
      account.socialRevision++;
      await api.image(key(1));
      expect(paths.length, 9);
      api.clearImages();
      await api.image(key(1));
      expect(paths.length, 10);
      account.invalidate();
      await expectLater(
        api.image(key(1)),
        throwsA(isA<SessionChangedException>()),
      );
      expect(paths.length, 10);
    },
  );
  test('failed previews can retry instead of caching the failure', () async {
    var calls = 0;
    final api = SessionFeedApi(
      fixtures.apiFor((request) async {
        if (++calls == 1) return http.Response('', 503);
        return http.Response.bytes(
          Uint8List.fromList([255, 216, 255]),
          200,
          headers: {'content-type': 'image/jpeg'},
        );
      }),
    );
    await expectLater(api.image(key(1)), throwsA(isA<AuthApiException>()));
    expect(await api.image(key(1)), [255, 216, 255]);
    expect(calls, 2);
  });
  test(
    'feed refreshes expired token including numeric Spring error codes',
    () async {
      var requests = 0, refreshes = 0;
      final auth = AuthApiClient(
        httpClient: MockClient((request) async {
          requests++;
          if (request.headers['Authorization'] == 'Bearer old-access') {
            return fixtures.json({'code': 1001}, 401);
          }
          expect(request.headers['Authorization'], 'Bearer renewed');
          if (request.method == 'GET') {
            expect(request.url.path, '/posts/feed');
            expect(request.url.queryParameters['cursor'], 'opaque+cursor');
            return fixtures.json({'data': [], 'nextCursor': null});
          }
          expect(request.method, 'PUT');
          expect(request.url.path, '/posts/post-id/seen');
          return fixtures.json({}, 204);
        }),
      );
      final account = UserApiClient(
        auth: auth,
        session: fixtures.session,
        refreshSession: (session) async {
          refreshes++;
          return AuthSession.fromJson({
            ...session.toJson(),
            'accessToken': 'renewed',
          });
        },
      );
      final api = SessionFeedApi(account);
      expect((await api.page(cursor: 'opaque+cursor')).data, isEmpty);
      await api.seen('post-id');
      expect(refreshes, 1);
      expect(requests, 3);
      expect(
        () => api.imageUri('https://untrusted.example/a.png'),
        throwsFormatException,
      );
    },
  );
}
