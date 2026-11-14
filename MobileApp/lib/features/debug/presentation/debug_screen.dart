import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../users/data/user_api_client.dart';
import '../../notifications/data/push_notifications.dart';
import '../developer_tools.dart';
import '../jwt_inspection.dart';

class DebugScreen extends StatefulWidget {
  final UserApiClient api;
  final PushNotifications? push;
  final Future<void> Function() reloadProfile;
  final Future<void> Function() reloadCounts;
  const DebugScreen({
    super.key,
    required this.api,
    this.push,
    required this.reloadProfile,
    required this.reloadCounts,
  });
  @override
  State<DebugScreen> createState() => _DebugScreenState();
}

class _DebugScreenState extends State<DebugScreen> {
  bool busy = false;
  bool revealed = false;
  String? message;
  String? shownToken;
  Future<void> run(Future<void> Function() action) async {
    if (!developerToolsEnabled || busy || !widget.api.isCurrent) return;
    if (widget.api.session.accessToken.startsWith('demo-')) {
      setState(() => message = 'Phiên Demo không thực hiện thao tác máy chủ.');
      return;
    }
    setState(() {
      busy = true;
      revealed = false;
      message = null;
    });
    try {
      await action();
      if (mounted && widget.api.isCurrent) {
        setState(() => message = 'Đã hoàn tất thao tác.');
      }
    } catch (_) {
      if (mounted && widget.api.isCurrent) {
        setState(
          () => message =
              'Chưa hoàn tất thao tác. Hãy kiểm tra kết nối hoặc đăng nhập lại.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> copyAccessToken() async {
    if (!developerToolsEnabled || busy || !widget.api.isCurrent) return;
    final token = widget.api.session.accessToken;
    // Clipboard is updated only after an explicit development-only action.
    await run(() => Clipboard.setData(ClipboardData(text: token)));
  }

  Widget field(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        SelectableText(value),
      ],
    ),
  );
  @override
  Widget build(BuildContext context) {
    if (!developerToolsEnabled) return const SizedBox.shrink();
    if (!widget.api.isCurrent) {
      return const Center(child: Text('Phiên client đã kết thúc.'));
    }
    final session = widget.api.session;
    if (shownToken != session.accessToken || !widget.api.isCurrent) {
      shownToken = session.accessToken;
      revealed = false;
    }
    final claims = inspectJwt(session.accessToken);
    return ListView(
      key: const Key('development_debug_panel'),
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'LocCoc Debug · development only',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const Text(
          'Claims JWT chỉ để quan sát. Máy chủ quyết định quyền và trạng thái phiên.',
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                field(
                  'Tài khoản',
                  '${session.user.email ?? ''}\n${session.user.id}',
                ),
                field('API base URL', widget.api.auth.baseUrl),
                field(
                  'TTL được server cấp',
                  '${session.expiresIn} giây (không xác nhận phiên còn hiệu lực)',
                ),
                field(
                  'Trạng thái client',
                  widget.api.isCurrent
                      ? 'Đang dùng phiên hiện tại'
                      : 'Phiên client đã kết thúc',
                ),
                field(
                  'Claims JWT (chưa xác minh)',
                  claims == null
                      ? 'Không có JWT phù hợp để đọc.'
                      : const JsonEncoder.withIndent('  ').convert(claims),
                ),
                field(
                  'Access token',
                  revealed && widget.api.isCurrent
                      ? session.accessToken
                      : '••••••••',
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton(
                      key: const Key('debug_reveal_access'),
                      onPressed: busy || !widget.api.isCurrent
                          ? null
                          : () => setState(() => revealed = !revealed),
                      child: Text(
                        revealed
                            ? 'Che access token'
                            : 'Hiện access token (Debug)',
                      ),
                    ),
                    OutlinedButton(
                      key: const Key('debug_copy_access'),
                      onPressed: busy ? null : copyAccessToken,
                      child: const Text('Sao chép access token (Debug)'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (widget.push != null)
          ValueListenableBuilder<PushDiagnostics>(
            valueListenable: widget.push!.diagnostics,
            builder: (_, status, _) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    field(
                      'Firebase đã khởi tạo',
                      status.firebaseInitialized ? 'Có' : 'Chưa',
                    ),
                    field(
                      'Quyền thông báo',
                      status.permission?.name ?? 'Chưa xác định',
                    ),
                    field(
                      'Đăng ký thiết bị với server',
                      status.registration.name,
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          const Text('Push: chưa khởi tạo client cho phiên này.'),
        if (message != null) Text(message!),
        if (busy) const LinearProgressIndicator(),
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('debug_force_refresh'),
          onPressed: busy
              ? null
              : () => run(() async {
                  await widget.api.forceRefresh();
                }),
          child: const Text('Force Refresh'),
        ),
        OutlinedButton(
          key: const Key('debug_reload_profile'),
          onPressed: busy ? null : () => run(widget.reloadProfile),
          child: const Text('Tải lại hồ sơ'),
        ),
        OutlinedButton(
          key: const Key('debug_reload_counts'),
          onPressed: busy ? null : () => run(widget.reloadCounts),
          child: const Text('Tải lại số bạn bè và thông báo'),
        ),
      ],
    );
  }
}
