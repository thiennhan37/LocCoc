import 'dart:async';
import 'package:flutter/material.dart';
import 'username_profile_screen.dart';
import '../data/user_api_client.dart';

class FriendsScreen extends StatefulWidget {
  final UserApiClient api;
  final int initialTab;
  final bool autofocus;
  const FriendsScreen({
    super.key,
    required this.api,
    this.initialTab = 0,
    this.autofocus = false,
  }) : assert(initialTab >= 0 && initialTab < 5);
  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  final input = TextEditingController();
  Timer? debounce;
  int generation = 0;
  int viewGeneration = 0;
  int tab = 0;
  int page = 0;
  bool loading = false;
  bool hasMore = false;
  String? error;
  List<Map<String, dynamic>> rows = [];
  final Set<String> busy = {};
  final labels = ['Tìm bạn', 'Lời mời đến', 'Đã gửi', 'Bạn bè', 'Đã chặn'];
  String get term => input.text.trim().toLowerCase();
  String get path => [
    'search',
    'friend-requests',
    'friend-requests',
    'friends',
    'blocks',
  ][tab];
  @override
  void initState() {
    super.initState();
    tab = widget.initialTab;
    if (tab != 0) load();
  }

  @override
  void dispose() {
    debounce?.cancel();
    generation++;
    input.dispose();
    super.dispose();
  }

  void change(String value) {
    debounce?.cancel();
    generation++;
    viewGeneration++;
    setState(() {
      rows = [];
      page = 0;
      hasMore = false;
      error = null;
      loading = false;
    });
    if (RegExp(r'^[a-z0-9_]{2,30}$').hasMatch(term)) {
      debounce = Timer(const Duration(milliseconds: 350), () => load());
    }
  }

  void select(int value) {
    debounce?.cancel();
    generation++;
    viewGeneration++;
    setState(() {
      tab = value;
      rows = [];
      page = 0;
      hasMore = false;
      loading = false;
      error = null;
    });
    if (tab != 0 || RegExp(r'^[a-z0-9_]{2,30}$').hasMatch(term)) load();
  }

