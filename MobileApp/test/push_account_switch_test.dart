import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/notifications/data/notification_api.dart';
import 'package:mobile_app/features/notifications/data/push_notifications.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'remembered_accounts_test.dart' show session;

void main() {
  test(
    'switch waits for outstanding push registration then detaches it',
    () async {
      final put = Completer<http.Response>();
      final putStarted = Completer<void>();
      final methods = <String>[];
      final api = NotificationApi(
        UserApiClient(
          session: session('a'),
          auth: AuthApiClient(
            httpClient: MockClient((request) async {
              methods.add(request.method);
              if (request.method == 'PUT') {
                putStarted.complete();
                return put.future;
              }
              return http.Response('{}', 200);
            }),
          ),
        ),
      );
      final push = PushNotifications(api, (_) {}, () {})
        ..installation = 'installation';
      final registering = push.register('device-token');
      await putStarted.future;
      final detaching = push.unregister(strict: true);
      await Future<void>.delayed(Duration.zero);
      expect(methods, ['PUT']);
      put.complete(http.Response('{}', 200));
      await Future.wait([registering, detaching]);
      await push.register('late-device-token');
      expect(methods, ['PUT', 'DELETE']);
      push.dispose();
    },
  );

  test(
    'failed strict push detach blocks switching and allows registration recovery',
    () async {
      final methods = <String>[];
      final api = NotificationApi(
        UserApiClient(
          session: session('a'),
          auth: AuthApiClient(
            httpClient: MockClient((request) async {
              methods.add(request.method);
              return http.Response(
                '{}',
                request.method == 'DELETE' ? 503 : 200,
              );
            }),
          ),
        ),
      );
      final push = PushNotifications(api, (_) {}, () {})
        ..installation = 'installation';
      await expectLater(
        push.unregister(strict: true),
        throwsA(isA<AuthApiException>()),
      );
      await push.register('device-token');
      expect(methods, ['DELETE', 'PUT']);
      push.dispose();
    },
  );
}
