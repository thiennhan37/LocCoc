import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/constants/app_colors.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/core/utils/avatar_url.dart';
import 'package:mobile_app/core/widgets/user_avatar.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/home/presentation/widgets/home_navigation.dart';
import 'package:mobile_app/features/users/presentation/avatar_url_screen.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'remembered_accounts_test.dart' as accounts;
import 'user_social_test.dart' as f;

void main() {
  test(
    'avatar URL policy rejects inline/file/credentials/malformed hosts and non-HTTPS release URLs',
    () {
      expect(
        avatarUri('https://images.example.com/a.png')!.host,
        'images.example.com',
      );
      expect(avatarUri('http://localhost/a.png'), isNull);
      expect(avatarUri('http://localhost/a.png', allowHttp: true), isNotNull);
      for (final value in [
        null,
        '',
        'data:image/png;base64,aGVsbG8=',
        'file:///tmp/image.png',
        'javascript:alert(1)',
        '//images.example.com/a.png',
        'https://a:b@example.com/a',
        'https://-host.test/a',
        'https://./a',
        'https://host..test/a',
        'https://a.test:99999/a',
        'https://a.test/a b',
        'https://a.test/a#x',
      ]) {
        expect(avatarUri(value), isNull, reason: value);
      }
      expect(UserAvatar.initials('  Nguyễn   Minh Anh '), 'NA');
      expect(UserAvatar.initials('Alice'), 'A');
      expect(UserAvatar.initials('  '), '');
    },
  );

  testWidgets(
    'shared avatar bounds decoding, sends no app headers and falls back on failed load',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: UserAvatar(
              avatarUrl: 'https://images.example.com/a.png',
              displayName: 'Minh Anh',
              size: 44,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final provider =
          tester.widget<Image>(find.byType(Image)).image as ResizeImage;
      expect(provider.width, inInclusiveRange(44, 1024));
      expect(provider.height, provider.width);
      expect((provider.imageProvider as NetworkImage).headers, isNull);
      expect(find.text('MA'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('invalid URL never builds a network image', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: UserAvatar(avatarUrl: 'data:private', displayName: 'Alice'),
      ),
    );
    expect(find.byType(Image), findsNothing);
    expect(find.text('A'), findsOneWidget);
  });

  test(
    'old vault record reads without avatar; URL-only metadata survives restart',
    () async {
      final memory = accounts.MemoryVault();
      final vault = memory.open();
      await vault.remember(accounts.session('a'), remember: true, retain: true);
      expect((await vault.list()).single.avatarUrl, isNull);
      await vault.profile('a', {
        'username': 'alice',
        'displayName': 'Alice',
        'avatarUrl': 'https://images.example.com/a.png',
      });
      final saved = (await memory.open().list()).single;
      expect(saved.avatarUrl, 'https://images.example.com/a.png');
      expect(saved.canContinue, isTrue);
      expect(memory.values.values.single, isNot(contains('access-a-one')));
      await vault.profile('a', {'avatarUrl': 'data:image/png;base64,private'});
      expect((await vault.list()).single.avatarUrl, isNull);
      expect(memory.values.values.single, isNot(contains('base64')));
    },
  );

  testWidgets('remembered chooser uses saved avatar metadata', (tester) async {
    final memory = accounts.MemoryVault();
    final vault = memory.open();
    await vault.remember(accounts.session('a'), remember: true, retain: false);
    await vault.profile('a', {
      'displayName': 'Alice',
      'avatarUrl': 'https://images.example.com/a.png',
    });
    final auth = accounts.service(vault, accounts.Api());
    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(googleAuthService: auth, autoRestore: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<UserAvatar>(find.byType(UserAvatar)).avatarUrl,
      'https://images.example.com/a.png',
    );
  });

  test('normal text and button palette pairs meet 4.5:1', () {
    double ratio(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return ((x > y ? x : y) + .05) / ((x < y ? x : y) + .05);
    }

    for (final (foreground, background) in [
      (Colors.white, AppColors.primary),
      (Colors.white, AppColors.primaryDark),
      (AppColors.textSecondary, AppColors.background),
      (AppColors.textMuted, AppColors.background),
      (AppColors.textMuted, AppColors.inputBackground),
      (AppColors.primary, AppColors.card),
      (AppColors.primaryDark, AppColors.primarySoft),
      (Colors.white, AppColors.error),
      (Colors.white, AppColors.success),
      (AppColors.textPrimary, AppColors.brandCoral),
      (AppColors.primaryLight, AppColors.textPrimary),
    ]) {
      expect(ratio(foreground, background), greaterThanOrEqualTo(4.5));
    }
    final theme = AppTheme.lightTheme;
    expect(theme.cardTheme.shape, isNotNull);
    expect(theme.dialogTheme.shape, isNotNull);
    expect(theme.filledButtonTheme.style, isNotNull);
    expect(theme.outlinedButtonTheme.style, isNotNull);
    expect(theme.chipTheme.labelStyle, isNotNull);
    expect(theme.snackBarTheme.contentTextStyle!.color, Colors.white);
  });

  testWidgets(
    'avatar editor validates and sends only supported avatarUrl field',
    (tester) async {
      Map<String, dynamic>? patch;
      final api = f.apiFor((r) async {
        patch = jsonDecode(r.body) as Map<String, dynamic>;
        expect(r.method, 'PATCH');
        expect(r.url.path, '/users/me');
        return f.json({
          'id': f.session.user.id,
          'username': 'alice',
          'avatarUrl': patch!['avatarUrl'],
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: AvatarUrlScreen(
            api: api,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('avatar_url_input')),
        'data:image/png;base64,no',
      );
      await tester.tap(find.byKey(const Key('save_avatar_url')));
      await tester.pumpAndSettle();
      expect(patch, isNull);
      await tester.enterText(
        find.byKey(const Key('avatar_url_input')),
        'https://images.example.com/alice.png',
      );
      await tester.tap(find.byKey(const Key('save_avatar_url')));
      await tester.pumpAndSettle();
      expect(patch, {'avatarUrl': 'https://images.example.com/alice.png'});
    },
  );

  testWidgets(
    'avatar badge opens URL editor; legacy profile tab remains compatible',
    (tester) async {
      final api = f.apiFor(
        (_) async => f.json({'unseenCount': 0, 'friendCount': 0}),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(homeTabFromLegacy(2), HomeTab.profile);
      await tester.tap(find.byKey(const Key('edit_avatar_url')));
      await tester.pumpAndSettle();
      expect(find.byType(AvatarUrlScreen), findsOneWidget);
      expect(find.textContaining('Dán liên kết HTTPS'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final tab in [0, 1, 2, 3]) {
    testWidgets('Home tab $tab fits 360px, long names and 200% text', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = f.apiFor(
        (_) async => f.json({
          'unseenCount': 0,
          'friendCount': 0,
          'data': [],
          'hasMore': false,
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: HomeScreen(
            session: f.session,
            userApi: api,
            initialTab: tab,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            profile: const {
              'username': 'alice_with_a_long_username_123',
              'displayName': 'Nguyễn Thị Minh Anh với tên hiển thị rất dài',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  for (final screen in ['avatar', 'friends', 'demo']) {
    testWidgets('$screen fits 360px at 200% with keyboard', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = const FakeViewPadding(bottom: 260);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      final api = f.apiFor(
        (_) async => f.json({
          'unseenCount': 0,
          'friendCount': 0,
          'data': [],
          'hasMore': false,
        }),
      );
      final demo = AuthSession.fromJson({
        ...f.session.toJson(),
        'accessToken': 'demo-preview',
      });
      final child = screen == 'avatar'
          ? AvatarUrlScreen(
              api: api,
              profile: const {'displayName': 'Minh Anh'},
            )
          : screen == 'friends'
          ? FriendsScreen(api: api)
          : HomeScreen(
              session: demo,
              googleAuthService: GoogleAuthService(apiClient: api.auth),
              initialTab: 2,
            );
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: child,
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
