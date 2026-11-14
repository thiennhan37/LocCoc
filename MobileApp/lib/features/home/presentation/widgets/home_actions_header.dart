import '../../../../core/constants/app_strings.dart';
import 'package:flutter/material.dart';

class HomeActionsHeader extends StatelessWidget {
  final bool demo;
  final int unseen;
  final VoidCallback? onNotifications;
  final VoidCallback? onLogout;
  const HomeActionsHeader({
    super.key,
    required this.demo,
    required this.unseen,
    this.onNotifications,
    this.onLogout,
  });
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          demo ? 'Đang khám phá bản xem trước' : AppStrings.welcomeBack,
          style: Theme.of(context).textTheme.titleSmall,
        ),
      ),
      if (!demo)
        IconButton(
          tooltip: 'Thông báo',
          onPressed: onNotifications,
          icon: Badge(
            isLabelVisible: unseen > 0,
            label: Text(unseen > 99 ? '99+' : '$unseen'),
            child: const Icon(Icons.notifications_outlined),
          ),
        ),
      IconButton(
        tooltip: 'Đăng xuất',
        onPressed: onLogout,
        icon: const Icon(Icons.logout_rounded),
      ),
    ],
  );
}
