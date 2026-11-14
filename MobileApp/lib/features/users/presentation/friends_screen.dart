import '../../../core/widgets/user_avatar.dart';
import '../../../core/utils/paginated_rows.dart';
import '../../auth/data/services/auth_api_client.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'discovery_privacy_screen.dart';
import 'username_profile_screen.dart';
import '../data/user_api_client.dart';
import 'profile_share_card.dart';
import 'mutual_friends.dart';

class FriendsScreen extends StatefulWidget {
  final UserApiClient api;
  final int initialTab;
  final bool autofocus;
  final bool embedded;
  final bool active;
  final bool singleTab;
  const FriendsScreen({
    super.key,
    required this.api,
    this.initialTab = 0,
    this.autofocus = false,
    this.embedded = false,
    this.active = true,
    this.singleTab = false,
  }) : assert(initialTab >= 0 && initialTab < 6),
       assert(!singleTab || !embedded);
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
  String? cursor;
  String? discoveryState;
  bool degraded = false;
  bool loading = false;
  bool hasMore = false;
  String? error;
  List<Map<String, dynamic>> rows = [];
  final Set<String> busy = {};
  bool hasLoaded = false;
  late int observedRevision = widget.api.socialRevision;
  final labels = [
    'Tìm bạn',
    'Lời mời đến',
    'Đã gửi',
    'Bạn bè',
    'Đã chặn',
    'Gợi ý',
  ];
  String get term => input.text
      .trim()
      .replaceFirst(RegExp(r'^@'), '')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ')
      .toLowerCase();
  bool get _validTerm =>
      term.length >= 2 &&
      term.length <= 100 &&
      RegExp(r"^[\p{L}\p{N}_ .'-]+$", unicode: true).hasMatch(term);
  String get path => [
    'search',
    'friend-requests',
    'friend-requests',
    'friends',
    'blocks',
    'recommendations',
  ][tab];
  @override
  void initState() {
    super.initState();
    tab = widget.initialTab;
    if (tab != 0 && widget.active) load();
  }

