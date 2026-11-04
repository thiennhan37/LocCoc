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
    try {
      final result = await widget.api.request(
        'GET',
        'profiles/by-username/${Uri.encodeComponent(widget.username)}',
      );
      if (mounted && version == loadVersion) {
        setState(() {
          profile = result;
          loading = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && version == loadVersion) {
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

  Widget actions() {
    final state = profile!['relationshipStatus'];
    if (state == 'SELF') return const Text('Đây là hồ sơ của bạn');
    if (state == 'FRIENDS') {
      return const FilledButton(onPressed: null, child: Text('Friends'));
    }
    if (state == 'OUTGOING_PENDING') {
      return Column(
        children: [
          const Text('Request Sent'),
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

  Widget avatar() {
    final url = profile?['avatarUrl'] as String?;
    final uri = url == null ? null : Uri.tryParse(url);
    final fallback = Container(
      color: Colors.white,
      child: const Icon(
        Icons.person_outline_rounded,
        size: 48,
        color: AppColors.primary,
      ),
    );
    return Container(
      width: 96,
      height: 96,
      padding: const EdgeInsets.all(4),
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
      ),
      child: ClipOval(
        child: uri != null && ['https', 'http'].contains(uri.scheme)
            ? Image.network(
                url!,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => fallback,
              )
            : fallback,
      ),
    );
  }

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
