import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/application/photo_renderer.dart';

void main() {
  testWidgets('export applies filter and visible text to square PNG', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawRect(
        const Rect.fromLTWH(0, 0, 32, 64),
        Paint()..color = Colors.red,
      );
      final picture = recorder.endRecording();
      final source = await picture.toImage(32, 64);
      final original = await PhotoRenderer.render(
        source,
        PhotoFilter.original,
        '',
      );
      final edited = await PhotoRenderer.render(
        source,
        PhotoFilter.mono,
        'Xin chào',
      );
      expect(edited, isNot(original));
      final codec = await ui.instantiateImageCodec(edited);
      final image = (await codec.getNextFrame()).image;
      expect(image.width, 1080);
      expect(image.height, 1080);
      final pixels = (await image.toByteData())!.buffer.asUint8List();
      expect(pixels[0], pixels[1]);
      expect(pixels[1], pixels[2]);
      image.dispose();
      codec.dispose();
      source.dispose();
      picture.dispose();
    });
  });
}
