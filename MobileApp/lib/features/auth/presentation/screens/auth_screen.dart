import '../../../../core/widgets/user_avatar.dart';
import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../data/services/auth_api_client.dart';
import '../../data/services/google_sign_in_service.dart';
import '../../domain/models/auth_session.dart';
import '../../data/services/account_vault.dart';
import '../../../users/presentation/profile_gate.dart';
import '../widgets/auth_header.dart';
import 'login_form.dart';

class AuthScreen extends StatefulWidget {
  final GoogleAuthService? googleAuthService;
  final AuthApiClient? authApiClient;
  final ValueChanged<AuthSession>? onLoginSuccess;
  final bool autoRestore;

  const AuthScreen({
    super.key,
    this.googleAuthService,
    this.authApiClient,
    this.onLoginSuccess,
    this.autoRestore = true,
  });

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  late final GoogleAuthService auth =
      widget.googleAuthService ??
      GoogleAuthService(apiClient: widget.authApiClient);
  List<SavedAccount> accounts = [];
  bool loading = true;
  bool choosing = true;
  String email = '';
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final saved = await auth.vault.list();
      if (!mounted) return;
      setState(() {
        accounts = saved;
      });
      if (widget.autoRestore) {
        final id = await auth.vault.activeId();
        if (id != null) {
          final session = await auth.resume(id);
          if (!mounted) return;
          if (session != null) {
            _complete(session);
            return;
          }
        }
      }
    } catch (_) {
      try {
        final saved = await auth.vault.list();
        if (mounted) setState(() => accounts = saved);
      } catch (_) {}
      if (mounted) {
        setState(
          () => error =
              'Chưa thể khôi phục đăng nhập đã lưu. Bạn có thể đăng nhập lại.',
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _complete(AuthSession session) {
    if (widget.onLoginSuccess case final callback?) {
      callback(session);
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => ProfileGate(session: session, authService: auth),
      ),
      (_) => false,
    );
  }

  Future<void> _select(SavedAccount account) async {
    if (loading) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      if (account.canContinue) {
        final session = await auth.resume(account.id);
        if (!mounted) return;
        if (session != null) {
          _complete(session);
          return;
        }
      }
      if (mounted) {
        setState(() {
          email = account.email;
          choosing = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          email = account.email;
          choosing = false;
          error = 'Phiên đã lưu không còn dùng được. Vui lòng đăng nhập lại.';
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _remove(SavedAccount account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa tài khoản khỏi thiết bị?'),
        content: Text(
          'Thông tin đã lưu của ${account.email} sẽ được xóa. Tài khoản của bạn vẫn tồn tại.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa khỏi thiết bị'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await auth.removeSaved(account.id);
      final saved = await auth.vault.list();
      if (mounted) setState(() => accounts = saved);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Chưa thể xóa tài khoản an toàn. Hãy kiểm tra kết nối và thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _removeSession(SavedAccount account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Gỡ phiên đăng nhập?'),
        content: Text(
          '${account.email} vẫn được giữ trong danh sách. Lần đăng nhập tiếp theo cần xác thực lại.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm_remove_session'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Gỡ phiên'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await auth.removeSavedSession(account.id);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Chưa thể gỡ phiên đăng nhập. Hãy kiểm tra kết nối và thử lại.',
        );
      }
    } finally {
      try {
        final saved = await auth.vault.list();
        if (mounted) setState(() => accounts = saved);
      } catch (_) {}
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AuthHeader(),
                  const SizedBox(height: 32),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  if (error != null && !loading)
                    TextButton(onPressed: _load, child: const Text('Thử lại')),
                  if (loading)
                    const Center(child: CircularProgressIndicator())
                  else if (choosing && accounts.isNotEmpty) ...[
                    Text(
                      'Chọn tài khoản',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    for (final account in accounts)
                      Card(
                        child: Column(
                          children: [
                            ListTile(
                              key: ValueKey('saved_${account.id}'),
                              leading: UserAvatar(
                                avatarUrl: account.avatarUrl,
                                displayName:
                                    account.name ??
                                    account.username ??
                                    account.email,
                              ),
                              title: Text(
                                account.name ??
                                    account.username ??
                                    account.email,
                              ),
                              subtitle: Text(
                                '${account.email}\n${account.canContinue ? 'Đã lưu phiên · Chạm để đăng nhập' : 'Chỉ lưu tài khoản · Cần đăng nhập lại'}',
                              ),
                              isThreeLine: true,
                              onTap: () => _select(account),
                              trailing: IconButton(
                                tooltip: 'Xóa khỏi thiết bị',
                                icon: const Icon(Icons.close),
                                onPressed: () => _remove(account),
                              ),
                            ),
                            if (account.canContinue)
                              Align(
                                alignment: Alignment.centerRight,
                                child: Padding(
                                  padding: const EdgeInsets.only(
                                    right: 8,
                                    bottom: 4,
                                  ),
                                  child: TextButton.icon(
                                    key: ValueKey(
                                      'remove_session_${account.id}',
                                    ),
                                    onPressed: () => _removeSession(account),
                                    icon: const Icon(
                                      Icons.lock_reset,
                                      size: 18,
                                    ),
                                    label: const Text('Gỡ phiên đăng nhập'),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => setState(() {
                        email = '';
                        choosing = false;
                        error = null;
                      }),
                      icon: const Icon(Icons.person_add_alt),
                      label: const Text('Dùng tài khoản khác'),
                    ),
                  ] else ...[
                    if (accounts.isNotEmpty)
                      TextButton.icon(
                        onPressed: () async {
                          final saved = await auth.vault.list();
                          if (mounted) {
                            setState(() {
                              accounts = saved;
                              choosing = true;
                              error = null;
                            });
                          }
                        },
                        icon: const Icon(Icons.arrow_back),
                        label: const Text('Tài khoản đã lưu'),
                      ),
                    LoginForm(
                      key: ValueKey(email),
                      initialEmail: email,
                      googleAuthService: auth,
                      authApiClient: widget.authApiClient,
                      onLoginSuccess: widget.onLoginSuccess,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
