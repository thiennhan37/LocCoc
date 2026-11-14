import '../../../core/widgets/user_avatar.dart';
import '../../../core/widgets/user_cover.dart';
import '../../../core/widgets/full_screen_image_viewer.dart';
import 'mutual_friends.dart';
import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../data/user_api_client.dart';

class UsernameProfileScreen extends StatefulWidget {
  final String username;
  final UserApiClient api;
  const UsernameProfileScreen({
    super.key,
    required this.username,
    required this.api,
  });
  @override
  State<UsernameProfileScreen> createState() => _UsernameProfileScreenState();
}

class _UsernameProfileScreenState extends State<UsernameProfileScreen> {
  Map<String, dynamic>? profile;
  String? error;
  bool loading = true;
  bool busy = false;
  int loadVersion = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final version = ++loadVersion;
    final epoch = widget.api.discoveryEpoch;
    try {
      final result = await widget.api.request(
        'GET',
        'profiles/by-username/${Uri.encodeComponent(widget.username)}',
      );
      if (mounted &&
          version == loadVersion &&
          epoch == widget.api.discoveryEpoch) {
        setState(() {
          profile = result;
          loading = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted &&
          version == loadVersion &&
          epoch == widget.api.discoveryEpoch) {
        setState(() {
          profile = null;
          loading = false;
          error = userError(e);
        });
      }
    }
  }

  Future<void> act(String action) async {
    if (busy || profile == null) return;
    loadVersion++;
    setState(() => busy = true);
    String? message;
    try {
      if (action == 'send') {
        await widget.api.request(
          'POST',
          'friend-requests',
          body: {'receiverId': profile!['id']},
        );
      } else {
        final id = profile!['friendRequestId'];
        if (id is! String) throw const FormatException('Missing request');
        await widget.api.request(
          'POST',
          'friend-requests/${Uri.encodeComponent(id)}/$action',
        );
      }
    } catch (e) {
      message = e is AuthApiException && e.statusCode == 409
          ? 'Trạng thái đã thay đổi. Hồ sơ đã được làm mới.'
          : userError(e);
    }
    await load();
    if (!mounted) return;
    setState(() => busy = false);
    if (message != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> _confirmAndAct(String type) async {
    if (busy || profile == null) return;
    final targetId = profile!['id'];
    if (targetId is! String) return;
    final isBlock = type == 'block';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isBlock ? 'Chặn người dùng?' : 'Hủy kết bạn?'),
        content: Text(
          isBlock
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
    if (accepted != true || !mounted || busy) return;
    loadVersion++;
    setState(() => busy = true);
    if (isBlock) {
      try {
        await widget.api.request(
          'PUT',
          'blocks/${Uri.encodeComponent(targetId)}',
        );
        if (!mounted) return;
        final messenger = ScaffoldMessenger.maybeOf(context);
        final navigator = Navigator.of(context);
        if (navigator.canPop()) {
          navigator.pop(true);
          messenger?.showSnackBar(
            const SnackBar(content: Text('Đã chặn người dùng.')),
          );
          return;
        }
        setState(() {
          profile = null;
          busy = false;
          error = 'Bạn đã chặn người dùng này.';
        });
      } catch (e) {
        await load();
        if (!mounted) return;
        setState(() => busy = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userError(e))));
      }
      return;
    }
    String? message;
    try {
      await widget.api.request(
        'DELETE',
        'friends/${Uri.encodeComponent(targetId)}',
      );
    } catch (e) {
      message = e is AuthApiException && e.statusCode == 409
          ? 'Trạng thái đã thay đổi. Hồ sơ đã được làm mới.'
          : userError(e);
    }
    await load();
    if (!mounted) return;
    setState(() => busy = false);
    if (message != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Widget actions() {
    final state = profile!['relationshipStatus'];
    if (state == 'SELF') return const Text('Đây là hồ sơ của bạn');
    if (state == 'FRIENDS') {
      return const FilledButton(onPressed: null, child: Text('Bạn bè'));
    }
    if (state == 'OUTGOING_PENDING') {
      return Column(
        children: [
          const Text('Đã gửi lời mời'),
          TextButton(
            onPressed: busy ? null : () => act('cancel'),
            child: const Text('Thu hồi lời mời'),
          ),
        ],
      );
    }
    if (state == 'INCOMING_PENDING') {
      return Wrap(
        spacing: 12,
        children: [
          FilledButton(
            onPressed: busy ? null : () => act('accept'),
            child: const Text('Chấp nhận'),
          ),
          OutlinedButton(
            onPressed: busy ? null : () => act('reject'),
            child: const Text('Từ chối'),
          ),
        ],
      );
    }
    if (state == 'NONE') {
      return FilledButton(
        onPressed: busy ? null : () => act('send'),
        child: const Text('Kết bạn'),
      );
    }
    return const Text('Hãy tải lại hồ sơ để xem trạng thái hiện tại.');
  }

  void _viewPeerAvatar() {
    final name =
        profile?['displayName'] as String? ?? profile?['username'] as String?;
    FullScreenImageViewer.open(
      context,
      imageUrl: profile?['avatarUrl'] as String?,
      title: 'Ảnh đại diện',
      subtitle: name,
      emptyMessage: 'Người dùng chưa cập nhật ảnh đại diện.',
    );
  }

  void _viewPeerCover() {
    final name =
        profile?['displayName'] as String? ?? profile?['username'] as String?;
    FullScreenImageViewer.open(
      context,
      imageUrl: profile?['coverUrl'] as String?,
      title: 'Ảnh bìa',
      subtitle: name,
      emptyMessage: 'Người dùng chưa cập nhật ảnh bìa.',
    );
  }

  Widget avatar() => GestureDetector(
    key: const Key('view_peer_avatar'),
    onTap: _viewPeerAvatar,
    child: UserAvatar(
      avatarUrl: profile?['avatarUrl'] as String?,
      displayName:
          profile?['displayName'] as String? ?? profile?['username'] as String?,
      size: 96,
      onTap: _viewPeerAvatar,
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(
      title: const Text('Trang cá nhân'),
      actions: [
        IconButton(
          tooltip: 'Làm mới',
          onPressed: loading || busy ? null : load,
          icon: const Icon(Icons.refresh_rounded),
        ),
        if (profile != null && profile!['relationshipStatus'] != 'SELF')
          PopupMenuButton<String>(
            key: const Key('profile_more_actions'),
            tooltip: 'Tùy chọn',
            enabled: !busy,
            onSelected: _confirmAndAct,
            itemBuilder: (_) => [
              if (profile!['relationshipStatus'] == 'FRIENDS')
                const PopupMenuItem(
                  key: Key('profile_unfriend_action'),
                  value: 'unfriend',
                  child: Text('Hủy kết bạn'),
                ),
              const PopupMenuItem(
                key: Key('profile_block_action'),
                value: 'block',
                child: Text('Chặn'),
              ),
            ],
          ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(24),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: profile == null
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: 64),
                            child: Column(
                              children: [
                                const Icon(
                                  Icons.person_off_outlined,
                                  size: 64,
                                  color: AppColors.textSecondary,
                                ),
                                const SizedBox(height: 20),
                                Text(
                                  error ?? 'Không tìm thấy người dùng.',
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 12),
                                OutlinedButton.icon(
                                  onPressed: load,
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('Thử lại'),
                                ),
                              ],
                            ),
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              GestureDetector(
                                key: const Key('view_peer_cover'),
                                onTap: _viewPeerCover,
                                child: UserCover(
                                  coverUrl: profile!['coverUrl'] as String?,
                                  onTap: _viewPeerCover,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.all(28),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(28),
                                  gradient: const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      AppColors.coralLight,
                                      Colors.white,
                                    ],
                                  ),
                                  border: Border.all(
                                    color: AppColors.coralBorder,
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    avatar(),
                                    const SizedBox(height: 18),
                                    Text(
                                      profile!['displayName'] as String? ??
                                          profile!['username'] as String,
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineSmall
                                          ?.copyWith(
                                            fontWeight: FontWeight.w800,
                                          ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      '@${profile!['username']}',
                                      style: const TextStyle(
                                        color: AppColors.textSecondary,
                                        fontSize: 15,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),
                              if (profile!['mutual'] is Map)
                                MutualFriendsSummary(
                                  api: widget.api,
                                  targetId: profile!['id'] as String,
                                  evidence: Map<String, dynamic>.from(
                                    profile!['mutual'] as Map,
                                  ),
                                ),
                              Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(22),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    const Text(
                                      'Kết nối',
                                      style: TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      switch (profile!['relationshipStatus']) {
                                        'FRIENDS' =>
                                          'Hai bạn đã là bạn bè trên LocCoc.',
                                        'OUTGOING_PENDING' =>
                                          'Lời mời của bạn đang chờ được chấp nhận.',
                                        'INCOMING_PENDING' =>
                                          'Người này đã gửi lời mời kết bạn cho bạn.',
                                        'SELF' =>
                                          'Hồ sơ mà bạn chia sẻ với mọi người.',
                                        _ =>
                                          'Gửi lời mời để bắt đầu kết nối với người bạn này.',
                                      },
                                      style: const TextStyle(
                                        color: AppColors.textSecondary,
                                        height: 1.5,
                                      ),
                                    ),
                                    const SizedBox(height: 18),
                                    Center(child: actions()),
                                    if (busy)
                                      const Padding(
                                        padding: EdgeInsets.only(top: 16),
                                        child: LinearProgressIndicator(),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
  );
}
