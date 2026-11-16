import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/application/camera_session.dart';
import 'package:mobile_app/features/home/presentation/screens/capture_moment_screen.dart';
import 'package:mobile_app/features/posts/presentation/photo_editor_screen.dart';
import 'home_screen_test.dart' show FakeCameraSession;

void main() {
  testWidgets(
    'new capture route forwards session owner and restarts after retake',
    (tester) async {
      final camera = FakeCameraSession()..status = CameraStatus.ready;
      await tester.pumpWidget(
        MaterialApp(
          home: CaptureMomentScreen(ownerId: 'current-user', camera: camera),
        ),
      );
      await tester.pump();
      await tester.ensureVisible(find.byKey(const ValueKey('capture-moment')));
      await tester.tap(find.byKey(const ValueKey('capture-moment')));
      await tester.pump();
      for (
        var i = 0;
        i < 50 && find.byKey(const ValueKey('edited-photo')).evaluate().isEmpty;
        i++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<PhotoEditorScreen>(find.byType(PhotoEditorScreen))
            .ownerId,
        'current-user',
      );
      expect(camera.stops, greaterThan(0));
      await tester.ensureVisible(find.byTooltip('Chụp lại'));
      await tester.tap(find.byTooltip('Chụp lại'));
      await tester.pumpAndSettle();
      expect(camera.photo, isNull);
      expect(find.byType(CaptureMomentScreen), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      camera.dispose();
      expect(tester.takeException(), isNull);
    },
  );
}
