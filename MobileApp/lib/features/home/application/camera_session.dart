import 'dart:async';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

enum CameraStatus { loading, ready, denied, unavailable, failed, suspended }

/// Owns native camera resources. Operations are serialized across lifecycle changes.
class CameraSession extends ChangeNotifier {
  CameraController? _controller;
  List<CameraDescription> _cameras = [];
  Future<void> _pending = Future.value();
  bool _closed = false;
  bool _active = false;
  int _index = 0;
  CameraStatus status = CameraStatus.loading;
  String message = '';
  bool busy = false;
  bool flash = false;
  Uint8List? photo;

  bool get canFlip => _cameras.length > 1;
  bool get ready =>
      status == CameraStatus.ready && !busy && _active && !_closed;

  void _notify() {
    if (!_closed) notifyListeners();
  }

  Future<void> _enqueue(Future<void> Function() action) {
    final next = _pending.then((_) async {
      if (!_closed) await action();
    });
    _pending = next.catchError((Object _) {});
    return next;
  }

  Future<void> start() {
    _active = true;
    return _enqueue(_open);
  }

  Future<void> _open() async {
    if (!_active || _closed) return;
    status = CameraStatus.loading;
    message = '';
    _notify();
    try {
      await _release();
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        status = CameraStatus.unavailable;
        message = 'Thiết bị này chưa có camera khả dụng.';
        return;
      }
      if (!_active || _closed) return;
      _index %= _cameras.length;
      final controller = CameraController(
        _cameras[_index],
        ResolutionPreset.high,
        enableAudio: false,
      );
      _controller = controller;
      await controller.initialize();
      if (!_active || _closed) {
        await _release();
        return;
      }
      flash = false;
      status = CameraStatus.ready;
    } on CameraException catch (error) {
      final denied = error.code.startsWith('CameraAccess');
      status = denied ? CameraStatus.denied : CameraStatus.failed;
      message = denied
          ? 'Cho phép Camera trong Cài đặt của thiết bị để chụp khoảnh khắc. '
                'Nếu quyền bị hạn chế, hãy kiểm tra giới hạn của thiết bị.'
          : 'Chưa thể mở camera. Hãy đóng ứng dụng khác đang dùng camera và thử lại.';
      await _release();
    } catch (_) {
      status = CameraStatus.unavailable;
      message =
          'Camera chưa được hỗ trợ ở đây. Hãy mở LocCoc trên Android hoặc iPhone.';
      await _release();
    } finally {
      _notify();
    }
  }

  Future<void> stop() {
    _active = false;
    return _enqueue(() async {
      await _release();
      status = CameraStatus.suspended;
      _notify();
    });
  }

  Future<void> flip() => _enqueue(() async {
    if (!ready || !canFlip || photo != null) return;
    _index = (_index + 1) % _cameras.length;
    await _open();
  });

  Future<void> toggleFlash() => _enqueue(() async {
    if (!ready || photo != null) return;
    try {
      await _controller!.setFlashMode(flash ? FlashMode.off : FlashMode.auto);
      flash = !flash;
      message = '';
    } on CameraException {
      message = 'Camera này chưa hỗ trợ chế độ flash.';
    } on UnsupportedError {
      message = 'Camera này chưa hỗ trợ chế độ flash.';
    }
    _notify();
  });

  Future<void> capture() => _enqueue(() async {
    if (!ready || photo != null || !_active) return;
    busy = true;
    _notify();
    try {
      final file = await _controller!.takePicture();
      final bytes = await file.readAsBytes();
      if (!_closed && _active) photo = bytes;
      message = '';
    } on CameraException {
      message = 'Chưa chụp được ảnh. Bạn thử lại nhé.';
    } catch (_) {
      message = 'Không thể đọc ảnh vừa chụp. Bạn thử lại nhé.';
    } finally {
      busy = false;
      _notify();
    }
  });

  void retake() {
    photo = null;
    _notify();
  }

  Widget preview() {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const SizedBox.shrink();
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final portrait =
            MediaQuery.orientationOf(context) == Orientation.portrait;
        final size = controller.value.previewSize!;
        return ClipRect(
          child: SizedBox.expand(
            child: FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: portrait ? size.height : size.width,
                height: portrait ? size.width : size.height,
                child: CameraPreview(controller),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _release() async {
    final old = _controller;
    _controller = null;
    if (old != null) {
      try {
        await old.dispose();
      } on CameraException {
        // Native resources may already be gone after interruption or permission revocation.
      }
    }
  }

  @override
  void dispose() {
    _closed = true;
    _active = false;
    unawaited(_pending.then((_) => _release()));
    super.dispose();
  }
}
