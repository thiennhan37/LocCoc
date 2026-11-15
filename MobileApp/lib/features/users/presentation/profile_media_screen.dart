import 'package:flutter/material.dart';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/widgets/user_cover.dart';
import '../data/profile_image_picker.dart';
import '../data/user_api_client.dart';

class ProfileMediaScreen extends StatefulWidget {
  final UserApiClient api;
  final Map<String, dynamic> profile;
  final String kind;
  final ProfileImagePicker? picker;
  const ProfileMediaScreen({
    super.key,
    required this.api,
    required this.profile,
    required this.kind,
    this.picker,
  }) : assert(kind == 'avatar' || kind == 'cover');
  @override
  State<ProfileMediaScreen> createState() => _ProfileMediaScreenState();
}

class _ProfileMediaScreenState extends State<ProfileMediaScreen> {
  late final picker = widget.picker ?? ProfileImagePicker();
  PickedProfileImage? selected;
  bool busy = false;
  String? error;
  String get title => widget.kind == 'avatar' ? 'Ảnh đại diện' : 'Ảnh bìa';
  String? get current =>
      widget.profile[widget.kind == 'avatar' ? 'avatarUrl' : 'coverUrl']
          as String?;
  bool get currentSession => mounted && widget.api.isCurrent;

  Future<void> choose(ImageSource? source) async {
    if (busy || !widget.api.isCurrent) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final image = source == null
          ? await picker.recover(widget.kind)
          : await picker.pick(source, widget.kind);
      if (!currentSession) return;
      if (image != null) setState(() => selected = image);
      if (source == null && image == null) {
        setState(() => error = 'Không có ảnh đang chờ khôi phục.');
      }
    } on PlatformException {
      if (currentSession) {
        setState(
          () => error =
              'Chưa thể mở ảnh hoặc camera. Hãy kiểm tra quyền trong Cài đặt và thử lại.',
        );
      }
    } on FormatException catch (e) {
      if (currentSession) setState(() => error = e.message);
    } catch (_) {
      if (currentSession) {
        setState(() => error = 'Chưa thể chọn ảnh. Vui lòng thử lại.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save({bool remove = false}) async {
    if (busy || !widget.api.isCurrent || (!remove && selected == null)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final profile = remove
          ? await widget.api.clearMedia(widget.kind)
          : await widget.api.uploadMedia(
              widget.kind,
              selected!.bytes,
              selected!.contentType,
            );
      if (!mounted || !widget.api.isCurrent) return;
      Navigator.of(context).pop(profile);
    } catch (e) {
      if (currentSession) {
        setState(
          () => error = e is TimeoutException || e is http.ClientException
              ? 'Kết nối bị gián đoạn. Hãy tải lại hồ sơ để kiểm tra ảnh trước khi thử lại.'
              : userError(e),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (selected != null)
              AspectRatio(
                aspectRatio: widget.kind == 'avatar' ? 1 : 3,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Image.memory(
                    selected!.bytes,
                    fit: BoxFit.cover,
                    cacheWidth: 1024,
                    cacheHeight: widget.kind == 'avatar' ? 1024 : 342,
                    errorBuilder: (_, _, _) => const Center(
                      child: Text(
                        'Không thể xem trước ảnh. Hãy chọn ảnh khác.',
                      ),
                    ),
                  ),
                ),
              )
            else if (widget.kind == 'cover')
              UserCover(coverUrl: current)
            else
              Center(
                child: UserAvatar(
                  avatarUrl: current,
                  displayName: widget.profile['displayName'] as String?,
                  size: 128,
                ),
              ),
            const SizedBox(height: 20),
            Text(
              widget.kind == 'avatar'
                  ? 'JPEG, PNG hoặc WebP, tối đa 5 MB.'
                  : 'JPEG, PNG hoặc WebP, tối đa 10 MB. Ảnh được cắt theo tỷ lệ 3:1.',
            ),
            const Text(
              'Chọn ảnh để xem trước, sau đó bấm Lưu ảnh. Ảnh hồ sơ có thể được người khác xem và lưu lại.',
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              key: const Key('pick_gallery'),
              onPressed: busy ? null : () => choose(ImageSource.gallery),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Chọn từ thư viện'),
            ),
            OutlinedButton.icon(
              key: const Key('pick_camera'),
              onPressed: busy ? null : () => choose(ImageSource.camera),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Chụp ảnh'),
            ),
            TextButton(
              onPressed: busy ? null : () => choose(null),
              child: const Text('Khôi phục ảnh sau khi ứng dụng bị đóng'),
            ),
            if (selected != null)
              TextButton(
                onPressed: busy ? null : () => setState(() => selected = null),
                child: const Text('Hủy ảnh đã chọn'),
              ),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator(),
              ),
            FilledButton(
              key: const Key('save_media'),
              onPressed: busy || selected == null ? null : save,
              child: Text(busy ? 'Đang xử lý…' : 'Lưu ảnh'),
            ),
            if (current?.isNotEmpty == true)
              TextButton(
                key: const Key('remove_media'),
                onPressed: busy ? null : () => save(remove: true),
                child: const Text('Gỡ ảnh hiện tại'),
              ),
          ],
        ),
      ),
    ),
  );
}
