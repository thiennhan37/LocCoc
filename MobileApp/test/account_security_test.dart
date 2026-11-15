import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/account_security.dart';
import 'package:mobile_app/features/auth/domain/password_policy.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/notifications/data/notification_api.dart';
import 'package:mobile_app/features/notifications/data/push_notifications.dart';
import 'remembered_accounts_test.dart' as f;

Map<String, dynamic> replacementPair([String id = 'a']) =>
    {...f.session(id, 'password-changed').toJson()}
      ..remove('user')
      ..remove('authenticated');

class SecurityBackend extends f.Api {
  Future<Map<String, dynamic>> Function(
    String,
    String,
    String,
    Map<String, dynamic>?,
  )?
  handler;
  int passwordCalls = 0, logoutAllCalls = 0;
  final tokens = <String>[];
  @override
  Future<Map<String, dynamic>> serviceRequest(
    String method,
    String area,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async {
    tokens.add(accessToken);
    if (path == 'change-password') passwordCalls++;
    if (path == 'logout-all') logoutAllCalls++;
    if (handler != null) return handler!(area, path, accessToken, body);
    if (path == 'change-password') return replacementPair();
    if (path == 'logout-all') return {'revokedSessions': 3};
    if (area == 'notifications') return {'unseenCount': 0, 'unreadCount': 0};
    if (path == 'sessions?limit=1') return {'items': []};
    if (path == 'me/social-summary') return {'friendCount': 0};
    return {
      'id': 'a',
      'username': 'alice',
      'displayName': 'Alice',
      'avatarUrl': null,
    };
  }
}

void main() {
  late f.MemoryVault memory;
  late SecurityBackend backend;
  late GoogleAuthService auth;
  late UserApiClient api;
  Future<void> setup({bool retain = true}) async {
    memory = f.MemoryVault();
    backend = SecurityBackend();
    auth = f.service(memory.open(), backend);
    await auth.vault.remember(
      f.session('b'),
      remember: true,
      retain: true,
      active: false,
    );
    await auth.acceptLogin(f.session('a'), remember: true, retain: retain);
    api = UserApiClient(
      auth: backend,
      session: auth.session!,
      coordinator: auth,
      onSessionChanged: auth.updateSession,
    );
  }

  setUp(() => setup());

  test(
    'password policy follows DTO plus known server rules without invented composition rules',
    () {
      expect(newPasswordError('short', 'a@example.com'), isNotNull);
      expect(newPasswordError('x' * 129, 'a@example.com'), isNotNull);
      expect(
        newPasswordError('Password123!', 'a@example.com'),
        contains('phổ biến'),
      );
      expect(
        newPasswordError('accountname', 'accountname@example.com'),
        contains('trùng email'),
      );
      expect(
        newPasswordError('a@example.com', 'a@example.com'),
        contains('trùng email'),
      );
      expect(
        newPasswordError('long pass phrase without digits', 'a@example.com'),
        isNull,
      );
    },
  );

  for (final retain in [true, false]) {
    test(
      'strict password pair preserves identity and ${retain ? 'retained' : 'identity-only'} consent',
      () async {
        await setup(retain: retain);
        final current = auth.session!;
        final generation = auth.generation;
        final event = await api.changePassword(
          'current-password',
          'new pass phrase 2026',
        );
        expect(event.session.user, same(current.user));
        expect(auth.session!.user.email, 'a@example.com');
        expect(auth.session!.accessToken, 'access-a-password-changed');
        expect(event.previousGeneration, generation);
        expect(api.isCurrent, isFalse);
        expect(auth.generation, generation + 1);
        final saved = await auth.vault.list();
        expect(saved.singleWhere((a) => a.id == 'a').canContinue, retain);
        expect(saved.singleWhere((a) => a.id == 'b').canContinue, isTrue);
        final raw = memory.values.values.single;
        expect(raw.contains('refresh-a-password-changed'), retain);
        expect(raw, isNot(contains('access-a-password-changed')));
        expect(raw, isNot(contains('current-password')));
        expect(auth.claimSessionReplacement(), isTrue);
        expect(auth.claimSessionReplacement(), isFalse);
        final nextApi = UserApiClient(
          auth: backend,
          session: event.session,
          coordinator: auth,
        );
        await nextApi.me();
        expect(backend.tokens.last, event.session.accessToken);
      },
    );
  }

  test(
    'wrong current password probes live session; no refresh, logout or credential loss',
    () async {
      backend.handler = (_, path, _, _) async {
        if (path == 'change-password') throw const AuthApiException(401);
        return {'items': []};
      };
      await expectLater(
        api.changePassword('wrong', 'new pass phrase'),
        throwsA(isA<AuthApiException>()),
      );
      expect(backend.passwordCalls, 1);
      expect(backend.refreshCalls, 0);
      expect(auth.session, same(api.session));
      expect(auth.sessionEnded.value, isNull);
      expect(auth.sessionReplaced.value, isNull);
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'a').canContinue,
        isTrue,
      );
      backend.handler = null;
      await auth.refreshSession(auth.session!);
      expect(backend.refreshCalls, 1); // Security-operation gate was released.
    },
  );

  test(
    'unavailable password probe is nonterminal and not an ambiguous committed mutation',
    () async {
      backend.handler = (_, path, _, _) async {
        if (path == 'change-password') throw const AuthApiException(401);
        throw const SocketException('private probe detail');
      };
      await expectLater(
        api.changePassword('wrong', 'new pass phrase'),
        throwsA(isA<SessionProbeUnavailableException>()),
      );
      expect(backend.refreshCalls, 0);
      expect(auth.session, isNotNull);
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'a').canContinue,
        isTrue,
      );
    },
  );

  for (final status in [400, 403, 409, 422, 429]) {
    test('password $status remains a form/policy/rate-limit error', () async {
      final error = AuthApiException(status);
      backend.handler = (_, _, _, _) async => throw error;
      await expectLater(
        api.changePassword('current', 'new pass phrase'),
        throwsA(same(error)),
      );
      expect(auth.session, same(api.session));
      expect(auth.sessionEnded.value, isNull);
      expect(backend.refreshCalls, 0);
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'a').canContinue,
        isTrue,
      );
    });
  }

  test(
    'expired access on password operation refreshes once inside the same coordinator',
    () async {
      backend.handler = (_, path, token, _) async {
        if (token == f.session('a').accessToken) {
          throw const AuthApiException(401);
        }
        if (path == 'change-password') return replacementPair();
        return {};
      };
      final event = await api.changePassword('current', 'new pass phrase');
      expect(backend.refreshCalls, 1);
      expect(backend.passwordCalls, 2);
      expect(event.session.accessToken, 'access-a-password-changed');
      expect(backend.tokens.last, 'access-a-rotated-1');
    },
  );

  for (final error in [
    TimeoutException('lost response'),
    const SocketException('offline'),
    const AuthApiException(503),
  ]) {
    test(
      'ambiguous ${error.runtimeType} password response never retries or reuses old RT',
      () async {
        backend.handler = (_, _, _, _) async => throw error;
        await expectLater(
          api.changePassword('current', 'new pass phrase'),
          throwsA(isA<PasswordChangeUncertainException>()),
        );
        expect(backend.passwordCalls, 1);
        expect(auth.session, same(api.session));
        expect(auth.sessionEnded.value, isNull);
        expect(auth.sessionReplaced.value, isNull);
        await expectLater(auth.refreshSession(auth.session!), throwsStateError);
        await expectLater(
          auth.leaveRetainingSession(auth.session!),
          throwsStateError,
        );
        expect(backend.refreshCalls, 0);
        final rows = await auth.vault.list();
        expect(rows.singleWhere((a) => a.id == 'a').canContinue, isFalse);
        expect(rows.singleWhere((a) => a.id == 'b').canContinue, isTrue);
      },
    );
  }

  for (final data in [
    <String, dynamic>{},
    {
      ...replacementPair(),
      'user': {'id': 'foreign'},
    },
    {...replacementPair(), 'refreshToken': f.session('a').refreshToken},
    {...replacementPair(), 'expiresIn': 0},
  ]) {
    test(
      'malformed or mismatched success cannot fabricate a replacement session (${data.keys.join(',')})',
      () async {
        backend.handler = (_, _, _, _) async => data;
        await expectLater(
          api.changePassword('current', 'new pass phrase'),
          throwsA(isA<PasswordChangeUncertainException>()),
        );
        expect(auth.session, same(api.session));
        expect(auth.sessionReplaced.value, isNull);
        expect(backend.passwordCalls, 1);
      },
    );
  }

  test(
    'server-acknowledged password change survives storage failure with an honest warning',
    () async {
      memory.failWrite = true;
      final event = await api.changePassword('current', 'new pass phrase');
      expect(event.retentionConfirmed, isFalse);
      expect(event.notice, contains('Đã đổi mật khẩu'));
      expect(event.notice, contains('chưa xác nhận lưu phiên'));
      expect(auth.session!.accessToken, 'access-a-password-changed');
      expect(backend.passwordCalls, 1);
      expect(
        memory.values.values.single,
        isNot(contains('refresh-a-password-changed')),
      );
    },
  );

  test(
    'password waits for existing refresh and uses its rotated access token',
    () async {
      backend.barrier = Completer<void>();
      final refresh = auth.refreshSession(auth.session!);
      final change = api.changePassword('current', 'new pass phrase');
      await Future<void>.delayed(Duration.zero);
      expect(backend.passwordCalls, 0);
      expect(backend.refreshCalls, 1);
      backend.barrier!.complete();
      await refresh;
      await change;
      expect(backend.tokens.last, 'access-a-rotated-1');
    },
  );

  test(
    'refresh during password POST shares replacement instead of rotating revoked RT',
    () async {
      final reply = Completer<Map<String, dynamic>>();
      backend.handler = (_, _, _, _) => reply.future;
      final change = api.changePassword('current', 'new pass phrase');
      await Future<void>.delayed(Duration.zero);
      final refresh = auth.refreshSession(api.session);
      await Future<void>.delayed(Duration.zero);
      expect(backend.refreshCalls, 0);
      reply.complete(replacementPair());
      final event = await change;
      expect((await refresh).accessToken, event.session.accessToken);
      expect(backend.refreshCalls, 0);
    },
  );

  test(
    'failed preexisting refresh prevents a password POST from being sent',
    () async {
      backend.barrier = Completer<void>();
      backend.refreshError = TimeoutException('rotation response unavailable');
      final failedRefresh = expectLater(
        auth.refreshSession(auth.session!),
        throwsA(isA<TimeoutException>()),
      );
      final failedChange = expectLater(
        api.changePassword('current', 'new pass phrase'),
        throwsA(isA<TimeoutException>()),
      );
      await Future<void>.delayed(Duration.zero);
      backend.barrier!.complete();
      await Future.wait([failedRefresh, failedChange]);
      expect(backend.passwordCalls, 0);
      expect(auth.sessionReplaced.value, isNull);
    },
  );

  test(
    'concurrent security mutations are rejected before another request is sent',
    () async {
      final reply = Completer<Map<String, dynamic>>();
      backend.handler = (_, _, _, _) => reply.future;
      final change = api.changePassword('current', 'new pass phrase');
      await expectLater(
        api.logoutAll(),
        throwsA(isA<AccountSecurityBusyException>()),
      );
      await expectLater(
        api.changePassword('current', 'another pass phrase'),
        throwsA(isA<AccountSecurityBusyException>()),
      );
      expect(backend.logoutAllCalls, 0);
      expect(backend.passwordCalls, 1);
      reply.complete(replacementPair());
      await change;
    },
  );

  test(
    'old read cannot return private data after password replacement',
    () async {
      final reply = Completer<Map<String, dynamic>>();
      backend.handler = (_, path, _, _) async =>
          path == 'me' ? reply.future : replacementPair();
      final rejected = expectLater(
        api.me(),
        throwsA(isA<SessionChangedException>()),
      );
      await api.changePassword('current', 'new pass phrase');
      reply.complete({'old': 'private profile'});
      await rejected;
      expect(api.isCurrent, isFalse);
    },
  );

  for (final sameAccount in [false, true]) {
    test(
      'password response cannot overwrite ${sameAccount ? 'same-account relogin' : 'switched account'}',
      () async {
        final reply = Completer<Map<String, dynamic>>();
        backend.handler = (_, _, _, _) => reply.future;
        final rejected = expectLater(
          api.changePassword('current', 'new pass phrase'),
          throwsA(isA<SessionChangedException>()),
        );
        await Future<void>.delayed(Duration.zero);
        final next = f.session(sameAccount ? 'a' : 'b', 'new-login');
        await auth.acceptLogin(next, remember: true, retain: true);
        reply.complete(replacementPair());
        await rejected;
        expect(auth.session, same(next));
        expect(auth.sessionReplaced.value, isNull);
        expect(memory.values.values.single, contains(next.refreshToken));
      },
    );
  }

  test('logout during password POST invalidates late replacement', () async {
    final reply = Completer<Map<String, dynamic>>();
    backend.handler = (_, _, _, _) => reply.future;
    final rejected = expectLater(
      api.changePassword('current', 'new pass phrase'),
      throwsA(isA<SessionChangedException>()),
    );
    await Future<void>.delayed(Duration.zero);
    await auth.clearRevokedSession(api.session);
    reply.complete(replacementPair());
    await rejected;
    expect(auth.session, isNull);
    expect(auth.sessionReplaced.value, isNull);
  });

  test('new push registration waits for old in-flight PUT to finish', () async {
    final oldPut = Completer<Map<String, dynamic>>();
    final started = Completer<void>();
    final order = <String>[];
    backend.handler = (area, path, token, _) async {
      if (area == 'notifications') {
        if (token == f.session('a').accessToken) {
          order.add('old-start');
          started.complete();
          await oldPut.future;
          order.add('old-finished');
          return {};
        }
        order.add('new-registration');
        return {};
      }
      return replacementPair();
    };
    final oldPush = PushNotifications(NotificationApi(api), (_) {}, () {})
      ..installation = 'device';
    final registering = oldPush.register('old-device-token');
    await started.future;
    auth.addReplacementCleanup(() async {
      oldPush.dispose();
      await oldPush.settleRegistration();
    });
    final change = api.changePassword('current', 'new pass phrase');
    await Future<void>.delayed(Duration.zero);
    expect(auth.sessionReplaced.value, isNull);
    oldPut.complete({});
    await registering;
    final event = await change;
    final nextApi = UserApiClient(
      auth: backend,
      session: event.session,
      coordinator: auth,
    );
    final nextPush = PushNotifications(NotificationApi(nextApi), (_) {}, () {})
      ..installation = 'device';
    await nextPush.register('new-device-token');
    expect(order, ['old-start', 'old-finished', 'new-registration']);
    nextPush.dispose();
  });

  test(
    'logout-all clears only current credentials, retains identity and other account',
    () async {
      await api.logoutAll();
      expect(backend.logoutAllCalls, 1);
      expect(auth.session, isNull);
      expect(api.isCurrent, isFalse);
      final rows = await auth.vault.list();
      expect(rows.singleWhere((a) => a.id == 'a').canContinue, isFalse);
      expect(rows.singleWhere((a) => a.id == 'b').canContinue, isTrue);
      expect(auth.claimSessionEnd(), isTrue);
      expect(auth.claimSessionEnd(), isFalse);
    },
  );
  test(
    'logout-all 503 retains current session and never reports confirmed revocation',
    () async {
      backend.handler = (_, _, _, _) async => throw const AuthApiException(503);
      await expectLater(api.logoutAll(), throwsA(isA<AuthApiException>()));
      expect(auth.session, same(api.session));
      expect(auth.sessionEnded.value, isNull);
      expect(
        (await auth.vault.list()).singleWhere((a) => a.id == 'a').canContinue,
        isTrue,
      );
    },
  );

  test(
    'logout-all refreshes expired access once and then uses confirmed teardown',
    () async {
      backend.handler = (_, _, token, _) async {
        if (token == f.session('a').accessToken) {
          throw const AuthApiException(401);
        }
        return {'revokedSessions': 2};
      };
      await api.logoutAll();
      expect(backend.refreshCalls, 1);
      expect(backend.logoutAllCalls, 2);
      expect(auth.session, isNull);
      expect(auth.sessionEnded.value, isNotNull);
    },
  );
}
