import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/debug/developer_tools.dart';
import 'package:mobile_app/features/debug/jwt_inspection.dart';
import 'package:mobile_app/features/debug/presentation/debug_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/home/presentation/widgets/home_navigation.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'remembered_accounts_test.dart' as f;

String jwt(Object claims) =>
    'e30.${base64Url.encode(utf8.encode(jsonEncode(claims))).replaceAll('=', '')}.c2ln';

void main() {
  test('development gate requires debug mode and explicit opt-in', () {
    expect(
      developerToolsEnabled,
      kDebugMode && const bool.fromEnvironment('LOCCOC_DEV_TOOLS'),
    );
  });
  test(
    'JWT inspection is bounded, defensive and does not expose token-like claims',
    () {
      for (final token in [
        '',
        'demo-token',
        'a.b',
        'a.%%.c',
        jwt([]),
        'a.${'x' * 20000}.c',
        jwt({
          'value': {'deep': 'a'},
        }).replaceFirst('e30', ''),
      ]) {
        expect(inspectJwt(token), isNull);
      }
      final claims = inspectJwt(
        jwt({
          'sub': 'a',
          'role': 'admin',
          'exp': 1,
          'refreshToken': 'never-show',
          'nested': {'access_token': 'also-secret'},
        }),
      )!;
      expect(
        claims['role'],
        'admin',
      ); // Observation is not verified authorization.
      expect(claims['refreshToken'], '[đã che]');
      expect(jsonEncode(claims), isNot(contains('also-secret')));
      expect(
        inspectJwt(jwt({'text': 'x' * 600}))!['text'].toString().length,
        lessThan(520),
      );
    },
  );

  Future<(f.Api, UserApiClient)> setup() async {
    final backend = f.Api();
    final auth = f.service(f.MemoryVault().open(), backend);
    await auth.acceptLogin(f.session('a'), remember: true, retain: true);
    return (
      backend,
      UserApiClient(
        auth: backend,
        session: auth.session!,
        coordinator: auth,
        onSessionChanged: auth.updateSession,
      ),
    );
  }

  test(
    'Force Refresh uses the existing coordinator and updates API, auth and retained vault',
    () async {
      final (backend, api) = await setup();
      backend.barrier = Completer<void>();
      final first = api.forceRefresh(), second = api.forceRefresh();
      final normal = api.coordinator!.refreshSession(api.session);
      await Future<void>.delayed(Duration.zero);
      expect(backend.refreshCalls, 1);
      backend.barrier!.complete();
      await Future.wait([first, second, normal]);
      expect(api.session.accessToken, 'access-a-rotated-1');
      expect(api.coordinator!.session!.accessToken, api.session.accessToken);
      final resumed = await api.coordinator!.vault.consume('a');
      expect(resumed!.refreshToken, api.session.refreshToken);
    },
  );

  test(
    'late Force Refresh cannot replace an account switched during rotation',
    () async {
      final (backend, api) = await setup();
      backend.barrier = Completer<void>();
      final failed = expectLater(api.forceRefresh(), throwsA(isA<Exception>()));
      await Future<void>.delayed(Duration.zero);
      await api.coordinator!.acceptLogin(
        f.session('b'),
        remember: true,
        retain: true,
      );
      backend.barrier!.complete();
      await failed;
      expect(api.coordinator!.session!.user.id, 'b');
      expect(api.session.user.id, 'a');
      expect(api.isCurrent, isFalse);
    },
  );

  testWidgets('Home navigation honors the gate and profile compatibility', (
    tester,
  ) async {
    final (_, api) = await setup();
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: api.session,
          userApi: api,
          googleAuthService: api.coordinator,
          initialTab: 2,
          profile: const {'username': 'alice'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<HomeNavigation>(find.byType(HomeNavigation)).selected,
      HomeTab.profile,
    );
    expect(find.text('Token Type'), findsNothing);
    expect(find.text(api.session.accessToken), findsNothing);
    expect(
      find.text('Debug'),
      developerToolsEnabled ? findsOneWidget : findsNothing,
    );
    await tester.pumpWidget(const SizedBox());
  });

  if (!developerToolsEnabled) {
    testWidgets(
      'direct Debug construction exposes no panel or operations without the gate',
      (tester) async {
        final (backend, api) = await setup();
        var reloads = 0;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: DebugScreen(
                api: api,
                reloadProfile: () async {
                  reloads++;
                },
                reloadCounts: () async {
                  reloads++;
                },
              ),
            ),
          ),
        );
        expect(find.byKey(const Key('development_debug_panel')), findsNothing);
        expect(find.byKey(const Key('debug_force_refresh')), findsNothing);
        expect(backend.refreshCalls, 0);
        expect(reloads, 0);
      },
    );
  } else {
    Future<void> show(
      WidgetTester tester,
      UserApiClient api, {
      Future<void> Function()? reload,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DebugScreen(
              api: api,
              reloadProfile: reload ?? () async {},
              reloadCounts: reload ?? () async {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    Future<void> reach(WidgetTester tester, String key) async {
      await tester.scrollUntilVisible(
        find.byKey(Key(key)),
        280,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
    }

    testWidgets(
      'development panel masks AT and never renders RT; reveals and copies only on action',
      (tester) async {
        final (_, api) = await setup();
        String? copied;
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          (call) async {
            if (call.method == 'Clipboard.setData') {
              copied = (call.arguments as Map)['text'] as String;
            }
            return null;
          },
        );
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            SystemChannels.platform,
            null,
          ),
        );
        await show(tester, api);
        expect(find.text(api.session.accessToken), findsNothing);
        expect(find.text(api.session.refreshToken), findsNothing);
        expect(copied, isNull);
        await reach(tester, 'debug_reveal_access');
        await tester.tap(find.byKey(const Key('debug_reveal_access')));
        await tester.pumpAndSettle();
        expect(find.text(api.session.accessToken), findsOneWidget);
        await tester.tap(find.byKey(const Key('debug_copy_access')));
        await tester.pumpAndSettle();
        expect(copied, api.session.accessToken);
        expect(find.text(api.session.refreshToken), findsNothing);
      },
    );
    testWidgets(
      'Force Refresh double tap rotates once and masks changed token',
      (tester) async {
        final (backend, api) = await setup();
        backend.barrier = Completer<void>();
        await show(tester, api);
        await reach(tester, 'debug_force_refresh');
        await tester.tap(find.byKey(const Key('debug_force_refresh')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('debug_force_refresh')));
        await tester.pump();
        expect(backend.refreshCalls, 1);
        expect(
          tester
              .widget<FilledButton>(
                find.byKey(const Key('debug_force_refresh')),
              )
              .onPressed,
          isNull,
        );
        backend.barrier!.complete();
        await tester.pumpAndSettle();
        expect(api.session.accessToken, 'access-a-rotated-1');
        expect(find.text(api.session.accessToken), findsNothing);
      },
    );
    testWidgets('busy reload ignores completion after switching accounts', (
      tester,
    ) async {
      final (_, api) = await setup();
      final pending = Completer<void>();
      var reloads = 0;
      await show(
        tester,
        api,
        reload: () {
          reloads++;
          return pending.future;
        },
      );
      await reach(tester, 'debug_reload_profile');
      await tester.tap(find.byKey(const Key('debug_reload_profile')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('debug_reload_profile')));
      await tester.pump();
      expect(reloads, 1);
      await api.coordinator!.acceptLogin(
        f.session('b'),
        remember: true,
        retain: true,
      );
      pending.complete();
      await tester.pumpAndSettle();
      expect(find.text('Đã hoàn tất thao tác.'), findsNothing);
      expect(find.text('Phiên client đã kết thúc.'), findsOneWidget);
    });
    testWidgets('five-item development navigation fits 360px at 200% text', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final (_, api) = await setup();
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: HomeScreen(
            session: api.session,
            userApi: api,
            googleAuthService: api.coordinator,
            initialDestination: HomeTab.debug,
            profile: const {'username': 'alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Debug'), findsOneWidget);
      expect(find.byKey(const Key('development_debug_panel')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
