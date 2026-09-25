import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_strings.dart';

class AuthToggle extends StatelessWidget {
  final bool isLogin;
  final ValueChanged<bool> onToggle;

  const AuthToggle({
    super.key,
    required this.isLogin,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.inputBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          // Login Tab
          Expanded(
            child: GestureDetector(
              onTap: () => onToggle(true),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeInOut,
                decoration: BoxDecoration(
                  color: isLogin ? AppColors.background : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: isLogin
                      ? [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.06),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : [],
                ),
                child: Center(
                  child: Text(
                    AppStrings.login,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: isLogin ? FontWeight.bold : FontWeight.w500,
                      color: isLogin ? AppColors.primary : AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          ),

          // Register Tab
          Expanded(
            child: GestureDetector(
              onTap: () => onToggle(false),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeInOut,
                decoration: BoxDecoration(
                  color: !isLogin ? AppColors.background : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: !isLogin
                      ? [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.06),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : [],
                ),
                child: Center(
                  child: Text(
                    AppStrings.register,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: !isLogin ? FontWeight.bold : FontWeight.w500,
                      color: !isLogin ? AppColors.primary : AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
