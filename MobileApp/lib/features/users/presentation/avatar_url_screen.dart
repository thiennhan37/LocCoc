import 'package:flutter/foundation.dart';
import 'profile_media_screen.dart';
import 'package:flutter/material.dart';
import '../../../core/utils/avatar_url.dart';
import '../../../core/widgets/user_avatar.dart';
import '../data/user_api_client.dart';

/// The backend accepts a URL. It does not provide an image-upload endpoint.
class AvatarUrlScreen extends StatefulWidget {
  final UserApiClient api;
  final Map<String, dynamic> profile;
  const AvatarUrlScreen({super.key, required this.api, required this.profile});
  @override
  State<AvatarUrlScreen> createState() => _AvatarUrlScreenState();
}

class _AvatarUrlScreenState extends State<AvatarUrlScreen> {
  late final input = TextEditingController(
    text: widget.profile['avatarUrl'] as String? ?? '',
  );
  final form = GlobalKey<FormState>();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy || !(form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final profile = await widget.api.request(
        'PATCH',
        'me',
        body: {'avatarUrl': input.text.trim()},
      );
      if (mounted && widget.api.isCurrent) Navigator.pop(context, profile);
    } catch (e) {
      if (mounted) setState(() => error = userError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Ảnh đại diện')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: UserAvatar(
                  avatarUrl: input.text,
                  displayName:
                      widget.profile['displayName'] as String? ??
                      widget.profile['username'] as String?,
                  size: 96,
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                key: const Key('open_avatar_upload'),
                onPressed: busy
                    ? null
                    : () async {
                        final updated = await Navigator.of(context)
                            .push<Map<String, dynamic>>(
                              MaterialPageRoute(
                                builder: (_) => ProfileMediaScreen(
                                  api: widget.api,
                                  profile: widget.profile,
                                  kind: 'avatar',
                                ),
                              ),
                            );
                        if (!mounted ||
                            !widget.api.isCurrent ||
                            updated == null) {
                          return;
                        }
                        if (context.mounted) Navigator.of(context).pop(updated);
                      },
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: const Text('Chọn ảnh từ máy / camera'),
              ),
              const SizedBox(height: 20),
              const Text(
                'Dán liên kết HTTPS từ nguồn ảnh được máy chủ cho phép. Để trống để dùng chữ cái đầu. Bạn cũng có thể chọn ảnh từ thư viện hoặc camera.',
              ),
              const SizedBox(height: 20),
              TextFormField(
                key: const Key('avatar_url_input'),
                controller: input,
                enabled: !busy,
                keyboardType: TextInputType.url,
                maxLength: 1024,
                autocorrect: false,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'URL ảnh đại diện',
                  hintText: 'https://example.com/avatar.jpg',
                ),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ||
                        avatarUri(value, allowHttp: kDebugMode) != null
                    ? null
                    : 'Hãy nhập liên kết ảnh HTTPS hợp lệ (tối đa 1024 ký tự).',
              ),
              if (error != null)
                Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              const SizedBox(height: 20),
              FilledButton(
                key: const Key('save_avatar_url'),
                onPressed: busy ? null : save,
                child: Text(busy ? 'Đang lưu…' : 'Lưu liên kết ảnh'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
