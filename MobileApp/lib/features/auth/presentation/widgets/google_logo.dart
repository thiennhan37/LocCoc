import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Renders the official 4-color Google "G" logo vector cleanly without relying on external image files.
class GoogleLogo extends StatelessWidget {
  final double size;

  const GoogleLogo({
    super.key,
    this.size = 20,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _GoogleLogoPainter(),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final strokeWidth = size.width * 0.22;

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.butt;

    final rect = Rect.fromCircle(center: center, radius: radius - strokeWidth / 2);

    // 1. Red arc (Top)
    paint.color = const Color(0xFFEA4335);
    canvas.drawArc(rect, -math.pi * 0.75, math.pi * 0.55, false, paint);

    // 2. Yellow arc (Left)
    paint.color = const Color(0xFFFBBC05);
    canvas.drawArc(rect, -math.pi * 1.25, math.pi * 0.5, false, paint);

    // 3. Green arc (Bottom)
    paint.color = const Color(0xFF34A853);
    canvas.drawArc(rect, math.pi * 0.25, math.pi * 0.5, false, paint);

    // 4. Blue arc (Right)
    paint.color = const Color(0xFF4285F4);
    canvas.drawArc(rect, -math.pi * 0.2, math.pi * 0.45, false, paint);

    // 5. Blue horizontal crossbar
    final barPaint = Paint()
      ..color = const Color(0xFF4285F4)
      ..style = PaintingStyle.fill;

    final barHeight = strokeWidth;
    final barRect = Rect.fromLTWH(
      center.dx - strokeWidth * 0.2,
      center.dy - barHeight / 2,
      radius - strokeWidth / 2 + strokeWidth * 0.2,
      barHeight,
    );
    canvas.drawRect(barRect, barPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
