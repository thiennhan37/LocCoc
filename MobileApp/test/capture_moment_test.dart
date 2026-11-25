import 'package:image_picker/image_picker.dart';
import 'package:mobile_app/features/users/data/profile_image_picker.dart';
import 'user_social_test.dart' as fixtures;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/application/camera_session.dart';
import 'package:mobile_app/features/home/presentation/screens/capture_moment_screen.dart';
import 'package:mobile_app/features/posts/presentation/photo_editor_screen.dart';
import 'home_screen_test.dart' show FakeCameraSession;

class FixturePicker extends ProfileImagePicker {
  @override
  Future<PickedProfileImage?> pick(ImageSource source, String kind) async {
    final fixture = FakeCameraSession();
    await fixture.capture();
    final image = PickedProfileImage(fixture.photo!, 'image/png');
    fixture.dispose();
    return image;
  }
}

void main() {
  testWidgets(
    'repeated capture then exit without publishing keeps shutter usable',
    (tester) async {
      final camera = FakeCameraSession()..status = CameraStatus.ready;
      var published = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: CaptureMomentScreen(
            ownerId: 'owner',
            camera: camera,
            embedded: true,
            onPublished: (_) => published++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (var cycle = 0; cycle < 4; cycle++) {
        final shutter = find.byKey(const ValueKey('capture-moment'));
        await tester.ensureVisible(shutter);
        await tester.tap(shutter);
        await tester.pump();
        for (
          var i = 0;
          i < 50 &&
              find.byKey(const ValueKey('edited-photo')).evaluate().isEmpty;
          i++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump();
        }
        await tester.pumpAndSettle();
        expect(find.byType(PhotoEditorScreen), findsOneWidget);
        expect(camera.stops, cycle + 1);
        if (cycle.isEven) {
          await tester.ensureVisible(find.byTooltip('Chụp lại'));
          await tester.tap(find.byTooltip('Chụp lại'));
        } else {
          await tester.binding.handlePopRoute();
        }
        await tester.pumpAndSettle();
        expect(camera.photo, isNull);
        expect(camera.starts, cycle + 2);
        expect(published, 0);
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox());
      camera.dispose();
    },
  );
  for (final gallery in [false, true]) {
    testWidgets(
      '${gallery ? 'gallery' : 'capture'} forwards session owner and restarts after retake',
      (tester) async {
        final userApi = fixtures.apiFor((_) async => fixtures.json({}));
        final camera = FakeCameraSession()..status = CameraStatus.ready;
        await tester.pumpWidget(
          MaterialApp(
            home: CaptureMomentScreen(
              ownerId: 'current-user',
              camera: camera,
              userApi: userApi,
              imagePicker: FixturePicker(),
            ),
          ),
        );
        await tester.pump();
        final action = gallery
            ? find.byTooltip('Chọn ảnh từ thư viện')
            : find.byKey(const ValueKey('capture-moment'));
        await tester.ensureVisible(action);
        await tester.tap(action);
        await tester.pump();
        for (
          var i = 0;
          i < 50 &&
              find.byKey(const ValueKey('edited-photo')).evaluate().isEmpty;
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
        expect(
          tester
              .widget<PhotoEditorScreen>(find.byType(PhotoEditorScreen))
              .userApi,
          same(userApi),
        );
        expect(
          camera.stops,
          1,
          reason: 'suspend exactly once before the editor',
        );
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
}
