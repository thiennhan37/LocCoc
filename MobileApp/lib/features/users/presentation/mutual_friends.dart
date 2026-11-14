import '../../../core/widgets/user_avatar.dart';
import '../../../core/utils/paginated_rows.dart';
import '../../auth/data/services/auth_api_client.dart';
import 'package:flutter/material.dart';
import '../data/user_api_client.dart';
import 'username_profile_screen.dart';

class MutualFriendsSummary extends StatelessWidget {
  final UserApiClient api;
  final String targetId;
  final Map<String, dynamic> evidence;
  const MutualFriendsSummary({
    super.key,
    required this.api,
    required this.targetId,
    required this.evidence,
  });
  @override
  Widget build(BuildContext context) {
    if (evidence['state'] != 'available' ||
        evidence['count'] is! int ||
        (evidence['count'] as int) <= 0) {
      return const SizedBox.shrink();
    }
    final samples = (evidence['data'] as List? ?? []).whereType<Map>();
    return TextButton.icon(
      icon: const Icon(Icons.people_outline),
      label: Text(
        '${evidence['count']} bạn chung${samples.isEmpty ? '' : ' · ${samples.map((e) => e['displayName'] ?? e['username']).join(', ')}'}',
      ),
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MutualFriendsScreen(api: api, targetId: targetId),
        ),
      ),
    );
  }
}

class MutualFriendsScreen extends StatefulWidget {
  final UserApiClient api;
  final String targetId;
  const MutualFriendsScreen({
    super.key,
    required this.api,
    required this.targetId,
  });
  @override
  State<MutualFriendsScreen> createState() => _MutualFriendsScreenState();
}

class _MutualFriendsScreenState extends State<MutualFriendsScreen> {
  List<Map<String, dynamic>> rows = [];
  String? cursor;
  String? message;
  bool loading = false;
  bool hasMore = false;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (loading) return;
    final version = ++generation;
    final epoch = widget.api.discoveryEpoch;
    setState(() {
      loading = true;
      message = null;
    });
    try {
      final data = await widget.api.list(
        'profiles/${widget.targetId}/mutual-friends',
        cursor: more ? cursor : null,
      );
      if (!mounted ||
          version != generation ||
          epoch != widget.api.discoveryEpoch) {
        return;
      }
      final items = (data['data'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        final hidden =
            data['state'] == 'hidden' || data['state'] == 'unavailable';
        rows = hidden ? [] : mergeUniqueRows(more ? rows : [], items);
        cursor = hidden ? null : data['nextCursor'] as String?;
        hasMore = !hidden && data['hasMore'] == true;
        message = switch (data['state']) {
          'hidden' => 'Mục bạn chung hiện không được hiển thị.',
          'unavailable' => 'Thông tin bạn chung tạm chưa khả dụng.',
          _ =>
            data['partial'] == true
                ? 'Danh sách bạn chung đang được cập nhật. Hãy thử lại sau.'
                : rows.isEmpty
                ? 'Chưa có bạn chung được phép hiển thị.'
                : null,
        };
      });
    } catch (e) {
      if (mounted && version == generation) {
        setState(() {
          if (e is AuthApiException && e.statusCode == 404) {
            rows = [];
            cursor = null;
            hasMore = false;
          }
          message = userError(e);
        });
      }
    } finally {
      if (mounted && version == generation) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Bạn chung')),
    body: RefreshIndicator(
      onRefresh: () => load(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (loading) const LinearProgressIndicator(),
          if (message != null)
            Padding(padding: const EdgeInsets.all(24), child: Text(message!)),
          ...rows.map(
            (row) => ListTile(
              title: Text(
                row['displayName'] as String? ?? row['username'] as String,
              ),
              subtitle: Text('@${row['username']}'),
              leading: UserAvatar(
                avatarUrl: row['avatarUrl'] as String?,
                displayName:
                    row['displayName'] as String? ?? row['username'] as String?,
              ),
              onTap: () async {
                final revision = widget.api.socialRevision;
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => UsernameProfileScreen(
                      username: row['username'] as String,
                      api: widget.api,
                    ),
                  ),
                );
                if (mounted && revision != widget.api.socialRevision) load();
              },
            ),
          ),
          if (hasMore)
            TextButton(
              onPressed: loading ? null : () => load(more: true),
              child: const Text('Xem thêm'),
            ),
          if (message != null)
            TextButton(
              onPressed: loading ? null : load,
              child: const Text('Thử lại'),
            ),
        ],
      ),
    ),
  );
}
