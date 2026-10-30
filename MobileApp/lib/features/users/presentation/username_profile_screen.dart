import 'package:flutter/material.dart';
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

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Trang cá nhân')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: loading
            ? const CircularProgressIndicator()
            : profile == null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error ?? 'Không tìm thấy người dùng.'),
                  TextButton(onPressed: load, child: const Text('Thử lại')),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 44,
                    backgroundImage:
                        profile!['avatarUrl'] is String &&
                            (profile!['avatarUrl'] as String).isNotEmpty
                        ? NetworkImage(profile!['avatarUrl'] as String)
                        : null,
                    child: profile!['avatarUrl'] == null
                        ? const Icon(Icons.person, size: 44)
                        : null,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    profile!['displayName'] as String? ??
                        profile!['username'] as String,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  Text('@${profile!['username']}'),
                  const SizedBox(height: 24),
                  actions(),
                  if (busy)
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(),
                    ),
                  if (!busy)
                    IconButton(
                      tooltip: 'Làm mới',
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                    ),
                ],
              ),
      ),
    ),
  );
}
