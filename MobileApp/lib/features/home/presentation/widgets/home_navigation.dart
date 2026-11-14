import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../debug/developer_tools.dart';

enum HomeTab { home, memories, profile, friends, debug }

HomeTab homeTabFromLegacy(int index) => switch (index) {
  1 => HomeTab.memories,
  2 => HomeTab.profile,
  3 => HomeTab.friends,
  _ => HomeTab.home,
};

class HomeNavigation extends StatelessWidget {
  final HomeTab selected;
  final ValueChanged<HomeTab> onSelected;
  const HomeNavigation({
    super.key,
    required this.selected,
    required this.onSelected,
  });
  @override
  Widget build(BuildContext context) {
    final entries = <(HomeTab, IconData, String)>[
      (HomeTab.home, Icons.home_rounded, 'Trang chủ'),
      (HomeTab.friends, Icons.people_outline_rounded, 'Bạn bè'),
      (HomeTab.memories, Icons.photo_library_outlined, 'Kỷ niệm'),
      (HomeTab.profile, Icons.person_outline_rounded, 'Cá nhân'),
      if (developerToolsEnabled)
        (HomeTab.debug, Icons.bug_report_outlined, 'Debug'),
    ];
    return Material(
      color: AppColors.card,
      child: SafeArea(
        top: false,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (tab, icon, label) in entries)
                Expanded(
                  child: Semantics(
                    selected: selected == tab,
                    child: InkWell(
                      key: ValueKey('home_tab_${tab.name}'),
                      onTap: () => onSelected(tab),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 64),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 10,
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                icon,
                                color: selected == tab
                                    ? AppColors.primary
                                    : AppColors.textSecondary,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                label,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: selected == tab
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: selected == tab
                                      ? AppColors.primary
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
