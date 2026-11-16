import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../users/data/user_api_client.dart';
import '../../../users/data/profile_image_picker.dart';
import '../../application/camera_session.dart';
import '../../../posts/presentation/photo_editor_screen.dart';

/// Owns camera resources only while this surface is visible and foregrounded.
class CaptureMomentScreen extends StatefulWidget {
  const CaptureMomentScreen({
    super.key,
    required this.ownerId,
    this.camera,
    this.userApi,
    this.embedded = false,
    this.active = true,
    this.header,
    this.onHistory,
    this.onPublished,
    this.imagePicker,
  });
  final String ownerId;
  final UserApiClient? userApi;
  final CameraSession? camera;
  final ProfileImagePicker? imagePicker;
  final bool embedded;
  final bool active;
  final Widget? header;
  final VoidCallback? onHistory;
  final ValueChanged<PublishedPhoto>? onPublished;
  @override
  State<CaptureMomentScreen> createState() => _CaptureMomentScreenState();
}

class _CaptureMomentScreenState extends State<CaptureMomentScreen>
    with WidgetsBindingObserver {
  late final CameraSession _camera = widget.camera ?? CameraSession();
  late final ProfileImagePicker _picker =
      widget.imagePicker ?? ProfileImagePicker();
  bool _editing = false;
  bool _mediaSuspended = false;
  bool _visible = false;
  bool _running = false;
  bool _foreground = true;
  double _edgeDrag = 0;
  bool _advancedFromEdge = false;

  bool _onCameraScroll(ScrollNotification notification) {
    if (!widget.embedded ||
        !widget.active ||
        _editing ||
        widget.onHistory == null) {
      return false;
    }
    if (notification is ScrollStartNotification) {
      _edgeDrag = 0;
      _advancedFromEdge = false;
    }
    // On short screens the camera has its own scrollable content. Once it
    // reaches the bottom, continue the same upward gesture into the feed.
    if (notification is OverscrollNotification &&
        notification.dragDetails != null &&
        notification.overscroll > 0 &&
        !_advancedFromEdge) {
      _edgeDrag += notification.overscroll;
      if (_edgeDrag >= 40) {
        _advancedFromEdge = true;
        widget.onHistory!();
      }
    }
    return false;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final state = WidgetsBinding.instance.lifecycleState;
    _foreground = state == null || state == AppLifecycleState.resumed;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = ModalRoute.isCurrentOf(context) ?? true;
    _syncCamera();
  }

  @override
  void didUpdateWidget(CaptureMomentScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncCamera();
  }

  void _syncCamera() {
    final run = widget.active && _visible && _foreground && !_mediaSuspended;
    if (_running == run) return;
    _running = run;
    unawaited(run ? _camera.start() : _camera.stop());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _syncCamera();
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

  Future<void> _takePhoto({bool gallery = false}) async {
    if (_editing) return;
    setState(() => _editing = true);
    try {
      Uint8List? photo;
      if (gallery) {
        _mediaSuspended = true;
        _syncCamera();
        await _camera.stop();
        final picked = await _picker.pick(ImageSource.gallery, 'post');
        photo = picked?.bytes;
      } else {
        await _camera.capture();
        photo = _camera.photo;
        if (photo == null) return;
        _mediaSuspended = true;
        _syncCamera();
        await _camera.stop();
      }
      if (!mounted || photo == null) return;
      final result = await Navigator.of(context).push<PublishedPhoto>(
        MaterialPageRoute(
          builder: (_) => PhotoEditorScreen(
            photo: photo!,
            ownerId: widget.ownerId,
            userApi: widget.userApi,
          ),
        ),
      );
      if (!mounted) return;
      if (result != null) {
        if (widget.embedded) {
          widget.onPublished?.call(result);
        } else {
          Navigator.pop(context, result);
        }
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is FormatException
                  ? error.message
                  : 'Chưa thể mở ảnh. Bạn thử lại nhé.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        _camera.retake();
        _mediaSuspended = false;
        setState(() => _editing = false);
        _syncCamera();
      }
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: ThemeData.dark(useMaterial3: true).copyWith(
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFFFFC928),
        surface: Color(0xFF202020),
      ),
    ),
    child: Scaffold(
      backgroundColor: Colors.black,
      appBar: widget.embedded
          ? null
          : AppBar(
              title: const Text('Khoảnh khắc của bạn'),
              backgroundColor: Colors.black,
            ),
      body: SafeArea(
        top: !widget.embedded,
        bottom: !widget.embedded,
        child: AnimatedBuilder(
          animation: _camera,
          builder: (context, _) => LayoutBuilder(
            builder: (context, constraints) => NotificationListener<ScrollNotification>(
              onNotification: _onCameraScroll,
              child: SingleChildScrollView(
                physics: widget.embedded ? const ClampingScrollPhysics() : null,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 540),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 12,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            if (widget.header != null) widget.header!,
                            const SizedBox(height: 24),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(48),
                              child: AspectRatio(
                                aspectRatio: 1,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    const ColoredBox(color: Color(0xFF202020)),
                                    if (_camera.status == CameraStatus.ready)
                                      _camera.preview()
                                    else
                                      Center(
                                        child: Padding(
                                          padding: const EdgeInsets.all(24),
                                          child:
                                              _camera.status ==
                                                      CameraStatus.loading &&
                                                  _running
                                              ? const CircularProgressIndicator()
                                              : Column(
                                                  mainAxisSize:
                                                      MainAxisSize.min,
                                                  children: [
                                                    const Icon(
                                                      Icons.camera_alt_outlined,
                                                      size: 40,
                                                    ),
                                                    const SizedBox(height: 12),
                                                    Text(
                                                      _camera.message.isEmpty
                                                          ? 'Camera đang tạm dừng.'
                                                          : _camera.message,
                                                      textAlign:
                                                          TextAlign.center,
                                                    ),
                                                    TextButton(
                                                      onPressed:
                                                          widget.active &&
                                                              !_editing
                                                          ? _camera.start
                                                          : null,
                                                      child: const Text(
                                                        'Thử lại',
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                        ),
                                      ),
                                    Positioned(
                                      top: 16,
                                      left: 16,
                                      child: IconButton.filledTonal(
                                        tooltip: 'Flash',
                                        style: IconButton.styleFrom(
                                          backgroundColor: Colors.black38,
                                        ),
                                        onPressed: _camera.ready && !_editing
                                            ? _camera.toggleFlash
                                            : null,
                                        icon: Icon(
                                          _camera.flash
                                              ? Icons.flash_on
                                              : Icons.flash_off,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (_camera.message.isNotEmpty &&
                                _camera.status == CameraStatus.ready)
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: Text(_camera.message),
                              ),
                            const SizedBox(height: 28),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                IconButton(
                                  tooltip: 'Chọn ảnh từ thư viện',
                                  iconSize: 36,
                                  onPressed: _editing
                                      ? null
                                      : () => _takePhoto(gallery: true),
                                  icon: const Icon(
                                    Icons.photo_library_outlined,
                                  ),
                                ),
                                Semantics(
                                  label: 'Chụp ảnh',
                                  button: true,
                                  child: SizedBox(
                                    width: 94,
                                    height: 94,
                                    child: OutlinedButton(
                                      key: const ValueKey('capture-moment'),
                                      onPressed: _camera.ready && !_editing
                                          ? _takePhoto
                                          : null,
                                      style: OutlinedButton.styleFrom(
                                        padding: const EdgeInsets.all(6),
                                        shape: const CircleBorder(),
                                        side: const BorderSide(
                                          color: Color(0xFFFFC928),
                                          width: 4,
                                        ),
                                      ),
                                      child: Container(
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: _camera.ready && !_editing
                                              ? Colors.white
                                              : Colors.white38,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Đổi camera',
                                  iconSize: 36,
                                  onPressed:
                                      _camera.ready &&
                                          _camera.canFlip &&
                                          !_editing
                                      ? _camera.flip
                                      : null,
                                  icon: const Icon(Icons.cameraswitch_outlined),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),
                            if (widget.onHistory != null)
                              TextButton.icon(
                                onPressed: _editing ? null : widget.onHistory,
                                style: TextButton.styleFrom(
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.keyboard_arrow_down),
                                label: const Text(
                                  'Lịch sử',
                                  style: TextStyle(
                                    fontSize: 21,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
