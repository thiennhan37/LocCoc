import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/core/constants/api_constants.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/chat/data/chat_api.dart';
import 'package:mobile_app/features/chat/presentation/chat_controller.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'chat_controller_test.dart' as fixtures;

const session = AuthSession(
  authenticated: true,
  user: AuthUser(id: 'me', role: 'user', status: 'active'),
  accessToken: 'old',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 3600,
);
http.Response json(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json'},
);
void main() {
  test(
    'chat REST reuses Bearer client and sends only idempotency ID and normalized text',
    () async {
      final requests = <http.Request>[];
      final client = UserApiClient(
        auth: AuthApiClient(
          baseUrl: 'http://localhost:8080',
          httpClient: MockClient((request) async {
            requests.add(request);
            return json({
              'message': fixtures.message('9007199254740993').toJson(),
            });
          }),
        ),
        session: session,
      );
      final result = await ChatApi(
        client,
      ).send('conversation', 'client-1', '  Xin chào 👋  ');
      expect(result.sequence, BigInt.parse('9007199254740993'));
      final request = requests.single;
      expect(request.url.path, '/chat/conversations/conversation/messages');
      expect(request.headers['Authorization'], 'Bearer old');
      expect(jsonDecode(request.body), {
        'clientMessageId': 'client-1',
        'text': 'Xin chào 👋',
      });
    },
  );
  test(
    'socket auth probe and REST failures share one session refresh',
    () async {
      var refreshes = 0;
      final refreshing = Completer<AuthSession>();
      final users = UserApiClient(
        session: session,
        refreshSession: (_) {
          refreshes++;
          return refreshing.future;
        },
        auth: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.headers['Authorization'] == 'Bearer old') {
              return json({}, 401);
            }
            return request.url.path.endsWith('/me')
                ? json({'id': 'me'})
                : json({'data': [], 'nextCursor': null});
          }),
        ),
      );
      final api = ChatApi(users);
      final results = Future.wait([api.refreshForSocket(), api.inbox()]);
      await fixtures.flush();
      refreshing.complete(
        AuthSession.fromJson({...session.toJson(), 'accessToken': 'fresh'}),
      );
      await results;
      expect(refreshes, 1);
      expect(api.accessToken, 'fresh');
    },
  );
  test(
    'socket URL selects direct port and preserves explicit deployment origin',
    () {
      expect(
        ApiConstants.resolveChatSocketUrl(
          apiBaseUrl: 'http://127.0.0.1:8080',
          android: true,
          explicitApi: false,
        ),
        'http://10.0.2.2:8083',
      );
      expect(
        ApiConstants.resolveChatSocketUrl(
          apiBaseUrl: 'http://127.0.0.1:8080',
          explicitApi: false,
        ),
        'http://127.0.0.1:8083',
      );
      expect(
        ApiConstants.resolveChatSocketUrl(
          apiBaseUrl: 'https://example.com:8443/api',
        ),
        'https://example.com:8083',
      );
      expect(
        ApiConstants.resolveChatSocketUrl(
          apiBaseUrl: 'http://localhost:8080',
          override: 'https://chat.example.com/',
        ),
        'https://chat.example.com',
      );
    },
  );
  test('generated message identities are distinct RFC4122 v4 UUIDs', () {
    final ids = List.generate(40, (_) => newChatMessageId());
    expect(ids.toSet(), hasLength(40));
    for (final id in ids) {
      expect(
        id,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    }
  });
}
