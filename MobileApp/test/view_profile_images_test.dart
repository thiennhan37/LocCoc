import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/widgets/full_screen_image_viewer.dart';
import 'package:mobile_app/core/widgets/user_avatar.dart';
import 'package:mobile_app/core/widgets/user_cover.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'package:mobile_app/features/users/presentation/avatar_url_screen.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'user_social_test.dart' as f;

void main() {
  group('FullScreenImageViewer standalone tests', () {
    testWidgets('renders title, subtitle, and closes when back/close is pressed', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: FullScreenImageViewer(
            imageUrl: 'https://images.example.com/avatar.png',
            title: 'Ảnh đại diện',
            subtitle: 'Nguyễn Văn A',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Ảnh đại diện'), findsOneWidget);
      expect(find.text('Nguyễn Văn A'), findsOneWidget);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);

      expect(find.byKey(const Key('close_image_viewer')), findsOneWidget);
      expect(find.byKey(const Key('back_image_viewer')), findsOneWidget);
    });

    testWidgets('shows invalid URL fallback message on malformed URL', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: FullScreenImageViewer(
            imageUrl: 'data:image/png;base64,invalid',
            title: 'Ảnh',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Đường dẫn ảnh không hợp lệ.'), findsOneWidget);
      expect(find.byType(Image), findsNothing);
    });

    testWidgets(
      'FullScreenImageViewer.open shows SnackBar when URL is empty or null',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => ElevatedButton(
                  key: const Key('open_null_image'),
                  onPressed: () {
                    FullScreenImageViewer.open(
                      context,
                      imageUrl: null,
                      title: 'Ảnh',
                      emptyMessage: 'Chưa có ảnh.',
                    );
                  },
                  child: const Text('Mở ảnh'),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const Key('open_null_image')));
        await tester.pumpAndSettle();

        expect(find.byType(FullScreenImageViewer), findsNothing);
        expect(find.text('Chưa có ảnh.'), findsOneWidget);
      },
    );
  });

  group('Own profile image viewing in HomeScreen', () {
    testWidgets('tapping own avatar with valid URL opens FullScreenImageViewer', (
      tester,
    ) async {
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
            profile: const {
              'username': 'alice',
              'displayName': 'Alice Smith',
              'avatarUrl': 'https://images.example.com/alice_avatar.png',
              'coverUrl': 'https://images.example.com/alice_cover.png',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap own avatar
      expect(find.byKey(const Key('view_own_avatar')), findsOneWidget);
      await tester.tap(find.byKey(const Key('view_own_avatar')));
      await tester.pumpAndSettle();

      expect(find.byType(FullScreenImageViewer), findsOneWidget);
      expect(find.text('Ảnh đại diện'), findsOneWidget);
      expect(find.text('Alice Smith'), findsOneWidget);

      // Close viewer
      await tester.tap(find.byKey(const Key('close_image_viewer')));
      await tester.pumpAndSettle();
      expect(find.byType(FullScreenImageViewer), findsNothing);

      // Verify edit button is still functional
      await tester.tap(find.byKey(const Key('edit_avatar_url')));
      await tester.pumpAndSettle();
      expect(find.byType(AvatarUrlScreen), findsOneWidget);
    });

    testWidgets('tapping own avatar without avatarUrl shows SnackBar', (
      tester,
    ) async {
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
            profile: const {
              'username': 'alice',
              'displayName': 'Alice Smith',
              'avatarUrl': null,
              'coverUrl': null,
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('view_own_avatar')));
      await tester.pumpAndSettle();

      expect(find.byType(FullScreenImageViewer), findsNothing);
      expect(find.text('Bạn chưa cập nhật ảnh đại diện.'), findsOneWidget);
    });

    testWidgets('tapping own cover with valid URL opens FullScreenImageViewer', (
      tester,
    ) async {
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
            profile: const {
              'username': 'alice',
              'displayName': 'Alice Smith',
              'coverUrl': 'https://images.example.com/alice_cover.png',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('view_own_cover')), findsOneWidget);
      await tester.tap(find.byKey(const Key('view_own_cover')));
      await tester.pumpAndSettle();

      expect(find.byType(FullScreenImageViewer), findsOneWidget);
      expect(find.text('Ảnh bìa'), findsOneWidget);
      expect(find.text('Alice Smith'), findsOneWidget);

      await tester.tap(find.byKey(const Key('back_image_viewer')));
      await tester.pumpAndSettle();
      expect(find.byType(FullScreenImageViewer), findsNothing);
    });

    testWidgets('tapping own cover without coverUrl shows SnackBar', (
      tester,
    ) async {
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
            profile: const {
              'username': 'alice',
              'displayName': 'Alice Smith',
              'coverUrl': null,
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('view_own_cover')));
      await tester.pumpAndSettle();

      expect(find.byType(FullScreenImageViewer), findsNothing);
      expect(find.text('Bạn chưa cập nhật ảnh bìa.'), findsOneWidget);
    });
  });

  group('Peer profile image viewing in UsernameProfileScreen', () {
    testWidgets(
      'tapping peer avatar and cover with URLs opens FullScreenImageViewer',
      (tester) async {
        final api = f.apiFor(
          (_) async => f.json({
            'id': 'bob-123',
            'username': 'bob',
            'displayName': 'Bob Builder',
            'avatarUrl': 'https://images.example.com/bob_avatar.png',
            'coverUrl': 'https://images.example.com/bob_cover.png',
            'relationshipStatus': 'FRIENDS',
            'friendCount': 5,
          }),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: UsernameProfileScreen(username: 'bob', api: api),
          ),
        );
        await tester.pumpAndSettle();

        // 1. View peer cover
        expect(find.byKey(const Key('view_peer_cover')), findsOneWidget);
        await tester.tap(find.byKey(const Key('view_peer_cover')));
        await tester.pumpAndSettle();

        expect(find.byType(FullScreenImageViewer), findsOneWidget);
        expect(find.text('Ảnh bìa'), findsOneWidget);
        expect(find.text('Bob Builder'), findsOneWidget);

        await tester.tap(find.byKey(const Key('close_image_viewer')));
        await tester.pumpAndSettle();
        expect(find.byType(FullScreenImageViewer), findsNothing);

        // 2. View peer avatar
        expect(find.byKey(const Key('view_peer_avatar')), findsOneWidget);
        await tester.tap(find.byKey(const Key('view_peer_avatar')));
        await tester.pumpAndSettle();

        expect(find.byType(FullScreenImageViewer), findsOneWidget);
        expect(find.text('Ảnh đại diện'), findsOneWidget);
        expect(find.text('Bob Builder'), findsOneWidget);

        await tester.tap(find.byKey(const Key('close_image_viewer')));
        await tester.pumpAndSettle();
        expect(find.byType(FullScreenImageViewer), findsNothing);
      },
    );

    testWidgets(
      'tapping peer avatar and cover without URLs shows descriptive SnackBars',
      (tester) async {
        final api = f.apiFor(
          (_) async => f.json({
            'id': 'bob-123',
            'username': 'bob',
            'displayName': 'Bob Builder',
            'avatarUrl': null,
            'coverUrl': null,
            'relationshipStatus': 'FRIENDS',
            'friendCount': 5,
          }),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: UsernameProfileScreen(username: 'bob', api: api),
          ),
        );
        await tester.pumpAndSettle();

        // Tap peer cover without coverUrl
        await tester.tap(find.byKey(const Key('view_peer_cover')));
        await tester.pumpAndSettle();
        expect(find.byType(FullScreenImageViewer), findsNothing);
        expect(find.text('Người dùng chưa cập nhật ảnh bìa.'), findsOneWidget);

        // Tap peer avatar without avatarUrl
        await tester.tap(find.byKey(const Key('view_peer_avatar')));
        await tester.pumpAndSettle();
        expect(find.byType(FullScreenImageViewer), findsNothing);
        expect(find.text('Người dùng chưa cập nhật ảnh đại diện.'), findsOneWidget);
      },
    );
  });
}
