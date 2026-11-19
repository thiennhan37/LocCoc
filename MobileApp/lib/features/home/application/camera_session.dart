import 'dart:async';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

enum CameraStatus { loading, ready, denied, unavailable, failed, suspended }

/// Owns native camera resources. Operations are serialized across lifecycle changes.
class CameraSession extends ChangeNotifier {
  CameraSession({this.operationTimeout = const Duration(seconds: 10)});
  final Duration operationTimeout;
  CameraController? _controller;
  Future<void>? _retiring;
  List<CameraDescription> _cameras = [];
  Future<void> _pending = Future.value();
  bool _closed = false;
  bool _active = false;
  int _generation = 0;
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
    if (_closed) return Future.value();
    if (_active &&
        (status == CameraStatus.ready || status == CameraStatus.loading)) {
      return _pending;
    }
    _active = true;
    final generation = ++_generation;
    return _enqueue(() async {
      if (_active && generation == _generation) await _open(generation);
    });
  }

  Future<void> _open(int generation) async {
    if (!_active || _closed) return;
    if (_controller?.value.isInitialized == true) {
      status = CameraStatus.ready;
      _notify();
      return;
    }
    status = CameraStatus.loading;
    message = '';
    _notify();
    try {
      if (!await _release()) {
        _recoveryRequired();
        return;
      }
      if (!_active || _closed || generation != _generation) return;
      _cameras = await availableCameras().timeout(operationTimeout);
      if (_cameras.isEmpty) {
        status = CameraStatus.unavailable;
        message = 'Thiết bị này chưa có camera khả dụng.';
        return;
      }
      if (!_active || _closed || generation != _generation) return;
      _index %= _cameras.length;
      final controller = CameraController(
        _cameras[_index],
        ResolutionPreset.high,
        enableAudio: false,
      );
      _controller = controller;
      await controller.initialize().timeout(operationTimeout);
      if (!_active || _closed || generation != _generation) {
        await _release();
        return;
      }
      flash = false;
      status = CameraStatus.ready;
    } on TimeoutException {
      _recoveryRequired();
      await _release();
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
    if (_closed) return _pending;
    _active = false;
    _generation++;
    return _enqueue(() async {
      // A later resume may supersede an open, but never this teardown: native
      // interruption can invalidate a controller that still says initialized.
      status = CameraStatus.suspended;
      _notify();
      if (!await _release()) {
        _recoveryRequired();
        _notify();
      }
    });
  }

  Future<void> flip() => _enqueue(() async {
    if (!ready || !canFlip || photo != null) return;
    final generation = ++_generation;
    _index = (_index + 1) % _cameras.length;
    status = CameraStatus.loading;
    _notify();
    if (!await _release()) {
      _recoveryRequired();
      _notify();
      return;
    }
    if (generation == _generation) await _open(generation);
  });

  Future<void> toggleFlash() => _enqueue(() async {
    if (!ready || photo != null) return;
    try {
      await _controller!
          .setFlashMode(flash ? FlashMode.off : FlashMode.auto)
          .timeout(operationTimeout);
      flash = !flash;
      message = '';
    } on CameraException {
      message = 'Camera này chưa hỗ trợ chế độ flash.';
    } on UnsupportedError {
      message = 'Camera này chưa hỗ trợ chế độ flash.';
    } on TimeoutException {
      _recoveryRequired();
      _notify();
      await _release();
    }
    _notify();
  });

  Future<void> capture() {
    final generation = _generation;
    return _enqueue(() async {
      if (generation != _generation) return;
      if (!ready || photo != null || !_active) return;
      busy = true;
      _notify();
      try {
        final file = await _controller!.takePicture().timeout(operationTimeout);
        final bytes = await file.readAsBytes().timeout(operationTimeout);
        if (!_closed && _active && generation == _generation) photo = bytes;
        message = '';
      } on TimeoutException {
        _recoveryRequired();
        _notify();
        await _release();
      } on CameraException {
        message = 'Chưa chụp được ảnh. Bạn thử lại nhé.';
      } catch (_) {
        message = 'Không thể đọc ảnh vừa chụp. Bạn thử lại nhé.';
      } finally {
        busy = false;
        _notify();
      }
    });
  }

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

  void _recoveryRequired() {
    status = CameraStatus.failed;
    message = 'Camera phản hồi quá lâu. Hãy thử mở lại camera.';
  }

  Future<bool> _release() async {
    final old = _controller;
    _controller = null;
    if (old != null) {
      _retiring = old.dispose();
    }
    final retiring = _retiring;
    if (retiring == null) return true;
    try {
      await retiring.timeout(operationTimeout);
      if (identical(_retiring, retiring)) _retiring = null;
      return true;
    } on TimeoutException {
      // Keep the real disposal future as a barrier. Timeout is not cancellation:
      // opening another native camera now would race the old camera's teardown.
      return false;
    } catch (_) {
      if (identical(_retiring, retiring)) _retiring = null;
      return false;
    }
  }

  @override
  void dispose() {
    _closed = true;
    _active = false;
    _generation++;
    unawaited(
      _pending.then<void>((_) async {
        await _release();
      }),
    );
    super.dispose();
  }
}
