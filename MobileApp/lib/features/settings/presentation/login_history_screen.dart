import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../data/login_history_api.dart';

class LoginHistoryScreen extends StatefulWidget {
  final LoginHistoryApi api;
  final Future<void> Function() onCurrentSessionRevoked;
  const LoginHistoryScreen({
    super.key,
    required this.api,
    required this.onCurrentSessionRevoked,
  });
  @override
  State<LoginHistoryScreen> createState() => _LoginHistoryScreenState();
}

class _LoginHistoryScreenState extends State<LoginHistoryScreen>
    with WidgetsBindingObserver {
  List<LoginHistoryEntry> entries = [];
  String? cursor, error;
  bool loading = true,
      hasMore = false,
      revoking = false,
      confirming = false,
      ending = false;
  int version = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
  }

  @override
  void dispose() {
    version++;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !revoking && !confirming) load();
  }

  Future<void> finishCurrentSession() async {
    if (ending) return;
    ending = true;
    try {
      await widget.onCurrentSessionRevoked();
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Phiên không còn hiệu lực. Vui lòng đăng nhập lại.',
        );
      }
    } finally {
      ending = false;
    }
  }

  Future<void> load({bool more = false}) async {
    if (revoking || confirming || ending || (more && (loading || !hasMore))) {
      return;
    }
    final ticket = ++version;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final page = await widget.api.list(more ? cursor : null);
      final rows = (page['items'] as List)
          .map(
            (row) => LoginHistoryEntry.fromJson(
              Map<String, dynamic>.from(row as Map),
            ),
          )
          .toList();
      final info = Map<String, dynamic>.from(page['pageInfo'] as Map);
      final next = info['nextCursor'] as String?;
      if (info['hasMore'] == true && (next == null || next.isEmpty)) {
        throw const FormatException('Missing cursor');
      }
      if (!mounted || ticket != version) return;
      setState(() {
        entries = more
            ? [
                ...entries,
                ...rows.where((r) => !entries.any((e) => e.id == r.id)),
              ]
            : rows;
        cursor = next;
        hasMore = info['hasMore'] == true;
      });
    } on AuthApiException catch (e) {
      if (!mounted || ticket != version) return;
      if (e is SessionExpiredException) {
        await finishCurrentSession();
      } else {
        setState(() => error = 'Chưa thể tải lịch sử đăng nhập. Hãy thử lại.');
      }
    } catch (_) {
      if (mounted && ticket == version) {
        setState(() => error = 'Chưa thể tải lịch sử đăng nhập. Hãy thử lại.');
      }
    } finally {
      if (mounted && ticket == version) setState(() => loading = false);
    }
  }

  Future<void> revoke(LoginHistoryEntry entry) async {
    if (revoking || confirming || loading) return;
    setState(() => confirming = true);
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          entry.isCurrent
              ? 'Đăng xuất trên thiết bị này?'
              : 'Đăng xuất phiên này?',
        ),
        content: Text(
          entry.isCurrent
              ? 'Bạn sẽ trở về màn hình đăng nhập. Tài khoản vẫn được ghi nhớ.'
              : 'Phiên ${entry.deviceName} sẽ cần đăng nhập lại để tiếp tục sử dụng.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm_session_logout'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() => confirming = false);
    if (accepted != true) return;
    setState(() {
      revoking = true;
      error = null;
    });
    try {
      final result = await widget.api.revoke(entry.id);
      if (!mounted) return;
      if (result['isCurrent'] == true || entry.isCurrent) {
        await finishCurrentSession();
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã đăng xuất phiên được chọn.')),
      );
    } on AuthApiException catch (e) {
      if (!mounted) return;
      if (e is SessionExpiredException) {
        await finishCurrentSession();
      } else if (e.statusCode == 404) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Phiên không còn khả dụng. Lịch sử đã được làm mới.'),
          ),
        );
      } else {
        setState(
          () => error =
              'Chưa thể đăng xuất phiên. Hãy kiểm tra kết nối và thử lại.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Chưa thể đăng xuất phiên. Hãy kiểm tra kết nối và thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => revoking = false);
    }
    if (mounted && error == null) await load();
  }

  String date(DateTime value) {
    final d = value.toLocal();
    String pad(int n) => n.toString().padLeft(2, '0');
    return '${pad(d.day)}/${pad(d.month)}/${d.year} · ${pad(d.hour)}:${pad(d.minute)}';
  }

  Widget line(String label, String value) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 130,
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 12))),
      ],
    ),
  );
  Widget card(LoginHistoryEntry entry) => Card(
    key: ValueKey('history_${entry.id}'),
    margin: const EdgeInsets.only(bottom: 14),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.coralLight,
                child: Icon(
                  entry.platform == 'web'
                      ? Icons.computer_rounded
                      : Icons.phone_android_rounded,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  entry.deviceName,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              Chip(
                label: Text(entry.statusLabel),
                visualDensity: VisualDensity.compact,
              ),
              if (entry.isCurrent)
                const Chip(
                  label: Text('Phiên hiện tại'),
                  backgroundColor: AppColors.coralLight,
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          line('Đăng nhập', date(entry.createdAt)),
          line('Dùng phiên gần nhất', date(entry.lastUsedAt)),
          line('Hết hạn', date(entry.expiresAt)),
          if (entry.revokedAt != null)
            line('Đã đăng xuất', date(entry.revokedAt!)),
          line('Địa chỉ IP', entry.ip ?? 'Không xác định'),
          if (entry.userAgent != null)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text(
                'Chi tiết thiết bị',
                style: TextStyle(fontSize: 12),
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    entry.userAgent!,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          if (entry.status == 'ACTIVE')
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                key: ValueKey('revoke_${entry.id}'),
                onPressed: revoking || confirming || loading
                    ? null
                    : () => revoke(entry),
                icon: const Icon(Icons.logout_rounded, size: 18),
                label: const Text('Đăng xuất phiên này'),
              ),
            ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(
      title: const Text('Lịch sử đăng nhập'),
      actions: [
        IconButton(
          tooltip: 'Làm mới',
          onPressed: loading || revoking || confirming ? null : () => load(),
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Đăng nhập thành công trong 90 ngày và các phiên còn hiệu lực.',
            style: TextStyle(color: AppColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 8),
          const Text(
            'Phiên còn hiệu lực không có nghĩa thiết bị đang online.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
          const SizedBox(height: 18),
          if (loading || revoking) const LinearProgressIndicator(),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                children: [
                  Text(error!, textAlign: TextAlign.center),
                  TextButton(
                    onPressed: loading || revoking
                        ? null
                        : () => load(more: entries.isNotEmpty && hasMore),
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            ),
          if (!loading && error == null && entries.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 64),
              child: Column(
                children: [
                  Icon(
                    Icons.history_rounded,
                    size: 64,
                    color: AppColors.textSecondary,
                  ),
                  SizedBox(height: 16),
                  Text('Chưa có lịch sử đăng nhập.'),
                ],
              ),
            ),
          ...entries.map(card),
          if (hasMore)
            OutlinedButton(
              onPressed: loading || revoking ? null : () => load(more: true),
              child: const Text('Xem thêm'),
            ),
        ],
      ),
    ),
  );
}
