import 'dart:async';
import 'package:flutter/material.dart';
import '../../application/camera_session.dart';
import '../../../posts/presentation/photo_editor_screen.dart';

/// Camera is owned by this route and released while editing or backgrounded.
class CaptureMomentScreen extends StatefulWidget {
  const CaptureMomentScreen({super.key, required this.ownerId, this.camera});
  final String ownerId;
  final CameraSession? camera;

  @override
  State<CaptureMomentScreen> createState() => _CaptureMomentScreenState();
}

class _CaptureMomentScreenState extends State<CaptureMomentScreen>
    with WidgetsBindingObserver {
  late final CameraSession _camera = widget.camera ?? CameraSession();
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_camera.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_editing) {
      unawaited(_camera.start());
    } else if (state != AppLifecycleState.resumed) {
      unawaited(_camera.stop());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (widget.camera == null) {
      _camera.dispose();
    } else {
      unawaited(_camera.stop());
    }
    super.dispose();
  }

  Future<void> _capture() async {
    if (_editing) return;
    setState(() => _editing = true);
    await _camera.capture();
    if (!mounted) return;
    final photo = _camera.photo;
    if (photo == null) {
      setState(() => _editing = false);
      return;
    }
    await _camera.stop();
    if (!mounted) return;
    final result = await Navigator.of(context).push<PublishedPhoto>(
      MaterialPageRoute(
        builder: (_) =>
            PhotoEditorScreen(photo: photo, ownerId: widget.ownerId),
      ),
    );
    if (!mounted) return;
    if (result != null) {
      Navigator.pop(context, result);
      return;
    }
    _camera.retake();
    setState(() => _editing = false);
    if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      unawaited(_camera.start());
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: ThemeData.dark(useMaterial3: true),
    child: Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Khoảnh khắc của bạn'),
        backgroundColor: Colors.black,
      ),
      body: SafeArea(
        child: AnimatedBuilder(
          animation: _camera,
          builder: (context, _) => Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 540),
                child: Column(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(40),
                      child: AspectRatio(
                        aspectRatio: 1,
                        child: _camera.status == CameraStatus.ready
                            ? _camera.preview()
                            : Center(
                                child: _camera.status == CameraStatus.loading
                                    ? const CircularProgressIndicator()
                                    : Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            _camera.message,
                                            textAlign: TextAlign.center,
                                          ),
                                          TextButton(
                                            onPressed: _camera.start,
                                            child: const Text('Thử lại'),
                                          ),
                                        ],
                                      ),
                              ),
                      ),
                    ),
                    if (_camera.message.isNotEmpty &&
                        _camera.status == CameraStatus.ready)
                      Text(_camera.message),
                    const SizedBox(height: 32),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        IconButton(
                          tooltip: 'Flash',
                          onPressed: _camera.ready && !_editing
                              ? _camera.toggleFlash
                              : null,
                          icon: Icon(
                            _camera.flash ? Icons.flash_on : Icons.flash_off,
                          ),
                        ),
                        IconButton.filled(
                          key: const ValueKey('capture-moment'),
                          tooltip: 'Chụp ảnh',
                          iconSize: 64,
                          onPressed: _camera.ready && !_editing
                              ? _capture
                              : null,
                          icon: const Icon(Icons.camera_alt_outlined),
                        ),
                        IconButton(
                          tooltip: 'Đổi camera',
                          onPressed:
                              _camera.ready && _camera.canFlip && !_editing
                              ? _camera.flip
                              : null,
                          icon: const Icon(Icons.flip_camera_android_outlined),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
