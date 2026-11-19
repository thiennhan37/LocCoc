import 'dart:async';
import 'dart:typed_data';
// Exercise the real CameraSession and CameraController, replacing only native IO.
// ignore: depend_on_referenced_packages
import 'package:camera_platform_interface/camera_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/application/camera_session.dart';

class NativeCamera extends CameraPlatform {
  int creates = 0;
  final disposed = <int>[];
  Completer<void>? closing;
  Completer<XFile>? shutter;
  final initialized = StreamController<CameraInitializedEvent>.broadcast();
  @override
  Future<List<CameraDescription>> availableCameras() async => const [
    CameraDescription(
      name: 'back',
      lensDirection: CameraLensDirection.back,
      sensorOrientation: 90,
    ),
    CameraDescription(
      name: 'front',
      lensDirection: CameraLensDirection.front,
      sensorOrientation: 90,
    ),
  ];
  @override
  Future<int> createCameraWithSettings(
    CameraDescription description,
    MediaSettings settings,
  ) async => ++creates;
  @override
  Stream<DeviceOrientationChangedEvent> onDeviceOrientationChanged() =>
      const Stream.empty();
  @override
  Stream<CameraInitializedEvent> onCameraInitialized(int id) =>
      initialized.stream.where((event) => event.cameraId == id);
  @override
  Stream<CameraErrorEvent> onCameraError(int id) =>
      Stream<CameraErrorEvent>.multi((_) {});
  @override
  Future<void> initializeCamera(
    int id, {
    ImageFormatGroup imageFormatGroup = ImageFormatGroup.unknown,
  }) async {
    initialized.add(
      CameraInitializedEvent(
        id,
        640,
        480,
        ExposureMode.auto,
        true,
        FocusMode.auto,
        true,
      ),
    );
  }

  @override
  Future<void> dispose(int id) async {
    disposed.add(id);
    await closing?.future;
  }

  @override
  Future<XFile> takePicture(int id) async => shutter == null
      ? XFile.fromData(Uint8List.fromList([1, 2, 3]))
      : await shutter!.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late NativeCamera native;
  late CameraPlatform previous;
  late CameraSession session;
  setUp(() {
    previous = CameraPlatform.instance;
    native = NativeCamera();
    CameraPlatform.instance = native;
    session = CameraSession();
  });
  tearDown(() async {
    await session.stop();
    session.dispose();
    await native.initialized.close();
    CameraPlatform.instance = previous;
  });

  test(
    'start on an already running camera does not recreate native resources',
    () async {
      await session.start();
      await Future.wait([session.start(), session.start()]);
      expect(session.ready, isTrue);
      expect(native.creates, 1);
      expect(native.disposed, isEmpty);
    },
  );
  test(
    'stop publishes suspended state before waiting for native disposal',
    () async {
      await session.start();
      native.closing = Completer<void>();
      final stop = session.stop();
      await Future<void>.delayed(Duration.zero);
      final stateWhileClosing = session.status;
      native.closing!.complete();
      await stop;
      expect(stateWhileClosing, CameraStatus.suspended);
    },
  );
  test(
    'rapid return and departure only opens the latest requested camera',
    () async {
      await session.start();
      native.closing = Completer<void>();
      final stop = session.stop();
      await Future<void>.delayed(Duration.zero);
      final firstReturn = session.start();
      final leaveAgain = session.stop();
      final finalReturn = session.start();
      native.closing!.complete();
      await Future.wait([stop, firstReturn, leaveAgain, finalReturn]);
      expect(session.ready, isTrue);
      expect(native.creates, 2);
    },
  );
  test(
    'capture finishing after leave and return cannot populate the new session',
    () async {
      await session.start();
      native.shutter = Completer<XFile>();
      final capture = session.capture();
      await Future<void>.delayed(Duration.zero);
      final stop = session.stop();
      final restart = session.start();
      native.shutter!.complete(XFile.fromData(Uint8List.fromList([1, 2, 3])));
      await Future.wait([capture, stop, restart]);
      expect(session.photo, isNull);
      expect(session.ready, isTrue);
      expect(
        native.creates,
        2,
        reason: 'return must renew the interrupted native camera',
      );
    },
  );
  test(
    'a stuck shutter times out and does not block stop or the next start',
    () async {
      session.dispose();
      session = CameraSession(
        operationTimeout: const Duration(milliseconds: 30),
      );
      await session.start();
      native.shutter = Completer<XFile>();
      await session.capture().timeout(const Duration(seconds: 1));
      expect(session.busy, isFalse);
      expect(session.status, CameraStatus.failed);
      await session.stop();
      await session.start();
      expect(session.ready, isTrue);
      expect(native.creates, 2);
      native.shutter!.completeError(
        CameraException('cancelled', 'native finished late'),
      );
    },
  );
  test(
    'a stuck disposal never opens a second native camera over the first',
    () async {
      session.dispose();
      session = CameraSession(
        operationTimeout: const Duration(milliseconds: 30),
      );
      await session.start();
      native.closing = Completer<void>();
      await session.stop().timeout(const Duration(seconds: 1));
      await session.start().timeout(const Duration(seconds: 1));
      expect(native.creates, 1);
      expect(session.ready, isFalse);
      native.closing!.complete();
      await session.start();
      expect(session.ready, isTrue);
      expect(native.creates, 2);
    },
  );
}
