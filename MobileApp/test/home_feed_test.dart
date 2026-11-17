import 'home_screen_test.dart' show FakeCameraSession;
import 'package:mobile_app/features/home/application/camera_session.dart';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/capture_moment_screen.dart';
import 'package:mobile_app/features/posts/presentation/photo_editor_screen.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'user_social_test.dart' as fixtures;

void main() {
  testWidgets('home author menu filters posts to the selected friend', (
    tester,
  ) async {
    final camera = FakeCameraSession()..status = CameraStatus.ready;
    final api = fixtures.apiFor((request) async {
      if (request.url.path.endsWith('/friends')) {
        return fixtures.json({
          'data': [
            {'id': 'friend', 'displayName': 'Minh', 'avatarUrl': null},
          ],
          'hasMore': false,
        });
      }
      if (request.url.path == '/posts/feed') {
        return fixtures.json({
          'data': [
            for (final owner in [fixtures.session.user.id, 'friend'])
              {
                'id': owner,
                'ownerId': owner,
                'mediaKey': '/unsupported',
                'mediaType': 0,
                'authorName': owner == 'friend' ? 'Minh' : 'Tôi',
                'createdAt': '2026-11-17T00:00:00Z',
                'caption': '',
                'mine': owner != 'friend',
                'seen': false,
              },
          ],
          'nextCursor': null,
        });
      }
      return fixtures.json({'friendCount': 1, 'unseenCount': 0});
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: fixtures.session,
          camera: camera,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tất cả bạn bè').hitTestable());
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Minh'));
    await tester.pumpAndSettle();
    await tester.drag(
      find.byKey(const ValueKey('feed-pager')),
      const Offset(0, -650),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('friend')), findsOneWidget);
    expect(find.byKey(ValueKey(fixtures.session.user.id)), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('gallery opens from top-left header and back retains feed page', (
    tester,
  ) async {
    final camera = FakeCameraSession()..status = CameraStatus.ready;
    final api = fixtures.apiFor((request) async {
      if (request.url.path == '/posts/feed') {
        return fixtures.json({
          'data': [
            {
              'id': '11111111-1111-4111-8111-111111111111',
              'ownerId': fixtures.session.user.id,
              'mediaKey': '/posts/media/11111111-1111-4111-8111-111111111111',
              'mediaType': 0,
              'authorName': 'Me',
              'createdAt': '2026-11-17T00:00:00Z',
              'caption': '',
              'mine': true,
              'seen': false,
            },
          ],
          'nextCursor': null,
        });
      }
      return fixtures.json({'friendCount': 0, 'unseenCount': 0});
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: fixtures.session,
          camera: camera,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final button = find
        .byKey(const ValueKey('open-photo-gallery'))
        .hitTestable();
    expect(button, findsOneWidget);
    expect(tester.getTopLeft(button).dy, lessThan(160));
    await tester.drag(
      find.byKey(const ValueKey('feed-pager')),
      const Offset(0, -650),
    );
    await tester.pumpAndSettle();
    expect(button, findsOneWidget);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text('Tất cả'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(button, findsOneWidget);
    await tester.drag(
      find.byKey(const ValueKey('feed-pager')),
      const Offset(0, 650),
    );
    await tester.pumpAndSettle();
    expect(button, findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('profile memories shortcut loads personal calendar', (
    tester,
  ) async {
    final camera = FakeCameraSession()..status = CameraStatus.ready;
    var loads = 0;
    final api = fixtures.apiFor((request) async {
      if (request.url.path == '/posts/feed') {
        loads++;
        return fixtures.json({'data': [], 'nextCursor': null});
      }
      return fixtures.json({'friendCount': 0, 'unseenCount': 0});
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: fixtures.session,
          camera: camera,
          userApi: api,
          initialTab: 2,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(loads, 1);
    await tester.ensureVisible(find.text('Xem tất cả'));
    await tester.tap(find.text('Xem tất cả'));
    await tester.pumpAndSettle();
    expect(loads, 2);
    expect(
      find.byKey(const PageStorageKey('memories-calendar')),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets(
    'Home reloads real feed after publish; failed images are not viewed',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final camera = FakeCameraSession()..status = CameraStatus.ready;
      var loads = 0, views = 0;
      final api = fixtures.apiFor((request) async {
        if (request.url.path == '/posts/feed') {
          loads++;
          final id = loads == 1
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222';
          return fixtures.json({
            'data': [
              {
                'id': id,
                'ownerId': fixtures.session.user.id,
                'mediaKey': '/posts/media/$id',
                'mediaType': 0,
                'authorName': 'Alice',
                'createdAt': '2026-11-13T00:00:00Z',
                'caption': loads == 1 ? 'Bài trước' : 'Bài vừa đăng',
                'mine': true,
                'seen': false,
              },
              {
                'id': '33333333-3333-4333-8333-333333333333',
                'ownerId': 'friend',
                'mediaKey': '/posts/media/33333333-3333-4333-8333-333333333333',
                'mediaType': 0,
                'authorName': 'Bạn của tôi',
                'createdAt': '2026-11-13T00:00:00Z',
                'caption': '',
                'mine': false,
                'seen': false,
              },
            ],
            'nextCursor': null,
          });
        }
        if (request.url.path.endsWith('/seen')) views++;
        return fixtures.json({
          'unseenCount': 0,
          'unreadCount': 0,
          'friendCount': 0,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            camera: camera,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(loads, 1);
      expect(find.byType(CaptureMomentScreen), findsOneWidget);
      expect(
        tester
            .widget<CaptureMomentScreen>(find.byType(CaptureMomentScreen))
            .userApi,
        same(api),
      );
      tester
          .widget<CaptureMomentScreen>(find.byType(CaptureMomentScreen))
          .onPublished!(
        PublishedPhoto(Uint8List(0), '22222222-2222-4222-8222-222222222222'),
      );
      await tester.pumpAndSettle();
      expect(loads, 2);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const ValueKey('capture-moment')),
        const Offset(0, -650),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('22222222-2222-4222-8222-222222222222')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('11111111-1111-4111-8111-111111111111')),
        findsNothing,
      );
      expect(find.text('Bài vừa đăng'), findsNothing);
      expect(camera.stops, greaterThan(0));
      await tester.drag(
        find.byKey(const ValueKey('feed-pager')),
        const Offset(0, -650),
      );
      await tester.pumpAndSettle();
      expect(find.text('Bạn của tôi').hitTestable(), findsOneWidget);
      await tester.drag(
        find.byKey(const ValueKey('feed-pager')),
        const Offset(0, 650),
      );
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const ValueKey('feed-pager')),
        const Offset(0, 650),
      );
      await tester.pumpAndSettle();
      expect(
        find.byTooltip('Chọn ảnh từ thư viện').hitTestable(),
        findsOneWidget,
      );
      expect(camera.starts, greaterThan(1));

      await tester.pump(const Duration(seconds: 2));
      expect(views, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      camera.dispose();
    },
  );
}
