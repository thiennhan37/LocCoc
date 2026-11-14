import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'package:mobile_app/features/users/presentation/profile_gate.dart';

const session = AuthSession(
  authenticated: true,
  user: AuthUser(
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@test.example',
    role: 'user',
    status: 'active',
  ),
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 3600,
);
Map<String, dynamic> peer(
  String name, {
  String status = 'NONE',
  String? requestId,
}) => {
  'id': name,
  'username': name,
  'displayName': 'Name $name',
  'avatarUrl': null,
  'relationshipStatus': status,
  'friendRequestId': requestId,
};
http.Response json(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json'},
);
UserApiClient apiFor(Future<http.Response> Function(http.Request) handler) =>
    UserApiClient(
      auth: AuthApiClient(httpClient: MockClient(handler)),
      session: session,
    );

void main() {
  testWidgets(
    'requires one-time username before home and normalizes uppercase',
    (tester) async {
      var claimed = false;
      final api = apiFor((request) async {
        if (request.method == 'POST') {
          expect(jsonDecode(request.body)['username'], 'an');
          claimed = true;
          return json({'username': 'an'}, 201);
        }
        return json({
          'id': session.user.id,
          'username': claimed ? 'an' : null,
          'displayName': 'Tên hiển thị',
          'avatarUrl': null,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: ProfileGate(
            session: session,
            authService: GoogleAuthService(apiClient: api.auth),
            userApi: api,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Chọn username của bạn'), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      await tester.enterText(find.byKey(const Key('username')), 'AN');
      await tester.tap(find.text('Lưu username'));
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsOneWidget);
      await tester.tap(find.text('Cá nhân'));
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsWidgets);
    },
  );
  testWidgets(
    'failed username claim remains on onboarding with a readable conflict',
    (tester) async {
      final api = apiFor(
        (r) async => r.method == 'POST'
            ? json({'code': 'USERNAME_TAKEN'}, 409)
            : json({'id': session.user.id, 'username': null}),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ProfileGate(
            session: session,
            authService: GoogleAuthService(apiClient: api.auth),
            userApi: api,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('username')), 'taken');
      await tester.tap(find.text('Lưu username'));
      await tester.pumpAndSettle();
      expect(find.text('Username đã có người sử dụng.'), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
    },
  );
  testWidgets(
    'debounces search and ignores old responses immediately when text changes',
    (tester) async {
      final old = Completer<http.Response>(),
          fresh = Completer<http.Response>();
      final calls = <String>[];
      final api = apiFor((r) {
        final q = r.url.queryParameters['q']!;
        calls.add(q);
        return q == 'an' ? old.future : fresh.future;
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      final search = find.byKey(const Key('friend-search'));
      await tester.enterText(search, 'a');
      await tester.pump(const Duration(milliseconds: 400));
      expect(calls, isEmpty);
      await tester.enterText(search, 'an');
      await tester.pump(const Duration(milliseconds: 349));
      expect(calls, isEmpty);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();
      expect(calls, ['an']);
      await tester.enterText(search, 'anh');
      old.complete(
        json({
          'data': [peer('old_result')],
          'hasMore': false,
        }),
      );
      await tester.pump();
      expect(find.text('@old_result'), findsNothing);
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump();
      fresh.complete(
        json({
          'data': [peer('anh')],
          'hasMore': false,
        }),
      );
      await tester.pumpAndSettle();
      expect(calls, ['an', 'anh']);
      expect(find.text('@anh'), findsOneWidget);
      expect(find.text('@old_result'), findsNothing);
    },
  );
  testWidgets(
    'loads next page and refreshes Request Sent after sending an invitation',
    (tester) async {
      var sent = false;
      final pages = <String>[];
      final api = apiFor((r) async {
        if (r.method == 'POST') {
          expect(jsonDecode(r.body)['receiverId'], 'an');
          sent = true;
          return json({'id': 'request'}, 201);
        }
        final page = r.url.queryParameters['cursor'] == null ? '1' : '2';
        pages.add(page);
        return json({
          'data': [
            peer(
              page == '1' ? 'an' : 'anh',
              status: sent ? 'OUTGOING_PENDING' : 'NONE',
              requestId: sent ? 'request' : null,
            ),
          ],
          'hasMore': page == '1',
          'nextCursor': page == '1' ? 'search-session:1' : null,
        });
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(pages, ['1', '2']);
      expect(find.text('@anh'), findsOneWidget);
      await tester.tap(find.text('Kết bạn').first);
      await tester.pumpAndSettle();
      expect(find.text('Đã gửi lời mời'), findsOneWidget);
      expect(find.text('Thu hồi'), findsOneWidget);
    },
  );
  testWidgets(
    'incoming requests provide accept and reject and refresh after conflict',
    (tester) async {
      var resolved = false;
      var reads = 0;
      final api = apiFor((r) async {
        if (r.method == 'POST') {
          expect(r.url.path, '/users/friend-requests/request/accept');
          resolved = true;
          return json({'code': 'FRIEND_REQUEST_STATE_CHANGED'}, 409);
        }
        reads++;
        return json({
          'data': resolved
              ? []
              : [
                  {'id': 'request', 'peer': peer('an')},
                ],
          'hasMore': false,
        });
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.tap(find.text('Lời mời đến'));
      await tester.pumpAndSettle();
      expect(find.text('Chấp nhận'), findsOneWidget);
      expect(find.text('Từ chối'), findsOneWidget);
      await tester.tap(find.text('Chấp nhận'));
      await tester.pumpAndSettle();
      expect(reads, 2);
      expect(find.text('@an'), findsNothing);
      expect(
        find.text('Trạng thái đã thay đổi. Danh sách đã được làm mới.'),
        findsOneWidget,
      );
    },
  );
  testWidgets('reloads profile when username was already claimed elsewhere', (
    tester,
  ) async {
    var claimed = false;
    final api = apiFor((r) async {
      if (r.method == 'POST') {
        claimed = true;
        return json({'code': 'USERNAME_ALREADY_SET'}, 409);
      }
      return json({
        'id': session.user.id,
        'username': claimed ? 'other_device_name' : null,
      });
    });
    await tester.pumpWidget(
      MaterialApp(
        home: ProfileGate(
          session: session,
          authService: GoogleAuthService(apiClient: api.auth),
          userApi: api,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('username')), 'my_name');
    await tester.tap(find.text('Lưu username'));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(
      tester.widget<HomeScreen>(find.byType(HomeScreen)).profile!['username'],
      'other_device_name',
    );
  });
  testWidgets('refreshes after each concurrent action on different users', (
    tester,
  ) async {
    final sent = <String>{};
    final pending = {
      'an': Completer<http.Response>(),
      'anh': Completer<http.Response>(),
    };
    final api = apiFor((r) async {
      if (r.method == 'POST') {
        final id = jsonDecode(r.body)['receiverId'] as String;
        final response = await pending[id]!.future;
        sent.add(id);
        return response;
      }
      return json({
        'data': ['an', 'anh']
            .map(
              (name) => peer(
                name,
                status: sent.contains(name) ? 'OUTGOING_PENDING' : 'NONE',
                requestId: 'request_$name',
              ),
            )
            .toList(),
        'hasMore': false,
      });
    });
    await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
    await tester.enterText(find.byKey(const Key('friend-search')), 'an');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kết bạn').first);
    await tester.pump();
    await tester.tap(find.text('Kết bạn').last);
    await tester.pump();
    pending['an']!.complete(json({'id': 'r1'}, 201));
    await tester.pumpAndSettle();
    expect(find.text('Đã gửi lời mời'), findsOneWidget);
    pending['anh']!.complete(json({'id': 'r2'}, 201));
    await tester.pumpAndSettle();
    expect(find.text('Đã gửi lời mời'), findsNWidgets(2));
  });
  test('shares a single refresh across simultaneous user requests', () async {
    var refreshes = 0;
    final auth = AuthApiClient(
      httpClient: MockClient((r) async {
        if (r.url.path == '/auth/refresh') {
          refreshes++;
          return json({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        if (r.headers['Authorization'] == 'Bearer old-access') {
          return json({}, 401);
        }
        expect(r.headers['Authorization'], 'Bearer new-access');
        return json({'id': session.user.id});
      }),
    );
    AuthSession? updated;
    final api = UserApiClient(
      auth: auth,
      session: session,
      onSessionChanged: (s) => updated = s,
    );
    await Future.wait([api.me(), api.me()]);
    expect(refreshes, 1);
    expect(updated!.refreshToken, 'new-refresh');
  });
}
