import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../data/post_api.dart';

/// Paid generation is explicit and independent of publishing.
class AiPreviewScreen extends StatefulWidget {
  const AiPreviewScreen({super.key, required this.source, required this.api});
  final Uint8List source;
  final PostApi api;
  @override
  State<AiPreviewScreen> createState() => _AiPreviewScreenState();
}

class _AiPreviewScreenState extends State<AiPreviewScreen> {
  String _filter = 'handwritten_diary';
  Uint8List? _result;
  bool _busy = false;
  bool _original = false;
  String? _error;

  String _attemptId() {
    final random = Random.secure();
    final bytes = List.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  Future<void> _generate() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.api.enhancePhoto(
        requestId: _attemptId(),
        png: widget.source,
        filterId: _filter,
      );
      if (!mounted) return;
      // Verify decoding before enabling accept; no provider request here.
      final codec = await ui.instantiateImageCodec(
        result,
        targetWidth: 1600,
        allowUpscaling: false,
      );
      try {
        (await codec.getNextFrame()).image.dispose();
      } finally {
        codec.dispose();
      }
      if (mounted) setState(() => _result = result);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Chưa sửa được ảnh. Ảnh gốc vẫn còn. Tạo lại có thể phát sinh thêm phí.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Sửa ảnh bằng AI'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Hủy'),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 540),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: GestureDetector(
                    onLongPressStart: (_) => setState(() => _original = true),
                    onLongPressEnd: (_) => setState(() => _original = false),
                    child: ColoredBox(
                      color: Colors.grey.shade300,
                      child: Image.memory(
                        _original ? widget.source : (_result ?? widget.source),
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),
                const Text('Nhấn giữ ảnh để xem ảnh gốc'),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final entry in const {
                      'handwritten_diary': 'Nhật ký viết tay',
                      'subject_sticker': 'Sticker chủ thể',
                    }.entries)
                      ChoiceChip(
                        label: Text(entry.value),
                        selected: _filter == entry.key,
                        onSelected: _busy
                            ? null
                            : (_) => setState(() {
                                if (_filter != entry.key) {
                                  _filter = entry.key;
                                  _result = null;
                                  _error = null;
                                }
                              }),
                      ),
                  ],
                ),
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Mỗi lần tạo hoặc tạo lại ảnh dùng API AI: 2.000đ. Đăng ảnh đã tạo không gọi AI thêm.',
                  ),
                ),
                FilledButton(
                  key: const ValueKey('generate-ai'),
                  onPressed: _busy ? null : _generate,
                  child: Text(
                    _busy
                        ? 'AI đang sửa ảnh…'
                        : _result == null
                        ? 'Tạo với AI · 2.000đ'
                        : 'Tạo lại · 2.000đ',
                  ),
                ),
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                if (_result != null)
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.pop(context, _result),
                    child: const Text('Dùng ảnh này'),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
