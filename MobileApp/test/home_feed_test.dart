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
