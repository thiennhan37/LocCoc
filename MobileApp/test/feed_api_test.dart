import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/posts/data/feed_api.dart';
import 'user_social_test.dart' as fixtures;

void main() {
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
