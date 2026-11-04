import 'package:flutter/material.dart';
import '../../data/services/google_sign_in_service.dart';
import '../../domain/models/auth_session.dart';

/// null cancels, true retains the server session, false revokes it.
Future<bool?> chooseLogoutRetention(
  BuildContext context,
  GoogleAuthService auth,
  AuthSession session,
) async {
  if (session.accessToken.startsWith('demo-') || !auth.vault.supported) {
    return false;
  }
  if (await auth.hasSavedSession(session.user.id)) return true;
  if (!context.mounted) return null;
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('logout_retention_dialog'),
      icon: const Icon(Icons.manage_accounts_outlined),
      title: const Text('Lưu phiên đăng nhập?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            session.user.email ?? session.user.id,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const Text(
            'Tài khoản luôn được giữ trong danh sách. Lưu phiên để lần sau vào nhanh trên thiết bị này.',
          ),
        ],
      ),
      actions: [
        SizedBox(
          width: double.infinity,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FilledButton(
                key: const Key('logout_keep_session'),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Lưu phiên'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                key: const Key('logout_identity_only'),
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Không lưu phiên'),
              ),
              TextButton(
                key: const Key('logout_cancel'),
                onPressed: () => Navigator.pop(context),
                child: const Text('Hủy'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
