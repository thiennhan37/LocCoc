import 'change_password_screen.dart';
import '../../users/presentation/discovery_privacy_screen.dart';
import '../../users/presentation/friends_screen.dart';
import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../users/data/user_api_client.dart';
import '../data/login_history_api.dart';
import 'login_history_screen.dart';

class SettingsPrivacyScreen extends StatefulWidget {
  final UserApiClient account;
  final Future<void> Function() onCurrentSessionRevoked;
  const SettingsPrivacyScreen({
    super.key,
    required this.account,
    required this.onCurrentSessionRevoked,
  });
  @override
  State<SettingsPrivacyScreen> createState() => _SettingsPrivacyScreenState();
}

class _SettingsPrivacyScreenState extends State<SettingsPrivacyScreen> {
  UserApiClient get account => widget.account;
  Future<void> Function() get onCurrentSessionRevoked =>
      widget.onCurrentSessionRevoked;
  bool busy = false, confirming = false;
  String? error;
  Future<void> logoutAll() async {
    if (busy || confirming) return;
    setState(() => confirming = true);
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất tất cả thiết bị?'),
        content: const Text(
          'Tất cả phiên đăng nhập của tài khoản này sẽ bị thu hồi, kể cả thiết bị hiện tại. Tài khoản vẫn được ghi nhớ trên thiết bị.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm_logout_all'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Đăng xuất tất cả'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() => confirming = false);
    if (accepted != true) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await account.logoutAll();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Đã đăng xuất các phiên của tài khoản.'),
          ),
        );
      }
    } catch (e) {
      if (mounted && account.isCurrent) setState(() => error = userError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Cài đặt và quyền riêng tư')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 12),
            child: Text(
              'Quyền riêng tư & kết nối',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
          ),
          Card(
            child: ListTile(
              key: const Key('discovery_privacy_settings'),
              contentPadding: const EdgeInsets.all(16),
              leading: const CircleAvatar(
                backgroundColor: AppColors.coralLight,
                child: Icon(Icons.people_outline, color: AppColors.primary),
              ),
              title: const Text(
                'Quyền riêng tư kết bạn',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Quản lý xuất hiện trong gợi ý và hiển thị bạn chung.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => DiscoveryPrivacyScreen(api: account),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              key: const Key('blocked_users_settings'),
              contentPadding: const EdgeInsets.all(16),
              leading: const CircleAvatar(
                backgroundColor: AppColors.coralLight,
                child: Icon(Icons.block_rounded, color: AppColors.primary),
              ),
              title: const Text(
                'Người dùng đã chặn',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text('Xem và bỏ chặn các tài khoản bạn đã chặn.'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => FriendsScreen(
                    api: account,
                    initialTab: 4,
                    singleTab: true,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 12),
            child: Text(
              'Bảo mật tài khoản',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
          ),
          if (account.coordinator != null) ...[
            Card(
              child: ListTile(
                key: const Key('change_password_settings'),
                leading: const Icon(Icons.password_rounded),
                title: const Text('Đổi mật khẩu'),
                subtitle: const Text(
                  'Dùng mật khẩu hiện tại; các phiên cũ sẽ được đăng xuất.',
                ),
                onTap: busy || confirming
                    ? null
                    : () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) =>
                              ChangePasswordScreen(account: account),
                        ),
                      ),
              ),
            ),
            Card(
              child: ListTile(
                key: const Key('logout_all_settings'),
                leading: const Icon(Icons.devices_outlined),
                title: const Text('Đăng xuất tất cả thiết bị'),
                subtitle: Text(
                  busy
                      ? 'Đang thu hồi các phiên…'
                      : 'Bao gồm phiên trên thiết bị hiện tại.',
                ),
                onTap: busy || confirming ? null : logoutAll,
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (busy) const LinearProgressIndicator(),
          ],
          Card(
            child: ListTile(
              key: const Key('login_history_settings'),
              contentPadding: const EdgeInsets.all(16),
              leading: const CircleAvatar(
                backgroundColor: AppColors.coralLight,
                child: Icon(Icons.history_rounded, color: AppColors.primary),
              ),
              title: const Text(
                'Lịch sử đăng nhập',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Xem các lần đăng nhập và quản lý phiên trên thiết bị.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => LoginHistoryScreen(
                    api: LoginHistoryApi(account),
                    onCurrentSessionRevoked: onCurrentSessionRevoked,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