  @override
  void didUpdateWidget(covariant FriendsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active &&
        !oldWidget.active &&
        (!hasLoaded || observedRevision != widget.api.socialRevision)) {
      if (tab != 0 || term.length >= 2) load();
    }
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
    final invalid = term.length >= 2 && !_validTerm;
    setState(() {
      rows = [];
      page = 0;
      cursor = null;
      discoveryState = null;
      degraded = false;
      hasMore = false;
      error = invalid
          ? 'Từ khóa chỉ gồm chữ, số, dấu cách, _, ., \', - (tối đa một dấu @ ở đầu).'
          : null;
      loading = false;
    });
    if (_validTerm) {
      debounce = Timer(const Duration(milliseconds: 350), () => load());
    }
  }

  void select(int value) {
    if (widget.singleTab && value != widget.initialTab) return;
    debounce?.cancel();
    generation++;
    viewGeneration++;
    final invalid = value == 0 && term.length >= 2 && !_validTerm;
    setState(() {
      tab = value;
      rows = [];
      page = 0;
      cursor = null;
      discoveryState = null;
      degraded = false;
      hasMore = false;
      loading = false;
      error = invalid
          ? 'Từ khóa chỉ gồm chữ, số, dấu cách, _, ., \', - (tối đa một dấu @ ở đầu).'
          : null;
    });
    if (tab != 0 || _validTerm) load();
  }

  Future<void> _openPrivacySettings() async {
    final revision = widget.api.socialRevision;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DiscoveryPrivacyScreen(api: widget.api),
      ),
    );
    if (mounted && revision != widget.api.socialRevision && tab == 5) {
      await load();
    }
  }

  Future<void> load({bool more = false}) async {
    if (loading || (tab == 0 && !_validTerm)) {
      return;
    }
    final ticket = ++generation;
    final epoch = widget.api.discoveryEpoch;
    final next = more ? page + 1 : 1;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.list(
        path,
        q: tab == 0 ? term : null,
        cursor: more && (tab == 0 || tab == 5) ? cursor : null,
        page: next,
        direction: tab == 1
            ? 'incoming'
            : tab == 2
            ? 'outgoing'
            : null,
      );
      if (!mounted ||
          ticket != generation ||
          epoch != widget.api.discoveryEpoch) {
        return;
      }
      final items = (data['data'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        rows = mergeUniqueRows(more ? rows : [], items);
        page = next;
        hasMore = data['hasMore'] == true;
        cursor = data['nextCursor'] as String?;
        discoveryState = data['state'] as String?;
        degraded = data['degraded'] == true;
        hasLoaded = true;
        observedRevision = widget.api.socialRevision;
      });
    } catch (e) {
      if (mounted && ticket == generation) setState(() => error = userError(e));
    } finally {
      if (mounted && ticket == generation) setState(() => loading = false);
    }
  }

  String peerId(Map<String, dynamic> row) => row['peer'] is Map
      ? (row['peer'] as Map)['id'] as String
      : row['id'] as String;

  Future<void> refreshPeer(String id, String username) async {
    final view = viewGeneration;
    final epoch = widget.api.discoveryEpoch;
    try {
      final profile = await widget.api.request(
        'GET',
        'profiles/by-username/${Uri.encodeComponent(username)}',
      );
      if (!mounted ||
          view != viewGeneration ||
          epoch != widget.api.discoveryEpoch) {
        return;
      }
      setState(() {
        final remove =
            (tab == 5 && profile['relationshipStatus'] != 'NONE') ||
            (tab == 3 && profile['relationshipStatus'] != 'FRIENDS') ||
            (tab == 1 && profile['relationshipStatus'] != 'INCOMING_PENDING') ||
            (tab == 2 && profile['relationshipStatus'] != 'OUTGOING_PENDING');
        if (remove) {
          rows.removeWhere((row) => peerId(row) == id);
        } else {
          rows = rows
              .map(
                (row) => peerId(row) == id
                    ? (row['peer'] is Map ? {...row, 'peer': profile} : profile)
                    : row,
              )
              .toList();
        }
        observedRevision = widget.api.socialRevision;
      });
    } catch (e) {
      if (!mounted || view != viewGeneration) return;
      if (e is AuthApiException && e.statusCode == 404) {
        setState(() => rows.removeWhere((row) => peerId(row) == id));
      } else {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userError(e))));
      }
    }
  }

  Future<void> openProfile(Map<String, dynamic> peer) async {
    final revision = widget.api.socialRevision;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UsernameProfileScreen(
          username: peer['username'] as String,
          api: widget.api,
        ),
      ),
    );
    if (mounted && revision != widget.api.socialRevision) {
      await refreshPeer(peer['id'] as String, peer['username'] as String);
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
    generation++;
    setState(() {
      busy.add(key);
      loading = false;
    });
    bool reload = false;
    try {
      final result = await widget.api.request(method, path, body: body);
      if (!mounted || contextGeneration != viewGeneration) return;
      if (tab == 5 || tab == 0) {
        setState(() {
          final remove =
              path.startsWith('blocks/') ||
              (tab == 5 &&
                  (path.endsWith('/dismiss') || path == 'friend-requests'));
          if (remove) {
            rows.removeWhere((row) => row['id'] == key);
          } else {
            String? relationship;
            String? requestId;
            if (path == 'friend-requests') {
              relationship = 'OUTGOING_PENDING';
              requestId = result['id'] as String?;
            } else if (path.endsWith('/accept')) {
              relationship = 'FRIENDS';
            } else if (path.endsWith('/cancel') ||
                path.endsWith('/reject') ||
                path.startsWith('friends/')) {
              relationship = 'NONE';
            }
            if (relationship != null) {
              rows = rows
                  .map(
                    (row) => row['id'] == key
                        ? {
                            ...row,
                            'relationshipStatus': relationship,
                            'friendRequestId': requestId,
                          }
                        : row,
                  )
                  .toList();
            }
          }
          observedRevision = widget.api.socialRevision;
        });
        reload = rows.isEmpty;
      } else {
        setState(() {
          rows.removeWhere((row) => peerId(row) == key);
          observedRevision = widget.api.socialRevision;
        });
      }
    } catch (e) {
      if (!mounted || contextGeneration != viewGeneration) return;
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userError(e))));
      }
      // A conflict needs authoritative state, but successful local updates keep
      // already loaded pages and their cursor intact.
      final current = rows.where((row) => peerId(row) == key).firstOrNull;
      if (current != null) {
        final peer = current['peer'] is Map ? current['peer'] as Map : current;
        await refreshPeer(key, peer['username'] as String);
      }
    } finally {
      if (mounted) {
        setState(() => busy.remove(key));
        if (reload && contextGeneration == viewGeneration) {
          await load(more: tab == 5 && rows.isEmpty && hasMore);
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
    final actions = <Widget>[
      if (tab != 4) button('Xem hồ sơ', () => openProfile(peer)),
    ];
    if (tab == 4) {
      actions.add(
        button('Bỏ chặn', () async {
          final accepted = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Bỏ chặn người dùng?'),
              content: const Text(
                'Người này có thể tìm thấy hồ sơ và gửi lời mời kết bạn cho bạn.',
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
            await action(id, 'DELETE', 'blocks/$id');
          }
        }),
      );
    } else {
      if (relationship == 'FRIENDS') {
        actions.add(const Chip(label: Text('Bạn bè')));
      }
      if (relationship == 'OUTGOING_PENDING') {
        actions.add(const Chip(label: Text('Đã gửi lời mời')));
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
    if (tab == 5) {
      actions.add(
        button(
          'Ẩn gợi ý',
          () => action(id, 'POST', 'recommendations/$id/dismiss'),
        ),
      );
    }
    return Card(
      key: ValueKey('social_card_$id'),
      child: InkWell(
        onTap: tab == 4 ? null : () => openProfile(peer),
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  UserAvatar(
                    avatarUrl: peer['avatarUrl'] as String?,
                    displayName:
                        peer['displayName'] as String? ??
                        peer['username'] as String?,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
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
              if (peer['mutual'] is Map)
                MutualFriendsSummary(
                  api: widget.api,
                  targetId: id,
                  evidence: Map<String, dynamic>.from(peer['mutual'] as Map),
                ),
              Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: actions,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabFilters(BuildContext context) {
    final chips = <Widget>[
      for (var i = 0; i < labels.length; i++)
        if (!(widget.embedded && (i == 0 || i == 4)))
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: ChoiceChip(
              label: Text(labels[i]),
              selected: tab == i,
              onSelected: (_) => select(i),
            ),
          ),
    ];
    if (MediaQuery.textScalerOf(context).scale(14) > 19) {
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: chips),
      );
    }
    return Wrap(runSpacing: 4, children: chips);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: widget.embedded
        ? null
        : AppBar(title: Text(tab == 0 ? 'Tìm tài khoản' : labels[tab])),
    body: Column(
      children: [
        if (!widget.singleTab)
          Padding(
            padding: EdgeInsets.fromLTRB(12, 8, widget.embedded ? 12 : 8, 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _tabFilters(context)),
                if (!widget.embedded)
                  IconButton(
                    key: const Key('friends_privacy_button'),
                    tooltip: 'Quyền riêng tư kết bạn',
                    icon: const Icon(Icons.tune_rounded),
                    onPressed: _openPrivacySettings,
                  ),
              ],
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
              decoration: InputDecoration(
                suffixIcon: input.text.isEmpty
                    ? null
                    : IconButton(
                        key: const Key('clear_friend_search'),
                        tooltip: 'Xóa tìm kiếm',
                        onPressed: () {
                          input.clear();
                          change('');
                        },
                        icon: const Icon(Icons.clear),
                      ),
                labelText: 'Tìm bằng tên hoặc @username',
                hintText: 'Nhập ít nhất 2 ký tự',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
        if (degraded && tab == 0)
          const Padding(
            padding: EdgeInsets.all(12),
            child: Text(
              'Đang tìm theo tên và username. Thông tin bạn chung tạm chưa khả dụng.',
            ),
          ),
        if (loading) const LinearProgressIndicator(),
        if (error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Text(error!),
                if (tab != 0 || _validTerm)
                  TextButton(
                    onPressed: () => load(),
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
                            tab == 5
                                ? switch (discoveryState) {
                                    'maintenance' =>
                                      'Hệ thống gợi ý đang tạm bảo trì.',
                                    'preparing' =>
                                      'Đang chuẩn bị gợi ý cho bạn.',
                                    'cold_start' =>
                                      'Tìm và kết nối người bạn đầu tiên để nhận gợi ý.',
                                    _ => 'Chưa có gợi ý phù hợp.',
                                  }
                                : tab == 0 && term.isEmpty
                                ? 'Tìm người bạn muốn kết nối'
                                : 'Chưa có kết quả.',
                          ),
                          if (tab == 0)
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text(
                                'Nhập tên có dấu, không dấu hoặc @username để tìm bạn.',
                                textAlign: TextAlign.center,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (tab == 5 && discoveryState == 'cold_start')
                  ProfileShareCard(
                    api: widget.api,
                    onSearch: widget.embedded
                        ? () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => FriendsScreen(
                                  api: widget.api,
                                  autofocus: true,
                                  singleTab: true,
                                ),
                              ),
                            );
                            if (mounted &&
                                observedRevision != widget.api.socialRevision) {
                              await load();
                            }
                          }
                        : () => select(0),
                  ),
                if (tab == 5 &&
                    (discoveryState == 'preparing' ||
                        discoveryState == 'maintenance'))
                  TextButton(
                    onPressed: loading ? null : () => load(),
                    child: const Text('Thử lại'),
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
