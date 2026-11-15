import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/auth/presentation/widgets/session_boundary.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';
import 'remembered_accounts_test.dart' as f;

class ControlledApi extends f.Api {
  Completer<void>? logoutBarrier;
  @override
  Future<void> logout({required String accessToken}) async {
    await logoutBarrier?.future;
    await super.logout(accessToken: accessToken);
  }

  Future<Map<String, dynamic>> Function(String, String, String)? handler;
  @override
  Future<Map<String, dynamic>> serviceRequest(
    String method,
    String area,
    String path,
    String accessToken, {
    Map<String, dynamic>? body,
  }) async => handler == null ? {} : handler!(area, path, accessToken);
}

void main() {
  late f.MemoryVault memory;
  late ControlledApi backend;
  late GoogleAuthService auth;
  setUp(() async {
    memory = f.MemoryVault();
    backend = ControlledApi();
    auth = f.service(memory.open(), backend);
    await auth.acceptLogin(f.session('a'), remember: true, retain: true);
  });
  UserApiClient client() => UserApiClient(
    auth: backend,
    session: auth.session!,
    coordinator: auth,
    onSessionChanged: auth.updateSession,
  );

  test('two API clients and a direct refresh share one rotation', () async {
    final first = client(), second = client();
    backend.barrier = Completer<void>();
    backend.handler = (_, _, token) async {
      if (token == f.session('a').accessToken) {
        throw const AuthApiException(401);
      }
      return {'tokenUsed': token};
    };
    final requests = [first.me(), second.me()];
    final force = auth.refreshSession(auth.session!);
    await Future<void>.delayed(Duration.zero);
    expect(backend.refreshCalls, 1);
    backend.barrier!.complete();
    final results = await Future.wait(requests);
    final rotated = await force;
    expect(results.every((r) => r['tokenUsed'] == rotated.accessToken), isTrue);
    expect(first.session.refreshToken, second.session.refreshToken);
    expect(memory.values.values.single, contains(rotated.refreshToken));
    expect(backend.refreshCalls, 1);
  });

  test(
    'wrong current password probes session and never rotates or ends it',
    () async {
      final paths = <String>[];
      backend.handler = (_, path, _) async {
        paths.add(path);
        if (path == 'change-password') throw const AuthApiException(401);
        return {'items': []};
      };
      await expectLater(
        client().request('POST', 'change-password', area: 'auth'),
        throwsA(
          isA<AuthApiException>().having((e) => e.statusCode, 'status', 401),
        ),
      );
      expect(paths, ['change-password', 'sessions?limit=1']);
      expect(backend.refreshCalls, 0);
      expect(auth.session, isNotNull);
      expect(auth.sessionEnded.value, isNull);
    },
  );

  test(
    'expired access on password route rotates once, form rejection stays local',
    () async {
      backend.handler = (_, path, token) async {
        if (path == 'change-password' || token == f.session('a').accessToken) {
          throw const AuthApiException(401);
        }
        return {};
      };
      await expectLater(
        client().request('POST', 'change-password', area: 'auth'),
        throwsA(isA<AuthApiException>()),
      );
      expect(backend.refreshCalls, 1);
      expect(auth.session, isNotNull);
      expect(auth.sessionEnded.value, isNull);
    },
  );

  for (final error in [
    const AuthApiException(403),
    const AuthApiException(503),
    const SocketException('offline'),
    TimeoutException('timeout'),
  ]) {
    test('ordinary ${error.runtimeType} is not session revocation', () async {
      backend.handler = (_, _, _) async => throw error;
      await expectLater(client().me(), throwsA(same(error)));
      expect(auth.session, isNotNull);
      expect(auth.sessionEnded.value, isNull);
      expect(backend.refreshCalls, 0);
      expect((await auth.vault.list()).single.canContinue, isTrue);
    });
  }

  for (final error in [
    TimeoutException('lost rotation'),
    const AuthApiException(503),
  ]) {
    test(
      'ambiguous ${error.runtimeType} rotation keeps AT but never replays RT',
      () async {
        await auth.vault.remember(
          f.session('b'),
          remember: true,
          retain: true,
          active: false,
        );
        backend.refreshError = error;
        final current = auth.session!;
        await expectLater(auth.refreshSession(current), throwsA(same(error)));
        expect(auth.session, same(current));
        expect(auth.sessionEnded.value, isNull);
        await expectLater(auth.refreshSession(current), throwsStateError);
        expect(backend.refreshCalls, 1);
        final accounts = await auth.vault.list();
        expect(accounts.singleWhere((a) => a.id == 'a').canContinue, isFalse);
        expect(accounts.singleWhere((a) => a.id == 'b').canContinue, isTrue);
      },
    );
  }

  test('departed request cannot return data after account switch', () async {
    final pending = Completer<Map<String, dynamic>>();
    backend.handler = (_, _, _) => pending.future;
    final old = client();
    final request = old.me();
    final rejected = expectLater(
      request,
      throwsA(isA<SessionChangedException>()),
    );
    await auth.acceptLogin(f.session('b'), remember: true, retain: true);
    pending.complete({'private': 'old-account'});
    await rejected;
    expect(auth.session!.user.id, 'b');
    expect(old.session.user.id, 'a');
  });

  test(
    'late logout response cannot clear the newly accepted account',
    () async {
      backend.logoutBarrier = Completer<void>();
      final leaving = auth.signOut(session: auth.session!);
      final rejected = expectLater(
        leaving,
        throwsA(isA<SessionChangedException>()),
      );
      await Future<void>.delayed(Duration.zero);
      final next = f.session('b', 'new-login');
      await auth.acceptLogin(next, remember: true, retain: true);
      backend.logoutBarrier!.complete();
      await rejected;
      expect(auth.session, same(next));
      expect(await auth.vault.activeId(), 'b');
      expect(memory.values.values.single, contains(next.refreshToken));
    },
  );

  test(
    'a second generic access 401 after refresh is not proof of revocation',
    () async {
      backend.handler = (_, _, _) async => throw const AuthApiException(401);
      await expectLater(client().me(), throwsA(isA<AuthApiException>()));
      expect(backend.refreshCalls, 1);
      expect(auth.session, isNotNull);
      expect(auth.sessionEnded.value, isNull);
    },
  );

  test(
    'a failed password session probe is nonterminal and consumes no refresh',
    () async {
      backend.handler = (_, path, _) async =>
          throw AuthApiException(path == 'change-password' ? 401 : 503);
      await expectLater(
        client().request('POST', 'change-password', area: 'auth'),
        throwsA(
          isA<AuthApiException>().having(
            (e) => e.statusCode,
            'probe status',
            503,
          ),
        ),
      );
      expect(backend.refreshCalls, 0);
      expect(auth.session, isNotNull);
    },
  );

  test('ambiguous rotation cannot be saved again at logout', () async {
    backend.refreshError = TimeoutException('lost rotation');
    final current = auth.session!;
    await expectLater(
      auth.refreshSession(current),
      throwsA(isA<TimeoutException>()),
    );
    await expectLater(auth.leaveRetainingSession(current), throwsStateError);
    expect((await auth.vault.list()).single.canContinue, isFalse);
    expect(backend.refreshCalls, 1);
  });

  for (final sameAccount in [false, true]) {
    for (final reject in [false, true]) {
      test(
        'old refresh ${reject ? 'failure' : 'success'} cannot overwrite new ${sameAccount ? 'same' : 'other'} account',
        () async {
          backend.barrier = Completer<void>();
          final old = auth.refreshSession(auth.session!);
          final rejected = expectLater(old, throwsA(isA<AuthApiException>()));
          await Future<void>.delayed(Duration.zero);
          final next = f.session(sameAccount ? 'a' : 'b', 'new-login');
          await auth.acceptLogin(next, remember: true, retain: true);
          if (reject) backend.refreshError = const AuthApiException(401);
          backend.barrier!.complete();
          await rejected;
          expect(auth.session, same(next));
          expect(await auth.vault.activeId(), next.user.id);
          expect(memory.values.values.single, contains(next.refreshToken));
          expect(auth.sessionEnded.value, isNull);
        },
      );
    }
  }

  test(
    'revocation invalidates an in-flight rotation before its response',
    () async {
      final oldSession = auth.session!;
      backend.barrier = Completer<void>();
      final pending = auth.refreshSession(oldSession);
      final rejected = expectLater(
        pending,
        throwsA(isA<SessionChangedException>()),
      );
      await Future<void>.delayed(Duration.zero);
      await auth.clearRevokedSession(oldSession);
      backend.barrier!.complete();
      await rejected;
      expect(auth.session, isNull);
      expect((await auth.vault.list()).single.canContinue, isFalse);
      expect(auth.claimSessionEnd(), isTrue);
      expect(auth.claimSessionEnd(), isFalse);
    },
  );

  test('push detach does not refresh rejected access', () async {
    backend.handler = (_, _, _) async => throw const AuthApiException(401);
    await expectLater(
      client().request(
        'DELETE',
        'devices/installation',
        area: 'notifications',
        allowRefresh: false,
      ),
      throwsA(isA<AuthApiException>()),
    );
    expect(backend.refreshCalls, 0);
    expect(auth.session, isNotNull);
  });

  test('concurrent revocation cleanup has one terminal event', () async {
    var events = 0;
    auth.sessionEnded.addListener(() {
      events++;
    });
    final current = auth.session!;
    final generation = auth.generation;
    await Future.wait([
      auth.clearRevokedSession(current),
      auth.clearRevokedSession(current),
    ]);
    expect(auth.generation, generation + 1);
    expect(events, 1);
    expect(auth.session, isNull);
  });

  testWidgets(
    'refresh rejection tears down once through nested boundaries and clears profile links',
    (tester) async {
      final api = client();
      final links = ProfileLinkSession()
        ..attach(api, auth, {'username': 'alice'});
      var ends = 0;
      auth.sessionEnded.addListener(() {
        if (auth.sessionEnded.value != null) ends++;
      });
      backend.handler = (_, _, _) async => throw const AuthApiException(401);
      backend.refreshError = const AuthApiException(401);
      await tester.pumpWidget(
        ProfileLinkScope(
          session: links,
          child: MaterialApp(
            home: SessionBoundary(
              auth: auth,
              api: api,
              child: HomeScreen(
                session: auth.session!,
                googleAuthService: auth,
                userApi: api,
                profile: const {'username': 'alice'},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      expect(links.api, isNull);
      expect(backend.refreshCalls, 1);
      expect(ends, 1);
      final calls = backend.refreshCalls;
      await tester.pump(const Duration(seconds: 31));
      expect(backend.refreshCalls, calls);
      expect(
        tester.state<NavigatorState>(find.byType(Navigator)).canPop(),
        isFalse,
      );
      await tester.pumpWidget(const SizedBox());
      links.dispose();
    },
  );
}
