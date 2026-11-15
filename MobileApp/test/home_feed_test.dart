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
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(loads, 1);
      await tester.ensureVisible(find.text('Gửi một khoảnh khắc'));
      await tester.tap(find.text('Gửi một khoảnh khắc'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(CaptureMomentScreen), findsOneWidget);
      final context = tester.element(find.byType(CaptureMomentScreen));
      Navigator.of(context).pop(
        PublishedPhoto(Uint8List(0), '22222222-2222-4222-8222-222222222222'),
      );
      await tester.pumpAndSettle();
      expect(loads, 2);
      await tester.scrollUntilVisible(
        find.text('Bài vừa đăng'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(CustomScrollView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Bài vừa đăng'), findsOneWidget);
      expect(find.text('Bài trước'), findsNothing);
      await tester.pump(const Duration(seconds: 2));
      expect(views, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
