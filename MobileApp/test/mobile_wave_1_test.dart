import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_result.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';
import 'package:mobile_app/features/users/presentation/profile_share_card.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'user_social_test.dart' as f;

void main() {
  for (final entry in {
    400: AuthFailureKind.validation,
    401: AuthFailureKind.authentication,
    403: AuthFailureKind.authentication,
    429: AuthFailureKind.rateLimit,
    500: AuthFailureKind.server,
  }.entries) {
    test(
      'login ${entry.key} is typed and never exposes server messages',
      () async {
        final api = AuthApiClient(
          httpClient: MockClient(
            (_) async => http.Response(
              '{"message":"private stack trace / database detail"}',
              entry.key,
              headers: {'retry-after': '42'},
            ),
          ),
        );
        final result = await api.loginWithPassword(
          email: 'an@example.com',
          password: 'a',
        );
        expect(result, isA<AuthFailure>());
        final failure = result as AuthFailure;
        expect(failure.kind, entry.value);
        expect(failure.message, isNot(contains('private stack')));
        if (entry.key == 429) {
          expect(failure.retryAfter, const Duration(seconds: 42));
          expect(failure.message, contains('42 giây'));
        }
        api.close();
      },
    );
  }

  test('Retry-After accepts HTTP date and rejects malformed values', () {
    final wait = AuthApiClient.retryAfter(
      HttpDate.format(DateTime.now().toUtc().add(const Duration(seconds: 45))),
    );
    expect(wait!.inSeconds, inInclusiveRange(43, 45));
    expect(AuthApiClient.retryAfter('invalid'), isNull);
  });

  for (final error in [
    const SocketException('private socket'),
    TimeoutException('private timeout'),
    http.ClientException('private transport'),
  ]) {
    test(
      'transport ${error.runtimeType} has a network category and safe message',
      () async {
        final api = AuthApiClient(
          httpClient: MockClient((_) async => throw error),
        );
        final failure =
            await api.loginWithPassword(email: 'an@example.com', password: 'a')
                as AuthFailure;
        expect(failure.kind, AuthFailureKind.network);
        expect(failure.message, isNot(contains('private')));
        api.close();
      },
    );
  }

  for (final status in [400, 401, 429]) {
    testWidgets(
      'login $status has no Demo error action; independent Demo remains',
      (tester) async {
        final api = AuthApiClient(
          httpClient: MockClient((_) async => http.Response('{}', status)),
        );
        await tester.pumpWidget(
          MaterialApp(home: AuthScreen(authApiClient: api, autoRestore: false)),
        );
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byType(TextFormField).first,
          'alice@example.com',
        );
        await tester.enterText(find.byType(TextFormField).last, 'a');
        await tester.tap(find.text('Đăng nhập'));
        await tester.pumpAndSettle();
        expect(find.byType(SnackBar), findsOneWidget);
        expect(tester.widget<SnackBar>(find.byType(SnackBar)).action, isNull);
        expect(find.text('Vào Demo'), findsNothing);
        expect(
          find.text('Khám phá ngay (Tài khoản thử nghiệm)'),
          findsOneWidget,
        );
        expect(find.byType(HomeScreen), findsNothing);
        api.close();
      },
    );
  }

  for (final fail in [false, true]) {
    testWidgets(
      'profile copy ${fail ? 'failure never reports success' : 'waits for clipboard success'}',
      (tester) async {
        final clipboard = Completer<void>();
        String? copied;
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          (call) async {
            if (call.method == 'Clipboard.setData') {
              copied = (call.arguments as Map)['text'] as String;
              await clipboard.future;
              if (fail) throw PlatformException(code: 'clipboard_failed');
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
        final api = f.apiFor((_) async => f.json({'username': 'alice'}));
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ProfileShareCard(api: api, onSearch: () {}),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Sao chép liên kết'));
        await tester.pump();
        expect(find.text('Đã sao chép liên kết.'), findsNothing);
        expect(copied, 'https://$appLinkHost/alice');
        clipboard.complete();
        await tester.pumpAndSettle();
        expect(
          find.text('Đã sao chép liên kết.'),
          fail ? findsNothing : findsOneWidget,
        );
        if (fail) {
          expect(
            find.text('Chưa thể sao chép liên kết. Vui lòng thử lại.'),
            findsOneWidget,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('profile Share calls the system share with configured link', (
    tester,
  ) async {
    MethodCall? shared;
    const channel = MethodChannel('dev.fluttercommunity.plus/share');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      shared = call;
      return 'dev.fluttercommunity.plus/share/unavailable';
    });
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      ),
    );
    final api = f.apiFor((_) async => f.json({'username': 'alice'}));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProfileShareCard(api: api, onSearch: () {}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chia sẻ'));
    await tester.pumpAndSettle();
    expect(shared!.method, 'share');
    expect((shared!.arguments as Map)['text'], 'https://$appLinkHost/alice');
    expect(find.textContaining('Đã sao chép'), findsNothing);
  });

  for (final username in [null, '', 'bad/path']) {
    testWidgets(
      'missing or invalid username $username never fabricates a link',
      (tester) async {
        final api = f.apiFor((_) async => f.json({'username': username}));
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ProfileShareCard(api: api, onSearch: () {}),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Hãy hoàn tất username để chia sẻ hồ sơ.'),
          findsOneWidget,
        );
        expect(find.text('Sao chép liên kết'), findsNothing);
      },
    );
  }

  testWidgets(
    'real profile has one working Share entry, real avatar and no sample stats',
    (tester) async {
      final api = f.apiFor(
        (_) async =>
            f.json({'unseenCount': 0, 'unreadCount': 0, 'friendCount': 9}),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {
              'username': 'alice',
              'displayName': 'Alice',
              'avatarUrl': 'https://images.example.com/alice.png',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final images = tester.widgetList<Image>(find.byType(Image));
      expect(
        images.any((image) {
          final provider = image.image;
          return provider is ResizeImage &&
              provider.imageProvider is NetworkImage &&
              (provider.imageProvider as NetworkImage).url ==
                  'https://images.example.com/alice.png' &&
              (provider.imageProvider as NetworkImage).headers == null;
        }),
        isTrue,
      );
      expect(find.text('128'), findsNothing);
      expect(find.text('24'), findsNothing);
      expect(find.text('Sao chép link hồ sơ'), findsNothing);
      await tester.tap(find.byKey(const Key('profile_share')));
      await tester.pumpAndSettle();
      expect(find.byType(ProfileShareCard), findsOneWidget);
      expect(find.text('https://$appLinkHost/alice'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'share QR bottom sheet spans full narrow width, wraps height and fits 200% text',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = f.apiFor(
        (_) async =>
            f.json({'unseenCount': 0, 'unreadCount': 0, 'friendCount': 0}),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {
              'username': 'alice_with_a_long_username_123',
              'displayName': 'Alice Long Name',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_share')));
      await tester.pumpAndSettle();
      final compactSheetRect = tester.getRect(find.byType(BottomSheet));
      expect(compactSheetRect.width, 360);
      expect(compactSheetRect.height, lessThan(520));
      expect(
        find.text('https://$appLinkHost/alice_with_a_long_username_123'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());

      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {
              'username': 'alice_with_a_long_username_123',
              'displayName': 'Alice Long Name',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_share')));
      await tester.pumpAndSettle();
      final scaledSheetRect = tester.getRect(find.byType(BottomSheet));
      expect(scaledSheetRect.width, 360);
      await tester.ensureVisible(find.text('Chia sẻ'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'invalid avatar uses identity fallback without external image request',
    (tester) async {
      final api = f.apiFor(
        (_) async =>
            f.json({'unseenCount': 0, 'unreadCount': 0, 'friendCount': 0}),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {
              'username': 'alice',
              'displayName': 'Alice',
              'avatarUrl': 'javascript:bad',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('A'), findsOneWidget);
      expect(
        tester
            .widgetList<Image>(find.byType(Image))
            .any((i) => i.image is NetworkImage || i.image is ResizeImage),
        isFalse,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'Demo Share neither calls profile API nor invents a public link',
    (tester) async {
      var requests = 0;
      final api = f.apiFor((_) async {
        requests++;
        return f.json({});
      });
      final demo = AuthSession.fromJson({
        ...f.session.toJson(),
        'accessToken': 'demo-preview',
      });
      api.session = demo;
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: demo,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_share')));
      await tester.pumpAndSettle();
      expect(find.byType(ProfileShareCard), findsNothing);
      expect(
        find.text('Hãy đăng nhập tài khoản thật để chia sẻ hồ sơ.'),
        findsOneWidget,
      );
      expect(requests, 0);
    },
  );

  testWidgets('return from inbox refreshes both counts and friend count', (
    tester,
  ) async {
    var count = 1, summaries = 0, counts = 0;
    final api = f.apiFor((r) async {
      if (r.url.path.endsWith('social-summary')) {
        summaries++;
        return f.json({'friendCount': count});
      }
      if (r.url.path.endsWith('/counts')) {
        counts++;
        return f.json({'unseenCount': 0, 'unreadCount': 0});
      }
      return f.json({
        'items': [],
        'pageInfo': {'hasMore': false, 'nextCursor': null},
      });
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: f.session,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
          profile: const {'username': 'alice'},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Thông báo'));
    await tester.pumpAndSettle();
    final beforeCounts = counts, beforeSummaries = summaries;
    count = 12;
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(counts, greaterThan(beforeCounts));
    expect(summaries, greaterThan(beforeSummaries));
    await tester.tap(find.text('Cá nhân'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byKey(const Key('profile_friend_count')),
        matching: find.text('12'),
      ),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('login 360px with large text and keyboard has no layout error', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 260);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: const AuthScreen(autoRestore: false),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(TextFormField).first);
    await tester.enterText(
      find.byType(TextFormField).first,
      'long.name@example.com',
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'profile friend entry retains recommendation pages, cursor and scroll',
    (tester) async {
      final cursors = <String?>[];
      final api = f.apiFor((r) async {
        if (r.url.path == '/users/recommendations') {
          cursors.add(r.url.queryParameters['cursor']);
          final page = cursors.length;
          return f.json({
            'data': List.generate(8, (i) => f.peer('person${page}_$i')),
            'hasMore': true,
            'nextCursor': 'snapshot:$page',
            'state': 'ready',
          });
        }
        return f.json({
          'data': [],
          'hasMore': false,
          'friendCount': 0,
          'unseenCount': 0,
          'unreadCount': 0,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            profile: const {'username': 'alice'},
            initialTab: 3,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Gợi ý'));
      await tester.pumpAndSettle();
      Finder listScroll() => find
          .descendant(
            of: find.byType(FriendsScreen),
            matching: find.byType(Scrollable),
          )
          .last;
      await tester.scrollUntilVisible(
        find.text('Xem thêm'),
        400,
        scrollable: listScroll(),
      );
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      await tester.drag(listScroll(), const Offset(0, -160));
      await tester.pumpAndSettle();
      final retained = tester.state<ScrollableState>(listScroll());
      final position = retained.position.pixels;
      expect(position, greaterThan(0));
      await tester.tap(find.text('Cá nhân'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Bạn bè của bạn'));
      await tester.tap(find.text('Bạn bè của bạn'));
      await tester.pumpAndSettle();
      expect(tester.state<ScrollableState>(listScroll()), same(retained));
      expect(retained.position.pixels, position);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Gợi ý'))
            .selected,
        isTrue,
      );
      expect(cursors, [null, 'snapshot:1']);
      await tester.scrollUntilVisible(
        find.text('Xem thêm'),
        400,
        scrollable: listScroll(),
      );
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      expect(cursors, [null, 'snapshot:1', 'snapshot:2']);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
