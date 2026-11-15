import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../utils/avatar_url.dart';
import '../constants/app_colors.dart';

class UserCover extends StatelessWidget {
  final String? coverUrl;
  final VoidCallback? onTap;

  const UserCover({super.key, this.coverUrl, this.onTap});

  @override
  Widget build(BuildContext context) {
    final uri = avatarUri(coverUrl, allowHttp: kDebugMode);
    const fallback = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primarySoft, AppColors.coralLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Icon(
          Icons.landscape_outlined,
          color: AppColors.primaryDark,
          size: 36,
        ),
      ),
    );
    final content = Semantics(
      label: 'Ảnh bìa',
      image: true,
      button: onTap != null,
      child: ExcludeSemantics(
        child: AspectRatio(
          aspectRatio: 3,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final width =
                    (constraints.maxWidth *
                            MediaQuery.devicePixelRatioOf(context))
                        .ceil()
                        .clamp(1, 2048);
                return uri == null
                    ? fallback
                    : Image.network(
                        uri.toString(),
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        cacheWidth: width,
                        cacheHeight: (width / 3).ceil(),
                        errorBuilder: (_, _, _) => fallback,
                        frameBuilder: (_, child, frame, sync) =>
                            sync || frame != null ? child : fallback,
                      );
              },
            ),
          ),
        ),
      ),
    );

    if (onTap == null) return content;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: content,
      ),
    );
  }
}
