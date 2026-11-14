import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/navigation/app_route_observer.dart';
import 'package:mobile_app/features/home/application/camera_session.dart';
import 'package:mobile_app/features/home/presentation/home_screen.dart';

class FakeCameraSession extends CameraSession {
  int starts = 0;
  int stops = 0;

  @override
  bool get ready => status == CameraStatus.ready;
  @override
  bool get canFlip => true;

  @override
  Future<void> start() async {
    starts++;
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Widget preview() => const ColoredBox(color: Color(0xFFABBCB4));
  @override
  Future<void> capture() async {
    photo = Uint8List.fromList(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAxSURBVFhH7c4hAQAACMAwItKI6OAJAGbi5mrRlf1Z7HEdAAAAAAAAAAAAAAAAAADAAPlINKZoOLjRAAAAAElFTkSuQmCC',
      ),
    );
    notifyListeners();
  }
}

Future<void> mountHome(
  WidgetTester tester,
  FakeCameraSession camera, {
  Size size = const Size(390, 900),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      navigatorObservers: [appRouteObserver],
      home: HomeScreen(camera: camera),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('a covered home does not reopen camera on app resume', (
    tester,
  ) async {
    final camera = FakeCameraSession()..status = CameraStatus.ready;
    await mountHome(tester, camera);
    final context = tester.element(find.byType(HomeScreen));
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Another page')),
      ),
    );
    await tester.pumpAndSettle();
    expect(camera.stops, greaterThan(0));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(camera.starts, 1);
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    expect(camera.starts, 2);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('opens camera on entry and handles denied permission', (
    tester,
  ) async {
    final camera = FakeCameraSession()
      ..status = CameraStatus.denied
      ..message = 'Cho phép Camera trong Cài đặt của thiết bị.';
    await mountHome(tester, camera);
    expect(camera.starts, 1);
    expect(find.text('Cho LocCoc nhìn thấy bạn nhé'), findsOneWidget);
    await tester.tap(find.text('Thử mở camera'));
    await tester.pump();
    expect(camera.starts, 2);
    final shutter = tester.widget<OutlinedButton>(
      find.byKey(const ValueKey('camera-shutter')),
    );
    expect(shutter.onPressed, isNull);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('capture opens editor and retake releases the draft', (
    tester,
  ) async {
    final camera = FakeCameraSession()..status = CameraStatus.ready;
    await mountHome(tester, camera);
    await tester.ensureVisible(find.byKey(const ValueKey('camera-shutter')));
    await tester.tap(find.byKey(const ValueKey('camera-shutter')));
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
    expect(find.text('Khoảnh khắc của bạn'), findsOneWidget);
    expect(camera.stops, greaterThan(0));
    await tester.ensureVisible(find.byTooltip('Chụp lại'));
    await tester.tap(find.byTooltip('Chụp lại'));
    await tester.pumpAndSettle();
    expect(camera.photo, isNull);
    await tester.tap(find.text('Kỷ niệm'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Khoảnh khắc 1'), findsNothing);
    expect(camera.stops, greaterThan(0));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });

  testWidgets('compact layout and lifecycle release camera', (tester) async {
    final camera = FakeCameraSession()
      ..status = CameraStatus.unavailable
      ..message = 'Thiết bị này chưa có camera khả dụng.';
    await mountHome(tester, camera, size: const Size(320, 640));
    expect(tester.takeException(), isNull);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(camera.stops, greaterThan(0));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(camera.starts, 2);
    await tester.tap(find.text('Kỷ niệm'));
    await tester.pumpAndSettle();
    expect(find.text('Những điều\nmuốn giữ lại.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    camera.dispose();
  });
}
