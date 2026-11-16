import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../auth/data/auth_api.dart';
import '../application/photo_renderer.dart';
import '../data/post_api.dart';

class PublishedPhoto {
  const PublishedPhoto(this.bytes, this.postId);
  final Uint8List bytes;
  final String postId;
}

class PhotoEditorScreen extends StatefulWidget {
  const PhotoEditorScreen({
    super.key,
    required this.photo,
    this.api,
    this.ownerId,
  });
  final Uint8List photo;
  final PostApi? api;
  final String? ownerId;
  @override
  State<PhotoEditorScreen> createState() => _PhotoEditorScreenState();
}

class _PhotoEditorScreenState extends State<PhotoEditorScreen> {
  ui.Image? _image;
  String? _error;
  String _caption = '';
  final _captionController = TextEditingController();
  PhotoFilter _filter = PhotoFilter.original;
  bool _sending = false;
  Uint8List? _exported;
  String? _requestId;
  late final PostApi _api = widget.api ?? PostApi();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final codec = await ui.instantiateImageCodec(
        widget.photo,
        targetWidth: 1600,
        allowUpscaling: false,
      );
      final ui.Image image;
      try {
        image = (await codec.getNextFrame()).image;
      } finally {
        codec.dispose();
      }
      if (!mounted) {
        image.dispose();
        return;
      }
      setState(() => _image = image);
    } catch (_) {
      if (mounted) setState(() => _error = 'Không đọc được ảnh. Hãy chụp lại.');
    }
  }

  @override
  void dispose() {
    _captionController.dispose();
    _image?.dispose();
    super.dispose();
  }

  void _invalidate() {
    _exported = null;
    _requestId = null;
    _error = null;
  }

  String _newId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Future<void> _editText() async {
    if (_sending) return;
    final controller = _captionController..text = _caption;
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF202020),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          24,
          24,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const ValueKey('photo-caption'),
                controller: controller,
                autofocus: true,
                maxLength: 200,
                maxLines: 3,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  hintText: 'Thêm một tin nhắn',
                  hintStyle: TextStyle(color: Colors.white54),
                  counterStyle: TextStyle(color: Colors.white54),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => Navigator.pop(context, controller.text.trim()),
                child: const Text('Xong'),
              ),
            ],
          ),
        ),
      ),
    );
    if (mounted && result != null && result != _caption) {
      setState(() {
        _caption = result;
        _invalidate();
      });
    }
  }

  Future<void> _send() async {
    if (_sending || _image == null) return;
    final ownerId = widget.ownerId ?? AuthApi.userId;
    if (ownerId == null || ownerId.isEmpty) {
      setState(() => _error = 'Hãy đăng nhập để gửi ảnh.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      _exported ??= await PhotoRenderer.render(_image!, _filter, _caption);
      _requestId ??= _newId();
      final post = await _api.publishPhoto(
        ownerId: ownerId,
        requestId: _requestId!,
        png: _exported!,
        caption: _caption,
      );
      if (!mounted) return;
      setState(() => _sending = false);
      Navigator.pop(context, PublishedPhoto(_exported!, post['id'] as String));
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : 'Chưa gửi được ảnh. Ảnh vẫn ở đây, hãy thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_sending,
    child: Theme(
      data: ThemeData.dark(useMaterial3: true),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    const Text(
                      'Khoảnh khắc của bạn',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Một chút màu. Một lời nhắn.',
                      style: TextStyle(color: Colors.white54, fontSize: 13),
                    ),
                    const SizedBox(height: 28),
                    AspectRatio(
                      aspectRatio: 1,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(48),
                        child: ColoredBox(
                          color: const Color(0xFF1B1B1B),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              if (_image != null)
                                CustomPaint(
                                  key: const ValueKey('edited-photo'),
                                  painter: PhotoPainter(
                                    _image!,
                                    _filter,
                                    _caption,
                                  ),
                                )
                              else if (_error == null)
                                const Center(
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                  ),
                                ),
                              if (_caption.isEmpty && _image != null)
                                Align(
                                  alignment: const Alignment(0, .82),
                                  child: TextButton(
                                    onPressed: _sending ? null : _editText,
                                    style: TextButton.styleFrom(
                                      backgroundColor: Colors.black54,
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text(
                                      'Thêm một tin nhắn',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: PhotoFilter.values
                            .map(
                              (filter) => Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                child: ChoiceChip(
                                  label: Text(filter.label),
                                  selected: _filter == filter,
                                  selectedColor: const Color(0xFFFFC23A),
                                  labelStyle: TextStyle(
                                    color: _filter == filter
                                        ? Colors.black
                                        : Colors.white,
                                  ),
                                  onSelected: _sending
                                      ? null
                                      : (_) {
                                          if (_filter == filter) return;
                                          setState(() {
                                            _filter = filter;
                                            _invalidate();
                                          });
                                        },
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        IconButton(
                          tooltip: 'Chụp lại',
                          onPressed: _sending
                              ? null
                              : () => Navigator.pop(context),
                          icon: const Icon(Icons.close_rounded, size: 38),
                        ),
                        SizedBox(
                          width: 96,
                          height: 96,
                          child: FilledButton(
                            key: const ValueKey('send-photo'),
                            onPressed: _sending || _image == null
                                ? null
                                : _send,
                            style: FilledButton.styleFrom(
                              shape: const CircleBorder(),
                              backgroundColor: const Color(0xFFFFC23A),
                              foregroundColor: Colors.black,
                            ),
                            child: _sending
                                ? const SizedBox(
                                    width: 28,
                                    height: 28,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 3,
                                    ),
                                  )
                                : const Icon(Icons.send_rounded, size: 40),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Thêm chữ',
                          onPressed: _sending ? null : _editText,
                          icon: const Icon(Icons.text_fields_rounded, size: 36),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _sending ? 'Đang gửi ảnh…' : 'Gửi khoảnh khắc',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 18),
                        child: Text(
                          _error!,
                          key: const ValueKey('photo-error'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFFFA998)),
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
  );
}
