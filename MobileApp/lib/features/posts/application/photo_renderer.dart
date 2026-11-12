import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

enum PhotoFilter {
  original('Gốc', [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]),
  mono('Đen trắng', [
    .2126,
    .7152,
    .0722,
    0,
    0,
    .2126,
    .7152,
    .0722,
    0,
    0,
    .2126,
    .7152,
    .0722,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]),
  warm('Ấm', [
    1.08,
    0,
    0,
    0,
    8,
    0,
    1.02,
    0,
    0,
    3,
    0,
    0,
    .9,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]),
  cool('Lạnh', [
    .93,
    0,
    0,
    0,
    0,
    0,
    1.02,
    0,
    0,
    3,
    0,
    0,
    1.08,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
  ]),
  vintage('Vintage', [
    .393,
    .769,
    .189,
    0,
    0,
    .349,
    .686,
    .168,
    0,
    0,
    .272,
    .534,
    .131,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]);

  const PhotoFilter(this.label, this.matrix);
  final String label;
  final List<double> matrix;
}

class PhotoRenderer {
  static const dimension = 1080;
  static void paint(
    Canvas canvas,
    Size size,
    ui.Image image,
    PhotoFilter filter,
    String text,
  ) {
    canvas.save();
    canvas.scale(size.width / dimension, size.height / dimension);
    const target = Rect.fromLTWH(0, 0, 1080, 1080);
    canvas.clipRect(target);
    canvas.drawRect(target, Paint()..color = Colors.black);
    final side = image.width < image.height
        ? image.width.toDouble()
        : image.height.toDouble();
    final crop = Rect.fromLTWH(
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
    );
    canvas.drawImageRect(
      image,
      crop,
      target,
      Paint()
        ..filterQuality = FilterQuality.high
        ..colorFilter = ColorFilter.matrix(filter.matrix),
    );
    if (text.trim().isNotEmpty) {
      final painter = TextPainter(
        text: TextSpan(
          text: text.trim(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 48,
            fontWeight: FontWeight.w700,
            height: 1.2,
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
        maxLines: 5,
        ellipsis: '…',
      )..layout(maxWidth: 900);
      final box = Rect.fromLTWH(
        (1080 - painter.width - 64) / 2,
        1080 - painter.height - 112,
        painter.width + 64,
        painter.height + 48,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(box, const Radius.circular(36)),
        Paint()..color = const Color(0x99000000),
      );
      painter.paint(canvas, Offset((1080 - painter.width) / 2, box.top + 24));
      painter.dispose();
    }
    canvas.restore();
  }

  static Future<Uint8List> render(
    ui.Image image,
    PhotoFilter filter,
    String text,
  ) async {
    final recorder = ui.PictureRecorder();
    paint(Canvas(recorder), const Size(1080, 1080), image, filter, text);
    final picture = recorder.endRecording();
    try {
      final rendered = await picture.toImage(dimension, dimension);
      try {
        final bytes = await rendered.toByteData(format: ui.ImageByteFormat.png);
        if (bytes == null) throw StateError('PNG export failed');
        return bytes.buffer.asUint8List();
      } finally {
        rendered.dispose();
      }
    } finally {
      picture.dispose();
    }
  }
}

class PhotoPainter extends CustomPainter {
  const PhotoPainter(this.image, this.filter, this.text);
  final ui.Image image;
  final PhotoFilter filter;
  final String text;
  @override
  void paint(Canvas canvas, Size size) =>
      PhotoRenderer.paint(canvas, size, image, filter, text);
  @override
  bool shouldRepaint(PhotoPainter old) =>
      old.image != image || old.filter != filter || old.text != text;
}
