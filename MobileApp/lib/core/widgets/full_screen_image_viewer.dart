import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../utils/avatar_url.dart';

/// Full-screen viewer for user avatars and cover images with pinch-to-zoom.
class FullScreenImageViewer extends StatelessWidget {
  final String imageUrl;
  final String title;
  final String? subtitle;
  final Object? heroTag;

  const FullScreenImageViewer({
    super.key,
    required this.imageUrl,
    required this.title,
    this.subtitle,
    this.heroTag,
  });

  /// Opens the image in full screen if valid, or displays a SnackBar with [emptyMessage].
  static Future<void> open(
    BuildContext context, {
    required String? imageUrl,
    required String title,
    String? subtitle,
    required String emptyMessage,
    Object? heroTag,
  }) async {
    final uri = avatarUri(imageUrl, allowHttp: kDebugMode);
    if (uri == null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(emptyMessage),
            behavior: SnackBarBehavior.floating,
          ),
        );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => FullScreenImageViewer(
          imageUrl: uri.toString(),
          title: title,
          subtitle: subtitle,
          heroTag: heroTag,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final uri = avatarUri(imageUrl, allowHttp: kDebugMode);

    Widget imageWidget = uri == null
        ? const Center(
            child: Text(
              'Đường dẫn ảnh không hợp lệ.',
              style: TextStyle(color: Colors.white70),
            ),
          )
        : Image.network(
            uri.toString(),
            fit: BoxFit.contain,
            // Intentionally no application Authorization/cookies on image requests.
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              final expected = loadingProgress.expectedTotalBytes;
              final loaded = loadingProgress.cumulativeBytesLoaded;
              return Center(
                child: CircularProgressIndicator(
                  value: expected != null && expected > 0
                      ? loaded / expected
                      : null,
                  color: AppColors.primary,
                ),
              );
            },
            errorBuilder: (_, _, _) => const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.broken_image_outlined,
                    size: 64,
                    color: Colors.white54,
                  ),
                  SizedBox(height: 12),
                  Text(
                    'Không thể tải ảnh.',
                    style: TextStyle(color: Colors.white70, fontSize: 15),
                  ),
                ],
              ),
            ),
          );

    if (heroTag != null && uri != null) {
      imageWidget = Hero(
        tag: heroTag!,
        child: imageWidget,
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black.withValues(alpha: 0.7),
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          key: const Key('back_image_viewer'),
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          tooltip: 'Quay lại',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (subtitle != null && subtitle!.trim().isNotEmpty)
              Text(
                subtitle!.trim(),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.normal,
                ),
              ),
          ],
        ),
        actions: [
          IconButton(
            key: const Key('close_image_viewer'),
            tooltip: 'Đóng',
            icon: const Icon(Icons.close_rounded, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 0.8,
          maxScale: 5.0,
          child: imageWidget,
        ),
      ),
    );
  }
}
