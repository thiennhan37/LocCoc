import 'package:flutter/foundation.dart';
import '../../../core/utils/avatar_url.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/widgets/full_screen_image_viewer.dart';
import 'package:flutter/material.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../data/user_api_client.dart';
import 'profile_media_screen.dart';
import '../../../core/widgets/user_cover.dart';

class EditProfileScreen extends StatefulWidget {
  final UserApiClient api;
  const EditProfileScreen({super.key, required this.api});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _name = TextEditingController();
  final _avatar = TextEditingController();
  String _originalName = '', _originalAvatar = '';
  String? _phone;
  final _form = GlobalKey<FormState>();
  bool _loading = true;
  bool _saving = false;
  bool _loaded = false;
  String? _error;
  DateTime? _nextChange;
  Map<String, dynamic> _profile = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _avatar.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await widget.api.me();
      if (!mounted || !widget.api.isCurrent) return;
      _profile = profile;
      _name.text = profile['displayName'] as String? ?? '';
      _avatar.text = profile['avatarUrl'] as String? ?? '';
      _originalName = _name.text.trim();
      _originalAvatar = _avatar.text.trim();
      _phone = profile['phone'] as String?;
      setState(() {
        _loaded = true;
        _nextChange = DateTime.tryParse(
          profile['nextDisplayNameChangeAt'] as String? ?? '',
        );
      });
    } catch (e) {
      if (mounted) setState(() => _error = userError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final avatarChanged = _avatar.text.trim() != _originalAvatar;
      final nameChanged = _name.text.trim() != _originalName;
      final profile = await widget.api.updateProfile(
        displayName: nameChanged || !avatarChanged ? _name.text : null,
        avatarUrl: avatarChanged ? _avatar.text : null,
      );
      if (!mounted || !widget.api.isCurrent) return;
      Navigator.of(context).pop(profile);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userError(e);
        if (e is AuthApiException && e.nextDisplayNameChangeAt != null) {
          _nextChange = e.nextDisplayNameChangeAt;
        }
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editMedia(String kind) async {
    if (_saving || !widget.api.isCurrent) return;
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            ProfileMediaScreen(api: widget.api, profile: _profile, kind: kind),
      ),
    );
    if (!mounted || !widget.api.isCurrent || result == null) return;
    setState(() {
      _profile = result;
      _avatar.text = result['avatarUrl'] as String? ?? '';
      _originalAvatar = _avatar.text.trim();
    });
  }

  String _dateLabel(DateTime date) {
    final local = date.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: Scaffold(
      appBar: AppBar(title: const Text('Chỉnh sửa hồ sơ')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Bạn được đổi tên hiển thị mỗi 30 ngày. Đặt tên lần đầu và lưu tên hiện tại không tính lượt.',
                    ),
                    if (_nextChange != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Thời điểm được đổi tên tiếp theo: ${_dateLabel(_nextChange!)}',
                      ),
                    ],
                    const SizedBox(height: 24),
                    Center(
                      child: UserAvatar(
                        avatarUrl: _avatar.text,
                        displayName: _name.text,
                        size: 80,
                        onTap: () {
                          FullScreenImageViewer.open(
                            context,
                            imageUrl: _avatar.text,
                            title: 'Ảnh đại diện',
                            subtitle: _name.text,
                            emptyMessage: 'Chưa có ảnh đại diện để xem.',
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 20),
                    UserCover(
                      coverUrl: _profile['coverUrl'] as String?,
                      onTap: () {
                        FullScreenImageViewer.open(
                          context,
                          imageUrl: _profile['coverUrl'] as String?,
                          title: 'Ảnh bìa',
                          subtitle: _name.text,
                          emptyMessage: 'Chưa có ảnh bìa để xem.',
                        );
                      },
                    ),
                    OutlinedButton(
                      key: const Key('edit_avatar_media'),
                      onPressed: _saving || !_loaded
                          ? null
                          : () => _editMedia('avatar'),
                      child: const Text('Đổi hoặc gỡ ảnh đại diện'),
                    ),
                    OutlinedButton(
                      key: const Key('edit_cover_media'),
                      onPressed: _saving || !_loaded
                          ? null
                          : () => _editMedia('cover'),
                      child: const Text('Đổi hoặc gỡ ảnh bìa'),
                    ),
                    const Text(
                      'Thao tác ảnh được lưu riêng khi bạn xác nhận. Tên hiển thị chỉ thay đổi khi bấm Lưu hồ sơ.',
                    ),
                    const SizedBox(height: 20),
                    TextFormField(
                      key: const Key('edit_display_name'),
                      controller: _name,
                      enabled: !_saving,
                      maxLength: 255,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Tên hiển thị',
                      ),
                      validator: (value) =>
                          (value == null || value.trim().isEmpty) &&
                              !(_originalName.isEmpty &&
                                  _avatar.text.trim() != _originalAvatar)
                          ? 'Vui lòng nhập tên hiển thị.'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('edit_profile_avatar_url'),
                      controller: _avatar,
                      enabled: !_saving,
                      maxLength: 1024,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Liên kết ảnh đại diện',
                        helperText:
                            'Dùng URL HTTPS từ nguồn ảnh được máy chủ cho phép. Để trống để dùng chữ cái đầu.',
                      ),
                      validator: (value) =>
                          (value ?? '').trim() == _originalAvatar ||
                              (value ?? '').trim().isEmpty ||
                              avatarUri(value, allowHttp: kDebugMode) != null
                          ? null
                          : 'Hãy nhập URL ảnh HTTPS hợp lệ.',
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Số điện thoại tài khoản: ${_phone?.trim().isNotEmpty == true ? _phone : 'Chưa có'}',
                    ),
                    const Text(
                      'Số điện thoại thuộc thông tin tài khoản. Chức năng sửa số chưa được hỗ trợ tại đây.',
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                      TextButton(
                        onPressed: _saving ? null : _load,
                        child: const Text('Tải lại hồ sơ'),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      key: const Key('save_display_name'),
                      onPressed: _saving || !_loaded ? null : _save,
                      child: Text(_saving ? 'Đang lưu…' : 'Lưu hồ sơ'),
                    ),
                  ],
                ),
              ),
            ),
    ),
  );
}
