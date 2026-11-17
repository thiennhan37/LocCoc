import 'package:flutter/material.dart';

class ChatPostImage extends StatelessWidget {
  final Uri? uri;
  final bool preview;
  const ChatPostImage({super.key, required this.uri, this.preview = false});
  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: const Color(0xff303030),
      child: Center(
        child: preview
            ? const Icon(Icons.broken_image_outlined, color: Colors.white70)
            : const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Ảnh không còn khả dụng',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
      ),
    );
    return SizedBox(
      key: preview ? null : const Key('chat-post-image'),
      width: 240,
      child: AspectRatio(
        aspectRatio: 1,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: uri == null
              ? fallback
              : Image.network(
                  uri.toString(),
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => fallback,
                  loadingBuilder: (_, child, progress) => progress == null
                      ? child
                      : const ColoredBox(
                          color: Color(0xff303030),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                ),
        ),
      ),
    );
  }
}