  Future<void> load({bool more = false}) async {
    if (loading || (tab == 0 && !RegExp(r'^[a-z0-9_]{2,30}$').hasMatch(term))) {
      return;
    }
    final ticket = ++generation;
    final next = more ? page + 1 : 1;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.list(
        path,
        username: tab == 0 ? term : null,
        page: next,
        direction: tab == 1
            ? 'incoming'
            : tab == 2
            ? 'outgoing'
            : null,
      );
      if (!mounted || ticket != generation) return;
      final items = (data['data'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        rows = more ? [...rows, ...items] : items;
        page = next;
        hasMore = data['hasMore'] == true;
      });
    } catch (e) {
      if (mounted && ticket == generation) setState(() => error = userError(e));
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  Future<void> action(
    String key,
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    if (busy.contains(key)) return;
    final contextGeneration = viewGeneration;
    setState(() => busy.add(key));
    try {
      await widget.api.request(method, path, body: body);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userError(e))));
      }
    } finally {
      if (mounted) {
        setState(() => busy.remove(key));
        if (viewGeneration == contextGeneration) {
          setState(() => loading = false);
          await load();
        }
      }
    }
  }

  Widget row(Map<String, dynamic> item) {
    final peer = item['peer'] is Map
        ? Map<String, dynamic>.from(item['peer'] as Map)
        : item;
    final id = peer['id'] as String;
    final relationship = tab == 1
        ? 'INCOMING_PENDING'
        : tab == 2
        ? 'OUTGOING_PENDING'
        : tab == 3
        ? 'FRIENDS'
        : peer['relationshipStatus'] ?? 'NONE';
    final requestId = item['peer'] is Map
        ? item['id']
        : peer['friendRequestId'];
    final disabled = busy.contains(id);
    Widget button(String label, VoidCallback onTap) =>
        TextButton(onPressed: disabled ? null : onTap, child: Text(label));
    final actions = <Widget>[];
    if (tab == 4) {
      actions.add(button('Bỏ chặn', () => action(id, 'DELETE', 'blocks/$id')));
    } else {
      if (relationship == 'FRIENDS') {
        actions.add(const Chip(label: Text('Friends')));
      }
      if (relationship == 'OUTGOING_PENDING') {
        actions.add(const Chip(label: Text('Request Sent')));
        actions.add(
          button(
            'Thu hồi',
            () => action(id, 'POST', 'friend-requests/$requestId/cancel'),
          ),
        );
      }
      if (relationship == 'INCOMING_PENDING') {
        actions.add(
          button(
            'Chấp nhận',
            () => action(id, 'POST', 'friend-requests/$requestId/accept'),
          ),
        );
        actions.add(
          button(
            'Từ chối',
            () => action(id, 'POST', 'friend-requests/$requestId/reject'),
          ),
        );
      }
      if (relationship == 'NONE') {
        actions.add(
          button(
            'Kết bạn',
            () =>
                action(id, 'POST', 'friend-requests', body: {'receiverId': id}),
          ),
        );
      }
      actions.add(
        PopupMenuButton<String>(
          enabled: !disabled,
          onSelected: (v) async {
            final accepted = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: Text(v == 'block' ? 'Chặn người dùng?' : 'Hủy kết bạn?'),
                content: Text(
                  v == 'block'
                      ? 'Quan hệ bạn bè và lời mời đang chờ sẽ bị hủy.'
                      : 'Bạn có thể gửi lời mời mới sau này.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Quay lại'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Xác nhận'),
                  ),
                ],
              ),
            );
            if (accepted == true && mounted) {
              await action(
                id,
                v == 'block' ? 'PUT' : 'DELETE',
                '${v == 'block' ? 'blocks' : 'friends'}/$id',
              );
            }
          },
          itemBuilder: (_) => [
            if (relationship == 'FRIENDS')
              const PopupMenuItem(
                value: 'unfriend',
                child: Text('Hủy kết bạn'),
              ),
            const PopupMenuItem(value: 'block', child: Text('Chặn')),
          ],
        ),
      );
    }
    final avatar = peer['avatarUrl'] as String?;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(
                  width: 44,
                  height: 44,
                  child: avatar == null
                      ? const CircleAvatar(child: Icon(Icons.person))
                      : ClipOval(
                          child: Image.network(
                            avatar,
                            fit: BoxFit.cover,
                            errorBuilder: (_, error, stack) =>
                                const CircleAvatar(child: Icon(Icons.person)),
                          ),
                        ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (tab != 4)
                        TextButton(
                          onPressed: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => UsernameProfileScreen(
                                  username: peer['username'] as String,
                                  api: widget.api,
                                ),
                              ),
                            );
                            if (mounted) load();
                          },
                          child: const Text('Xem hồ sơ'),
                        ),
                      Text(
                        peer['displayName'] as String? ??
                            peer['username'] as String? ??
                            '',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text('@${peer['username'] ?? ''}'),
                    ],
                  ),
                ),
              ],
            ),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: actions,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tab == 0 ? 'Tìm tài khoản' : labels[tab])),
    body: Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: List.generate(
              labels.length,
              (i) => Padding(
                padding: const EdgeInsets.all(4),
                child: ChoiceChip(
                  label: Text(labels[i]),
                  selected: tab == i,
                  onSelected: (_) => select(i),
                ),
              ),
            ),
          ),
        ),
        if (tab == 0)
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              key: const Key('friend-search'),
              controller: input,
              autofocus: widget.autofocus,
              onChanged: change,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Tìm bằng username',
                hintText: 'Nhập ít nhất 2 ký tự',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
        if (loading) const LinearProgressIndicator(),
        if (error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Text(error!),
                TextButton(
                  onPressed: () => load(more: page > 0),
                  child: const Text('Thử lại'),
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              debounce?.cancel();
              setState(() => loading = false);
              await load();
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(12),
              children: [
                if (!loading && rows.isEmpty && error == null)
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(
                      child: Column(
                        children: [
                          Icon(
                            tab == 0
                                ? Icons.person_search_outlined
                                : Icons.people_outline,
                            size: 48,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            tab == 0 && term.isEmpty
                                ? 'Tìm người bạn muốn kết nối'
                                : 'Chưa có kết quả.',
                          ),
                          if (tab == 0)
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text(
                                'Nhập username từ 2–30 ký tự: chữ, số hoặc dấu gạch dưới.',
                                textAlign: TextAlign.center,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ...rows.map(row),
                if (hasMore)
                  TextButton(
                    onPressed: loading ? null : () => load(more: true),
                    child: const Text('Xem thêm'),
                  ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
