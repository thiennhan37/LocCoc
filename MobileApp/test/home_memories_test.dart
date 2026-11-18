import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/home/presentation/widgets/home_navigation.dart';

import 'home_screen_test.dart' show FakeCameraSession;
import 'user_social_test.dart' as fixtures;

void main() {
  for (final failOnce in [false, true]) {
    testWidgets(
      'Memories loads all 33 own photos across pages${failOnce ? ' after retry' : ''}',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final camera = FakeCameraSession();
        final cursors = <String?>[];
        var failed = false;
        final api = fixtures.apiFor((request) async {
          if (request.url.path == '/moments') {
            expect(request.headers['Authorization'], 'Bearer old-access');
            final cursor = request.url.queryParameters['cursor'];
            cursors.add(cursor);
            if (cursor != null && failOnce && !failed) {
              failed = true;
              return fixtures.json({}, 503);
            }
            final offset = cursor == null ? 0 : 20;
            return fixtures.json({
              'items': List.generate(
                cursor == null ? 20 : 13,
                (index) => {
                  'id':
                      '22222222-2222-4222-8222-${(offset + index).toString().padLeft(12, '0')}',
                  'state': 'active',
                  'indexStatus': 'ready',
                  'capturedAt': '2026-11-17T00:00:00Z',
                },
              ),
              'nextCursor': cursor == null ? 'next+page/20=' : null,
            });
          }
          if (request.url.path.endsWith('/image')) {
            return http.Response.bytes(
              base64Decode(
                'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAxSURBVFhH7c4hAQAACMAwItKI6OAJAGbi5mrRlf1Z7HEdAAAAAAAAAAAAAAAAAADAAPlINKZoOLjRAAAAAElFTkSuQmCC',
              ),
              200,
            );
          }
          if (request.url.path == '/posts/feed') {
            return fixtures.json({'data': [], 'nextCursor': null});
          }
          return fixtures.json({'unseenCount': 0, 'friendCount': 0});
        });
        await tester.pumpWidget(
          MaterialApp(
            home: HomeScreen(
              session: fixtures.session,
              camera: camera,
              userApi: api,
              profile: {'id': fixtures.session.user.id, 'displayName': 'Alice'},
              initialDestination: HomeTab.memories,
              googleAuthService: GoogleAuthService(apiClient: api.auth),
            ),
          ),
        );
        await tester.pump();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)),
        );
        await tester.pumpAndSettle();
        expect(find.text('20 kỷ niệm gần đây'), findsOneWidget);
        final more = find.byKey(const Key('memories_load_more'));
        expect(more, findsOneWidget);
        await tester.ensureVisible(more);
        await tester.pumpAndSettle();
        await tester.tap(more);
        await tester.pump();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)),
        );
        await tester.pumpAndSettle();
        if (failOnce) {
          expect(find.text('20 kỷ niệm gần đây'), findsOneWidget);
          expect(
            find.text('Chưa thể tải thêm kỷ niệm. Hãy thử lại.'),
            findsOneWidget,
          );
          await tester.ensureVisible(more);
          await tester.pumpAndSettle();
          await tester.tap(more);
          await tester.pump();
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 100)),
          );
          await tester.pumpAndSettle();
        }
        expect(find.text('33 kỷ niệm gần đây'), findsOneWidget);
        expect(more, findsNothing);
        expect(cursors, [null, 'next+page/20=', if (failOnce) 'next+page/20=']);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        camera.dispose();
      },
    );
  }
}
