import '../../../core/widgets/user_avatar.dart';
import '../../../core/utils/paginated_rows.dart';
import 'notification_labels.dart';
import 'package:flutter/material.dart';
import '../data/notification_api.dart';
import '../../users/data/user_api_client.dart';
import '../../users/presentation/username_profile_screen.dart';

Future<Map<String, dynamic>?> openNotification(
  BuildContext context,
  NotificationApi api,
  Map<String, dynamic> item,
) async {
  Map<String, dynamic>? read;
  try {
    final id = item['id'] ?? item['notificationId'];
    if (id is! String) return null;
    read = await api.read(id);
    final actor = item['actor'] as Map<String, dynamic>?;
    final actorId = actor?['id'] ?? item['actorId'];
    final data = item['data'] as Map<String, dynamic>?;
    final requestId = data?['friendRequestId'] ?? item['friendRequestId'];
    if (actorId is! String || requestId is! String) {
      throw const FormatException('Unavailable target');
    }
    final request = await api.user.request(
      'GET',
      'friend-requests/${Uri.encodeComponent(requestId)}',
    );
    if (request['status'] == 'CANCELLED' || request['status'] == 'REJECTED') {
      throw const FormatException('Unavailable request');
    }
    final profile = await api.user.request(
      'GET',
      'profiles/${Uri.encodeComponent(actorId)}',
    );
    if (!context.mounted) return read;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => UsernameProfileScreen(
          username: profile['username'] as String,
          api: api.user,
        ),
      ),
    );
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Nội dung này không còn khả dụng hoặc chưa thể tải. Vui lòng thử lại.',
          ),
        ),
      );
    }
  }
  return read;
}

class NotificationsScreen extends StatefulWidget {
  final NotificationApi api;
  final VoidCallback onChanged;
  const NotificationsScreen({
    super.key,
    required this.api,
    required this.onChanged,
  });
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final List<Map<String, dynamic>> items = [];
  final ScrollController scroll = ScrollController();
  String? nextCursor, error, seenPending;
  bool loading = false, hasMore = true;
  @override
  void initState() {
    super.initState();
    scroll.addListener(() {
      if (scroll.position.extentAfter < 240 && items.isNotEmpty) load();
    });
    load(reset: true);
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  Future<void> acknowledge(String marker) async {
    try {
      await widget.api.seen(marker);
      if (seenPending == marker) seenPending = null;
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        setState(
          () =>
              error = 'Chưa cập nhật trạng thái đã xem. Kéo xuống để thử lại.',
        );
      }
    }
  }

  Future<void> load({bool reset = false, bool markSeen = true}) async {
    if (loading || (!reset && !hasMore)) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final page = await widget.api.list(reset ? null : nextCursor);
      if (!mounted) return;
      final incoming = (page['items'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        if (reset) items.clear();
        final merged = mergeUniqueRows(items, incoming);
        items
          ..clear()
          ..addAll(merged);
        nextCursor = page['pageInfo']['nextCursor'] as String?;
        hasMore = page['pageInfo']['hasMore'] == true;
      });
      if (reset && markSeen && page['seenCursor'] is String) {
        seenPending = page['seenCursor'] as String;
        final marker = seenPending!;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) acknowledge(marker);
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = userError(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> tap(Map<String, dynamic> item) async {
    final read = await openNotification(context, widget.api, item);
    if (!mounted) return;
    // Refresh only the tapped read state; retain older pages and their cursor.
    if (read != null) {
      setState(() {
        item['isRead'] = read['isRead'] == true || read['readAt'] != null;
      });
    }
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Thông báo')),
    body: RefreshIndicator(
      onRefresh: () => load(reset: true),
      child: ListView(
        controller: scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (error != null)
            ListTile(
              title: Text(error!),
              trailing: TextButton(
                onPressed: () => load(reset: true),
                child: const Text('Thử lại'),
              ),
            ),
          if (items.isEmpty && !loading && error == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: Text('Bạn chưa có thông báo nào.')),
            ),
          for (final item in items)
            ListTile(
              tileColor: item['isRead'] == true
                  ? null
                  : Theme.of(
                      context,
                    ).colorScheme.primaryContainer.withValues(alpha: 0.3),
              leading: UserAvatar(
                avatarUrl: item['actor'] is Map
                    ? item['actor']['avatarUrl'] as String?
                    : null,
                displayName: notificationActorLabel(
                  item['actor'] is Map
                      ? Map<String, dynamic>.from(item['actor'] as Map)
                      : null,
                ),
              ),
              title: Text(
                '${notificationActorLabel(item['actor'] is Map ? Map<String, dynamic>.from(item['actor'] as Map) : null)} ${item['type'] == 'FRIEND_REQUEST_RECEIVED' ? 'đã gửi lời mời kết bạn.' : 'đã chấp nhận lời mời kết bạn.'}',
              ),
              subtitle: Text(localNotificationTime(item['createdAt'])),
              trailing: item['isRead'] == true
                  ? null
                  : const Icon(Icons.circle, size: 9),
              onTap: () => tap(item),
            ),
          if (loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(),
              ),
            ),
          if (hasMore && !loading && items.isNotEmpty)
            TextButton(onPressed: () => load(), child: const Text('Xem thêm')),
        ],
      ),
    ),
  );
}
