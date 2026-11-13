import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../users/data/user_api_client.dart';
import '../data/login_history_api.dart';
import 'login_history_screen.dart';

class SettingsPrivacyScreen extends StatelessWidget {
  final UserApiClient account;
  final Future<void> Function() onCurrentSessionRevoked;
  const SettingsPrivacyScreen({
    super.key,
    required this.account,
    required this.onCurrentSessionRevoked,
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Cài đặt và quyền riêng tư')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            'Bảo mật tài khoản',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
          ),
        ),
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
  );
}
