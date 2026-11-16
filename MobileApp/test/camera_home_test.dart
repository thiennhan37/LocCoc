import 'dart:async';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'user_social_test.dart' as fixtures;
import 'package:image_picker/image_picker.dart';
import 'package:mobile_app/features/users/data/profile_image_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/application/camera_session.dart';
import 'package:mobile_app/features/home/presentation/screens/capture_moment_screen.dart';

class TestCamera extends CameraSession {
  int starts = 0;
  int stops = 0;
  @override
  Future<void> start() async {
    starts++;
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Widget preview() => const ColoredBox(color: Colors.grey);
}

class FailedCapture extends TestCamera {
  @override
  bool get ready => true;
  @override
  Future<void> capture() async {
    message = 'Chưa chụp được ảnh. Bạn thử lại nhé.';
    notifyListeners();
  }
}

class DelayedCapture extends FailedCapture {
  final finished = Completer<void>();
  @override
  Future<void> capture() async {
    await finished.future;
  }
}

class CancelPicker extends ProfileImagePicker {
  @override
  Future<PickedProfileImage?> pick(ImageSource source, String kind) async =>
      null;
}

void main() {
  testWidgets(
    'compact large-text camera advances to feed when dragged past its bottom',
    (tester) async {
      tester.view.physicalSize = const Size(320, 480);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final camera = TestCamera()..status = CameraStatus.ready;
      var advances = 0;
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: CaptureMomentScreen(
            ownerId: 'owner',
            camera: camera,
            embedded: true,
            header: const Text('Bạn bè'),
            onHistory: () => advances++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -600),
      );
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -300),
      );
      await tester.pumpAndSettle();
      expect(advances, greaterThan(0));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      camera.dispose();
    },
  );

  testWidgets('parent refresh does not interrupt an in-flight shutter', (
    tester,
  ) async {
    final camera = DelayedCapture()..status = CameraStatus.ready;
    late StateSetter update;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return CaptureMomentScreen(ownerId: 'owner', camera: camera);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('capture-moment')));
    await tester.tap(find.byKey(const ValueKey('capture-moment')));
    await tester.pump();
    update(() {});
    await tester.pump();
    expect(camera.stops, 0);
    camera.finished.complete();
    await tester.pumpAndSettle();
    expect(camera.starts, 1);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('failed capture keeps the error and does not reopen camera', (
    tester,
  ) async {
    final camera = FailedCapture()..status = CameraStatus.ready;
    await tester.pumpWidget(
      MaterialApp(
        home: CaptureMomentScreen(ownerId: 'owner', camera: camera),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('capture-moment')));
    await tester.tap(find.byKey(const ValueKey('capture-moment')));
    await tester.pumpAndSettle();
    expect(camera.starts, 1);
    expect(camera.stops, 0);
    expect(find.text('Chưa chụp được ảnh. Bạn thử lại nhé.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('Home opens camera on black and moves stories to Friends', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final camera = TestCamera()..status = CameraStatus.ready;
    final api = fixtures.apiFor(
      (request) async => fixtures.json({
        'friendCount': 3,
        'unseenCount': 0,
        'unreadCount': 0,
        'data': [],
        'hasMore': false,
        'nextCursor': null,
      }),
    );
    final boundary = GlobalKey();
    await tester.pumpWidget(
      MaterialApp(
        home: RepaintBoundary(
          key: boundary,
          child: HomeScreen(
            session: fixtures.session,
            userApi: api,
            camera: camera,
            profile: const {'displayName': 'Phat Tran', 'username': 'phattran'},
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(camera.starts, 1);
    expect(find.text('Một chút hôm nay.'), findsNothing);
    expect(find.text('3 Bạn bè'), findsOneWidget);
    expect(
      find.byTooltip('Chọn ảnh từ thư viện').hitTestable(),
      findsOneWidget,
    );
    expect(find.text('Lịch sử').hitTestable(), findsOneWidget);
    expect(
      tester
          .widgetList<Scaffold>(find.byType(Scaffold))
          .every((s) => s.backgroundColor == Colors.black),
      isTrue,
    );
    await tester.tap(find.byKey(const Key('home_tab_friends')));
    await tester.pumpAndSettle();
    expect(find.text('Một chút hôm nay.'), findsOneWidget);
    expect(
      tester
          .widgetList<Scaffold>(find.byType(Scaffold))
          .every(
            (s) =>
                s.backgroundColor == null || s.backgroundColor == Colors.black,
          ),
      isTrue,
    );
    expect(
      Theme.of(
        tester.element(find.text('Một chút hôm nay.')),
      ).scaffoldBackgroundColor,
      Colors.black,
    );
    for (final tab in ['memories', 'profile']) {
      await tester.tap(find.byKey(Key('home_tab_$tab')));
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byKey(Key('home_tab_$tab')))).brightness,
        Brightness.dark,
      );
    }

    expect(camera.stops, greaterThan(0));
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('home_tab_home')));
    await tester.pumpAndSettle();
    expect(camera.starts, 2);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets(
    'gallery cancellation resumes camera even when permission was denied',
    (tester) async {
      final camera = TestCamera()..status = CameraStatus.denied;
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: CaptureMomentScreen(
            ownerId: 'owner',
            camera: camera,
            embedded: true,
            imagePicker: CancelPicker(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Chọn ảnh từ thư viện'));
      await tester.tap(find.byTooltip('Chọn ảnh từ thư viện'));
      await tester.pumpAndSettle();
      expect(camera.starts, 2);
      expect(camera.stops, greaterThan(0));
      expect(find.byType(CaptureMomentScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      camera.dispose();
    },
  );

  testWidgets('embedded camera follows tab and covered-route visibility', (
    tester,
  ) async {
    final camera = TestCamera()..status = CameraStatus.ready;
    var active = true;
    late StateSetter update;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return CaptureMomentScreen(
              ownerId: 'owner',
              camera: camera,
              embedded: true,
              active: active,
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(camera.starts, 1);
    expect(find.byTooltip('Chọn ảnh từ thư viện'), findsOneWidget);
    update(() => active = false);
    await tester.pumpAndSettle();
    expect(camera.stops, 1);
    update(() => active = true);
    await tester.pumpAndSettle();
    expect(camera.starts, 2);
    final context = tester.element(find.byType(CaptureMomentScreen));
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Covered')),
      ),
    );
    await tester.pumpAndSettle();
    expect(camera.stops, 2);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(camera.starts, 2);
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(camera.starts, 3);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });
}
