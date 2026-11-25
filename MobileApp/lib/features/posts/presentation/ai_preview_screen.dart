import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../auth/data/services/auth_api_client.dart';
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
    } catch (error) {
      if (mounted) {
        final throttled =
            (error is AuthApiException && error.statusCode == 429) ||
            (error is ApiException && error.statusCode == 429);
        setState(
          () => _error = throttled
              ? 'Bạn đang thao tác quá nhanh (chạm giới hạn lượt mỗi phút). Hãy đợi khoảng 1 phút rồi thử lại.'
              : 'Chưa sửa được ảnh. Ảnh gốc vẫn còn. Tạo lại có thể phát sinh thêm phí.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final showCheckerboard =
        _result != null && _filter == 'subject_sticker' && !_original;
    return Theme(
      data: ThemeData.dark(useMaterial3: true),
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          centerTitle: true,
          title: const Text(
            'Sửa ảnh bằng AI',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primaryLight,
              ),
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
                        onLongPressStart: (_) =>
                            setState(() => _original = true),
                        onLongPressEnd: (_) =>
                            setState(() => _original = false),
                        onLongPressCancel: () =>
                            setState(() => _original = false),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(24),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: const Color(0xFF161616),
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                color: const Color(0xFF2A2A2A),
                              ),
                            ),
                            child: CustomPaint(
                              painter: showCheckerboard
                                  ? const _DarkCheckerboardPainter()
                                  : null,
                              child: Image.memory(
                                _original
                                    ? widget.source
                                    : (_result ?? widget.source),
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Nhấn giữ ảnh để xem ảnh gốc',
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    const SizedBox(height: 12),
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
                            backgroundColor: const Color(0xFF1A1A1A),
                            selectedColor: const Color(0xFF3B1D1A),
                            checkmarkColor: AppColors.primaryLight,
                            side: BorderSide(
                              color: _filter == entry.key
                                  ? AppColors.primaryLight
                                  : const Color(0xFF3A3A3A),
                            ),
                            labelStyle: TextStyle(
                              color: _filter == entry.key
                                  ? Colors.white
                                  : Colors.white70,
                              fontWeight: _filter == entry.key
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                            ),
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
                      padding: EdgeInsets.all(14),
                      child: Text(
                        'Mỗi lần tạo hoặc tạo lại ảnh dùng API AI: 2.000đ. Đăng ảnh đã tạo không gọi AI thêm.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white70, fontSize: 13.5),
                      ),
                    ),
                    FilledButton(
                      key: const ValueKey('generate-ai'),
                      onPressed: _busy ? null : _generate,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xFF2C2C2C),
                        disabledForegroundColor: Colors.white54,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 14,
                        ),
                      ),
                      child: Text(
                        _busy
                            ? 'AI đang sửa ảnh…'
                            : _result == null
                            ? 'Tạo với AI · 2.000đ'
                            : 'Tạo lại · 2.000đ',
                      ),
                    ),
                    if (_busy)
                      const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: LinearProgressIndicator(
                          color: AppColors.primaryLight,
                          backgroundColor: Color(0xFF2A2A2A),
                        ),
                      ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.primaryLight),
                        ),
                      ),
                    if (_result != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextButton(
                          onPressed: _busy
                              ? null
                              : () => Navigator.pop(context, _result),
                          style: TextButton.styleFrom(
                            foregroundColor: const Color(0xFFFFC23A),
                          ),
                          child: const Text(
                            'Dùng ảnh này',
                            style: TextStyle(
                              fontSize: 16,
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
        ),
      ),
    );
  }
}

class _DarkCheckerboardPainter extends CustomPainter {
  const _DarkCheckerboardPainter();

  @override
  void paint(Canvas canvas, Size size) {
    const cell = 16.0;
    final dark = Paint()..color = const Color(0xFF141414);
    final light = Paint()..color = const Color(0xFF222222);
    for (var y = 0.0, row = 0; y < size.height; y += cell, row++) {
      for (var x = 0.0, col = 0; x < size.width; x += cell, col++) {
        canvas.drawRect(
          Rect.fromLTWH(
            x,
            y,
            min(cell, size.width - x),
            min(cell, size.height - y),
          ),
          (row + col).isEven ? dark : light,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
