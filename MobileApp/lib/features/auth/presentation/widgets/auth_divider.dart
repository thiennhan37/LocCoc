import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_strings.dart';

class AuthDivider extends StatelessWidget {
  final String text;

  const AuthDivider({
    super.key,
    this.text = AppStrings.orDivider,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(
          child: Divider(
            color: AppColors.border,
            thickness: 1,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
              color: AppColors.textMuted,
            ),
          ),
        ),
        const Expanded(
          child: Divider(
            color: AppColors.border,
            thickness: 1,
          ),
        ),
      ],
    );
  }
}
