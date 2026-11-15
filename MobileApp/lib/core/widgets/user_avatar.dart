import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../utils/avatar_url.dart';

class UserAvatar extends StatelessWidget {
  final String? avatarUrl;
  final String? displayName;
  final double size;
  final VoidCallback? onTap;

  const UserAvatar({
    super.key,
    this.avatarUrl,
    this.displayName,
    this.size = 44,
    this.onTap,
  }) : assert(size > 0 && size <= 512);

  static String initials(String? name) {
    final parts = (name ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '';
    return (parts.length == 1
            ? parts.first.characters.first
            : '${parts.first.characters.first}${parts.last.characters.first}')
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final uri = avatarUri(avatarUrl, allowHttp: kDebugMode);
    final letters = initials(displayName);
    final fallback = ColoredBox(
      color: AppColors.primarySoft,
      child: Center(
        child: letters.isEmpty
            ? Icon(
                Icons.person_outline_rounded,
                size: size * .55,
                color: AppColors.textSecondary,
              )
            : Padding(
                padding: EdgeInsets.all(size * .15),
                child: FittedBox(
                  child: Text(
                    letters,
                    style: TextStyle(
                      fontSize: size * .38,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primaryDark,
                    ),
                  ),
                ),
              ),
      ),
    );
    final pixels = (size * MediaQuery.devicePixelRatioOf(context)).ceil().clamp(
      1,
      1024,
    );
    final content = Semantics(
      label: displayName?.trim().isNotEmpty == true
          ? 'Ảnh đại diện của ${displayName!.trim()}'
          : 'Ảnh đại diện',
      image: true,
      button: onTap != null,
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: ClipOval(
            child: uri == null
                ? fallback
                : Image.network(
                    uri.toString(),
                    width: size,
                    height: size,
                    fit: BoxFit.cover,
                    cacheWidth: pixels,
                    cacheHeight: pixels,
                    // Intentionally no application Authorization/cookies on image requests.
                    errorBuilder: (_, _, _) => fallback,
                    frameBuilder: (_, child, frame, synchronous) =>
                        synchronous || frame != null ? child : fallback,
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
