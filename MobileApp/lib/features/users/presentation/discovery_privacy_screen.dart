import 'package:flutter/material.dart';
import '../data/user_api_client.dart';

class DiscoveryPrivacyScreen extends StatefulWidget {
  final UserApiClient api;
  const DiscoveryPrivacyScreen({super.key, required this.api});
  @override
  State<DiscoveryPrivacyScreen> createState() => _DiscoveryPrivacyScreenState();
}

class _DiscoveryPrivacyScreenState extends State<DiscoveryPrivacyScreen> {
  Map<String, dynamic>? privacy;
  String? error;
  bool saving = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final value = await widget.api.request('GET', 'me/privacy');
      if (mounted) {
        setState(() {
          privacy = value;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = userError(e));
    }
  }

  Future<void> save(String field, bool value) async {
    if (saving) return;
    setState(() => saving = true);
    try {
      final result = await widget.api.request(
        'PATCH',
        'me/privacy',
        body: {field: value},
      );
      if (mounted) {
        setState(() {
          privacy = result;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = userError(e));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Quyền riêng tư kết bạn')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (privacy == null && error == null) const LinearProgressIndicator(),
        if (privacy != null) ...[
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text(
              'Kiểm soát cách bạn xuất hiện trong danh sách gợi ý và mục bạn chung trên LocCoc.',
            ),
          ),
          Card(
            child: SwitchListTile(
              key: const Key('privacy_recommendable'),
              title: const Text('Xuất hiện trong gợi ý'),
              subtitle: const Text(
                'Khi tắt, người khác vẫn có thể tìm bạn bằng tên hoặc username.',
              ),
              value: privacy!['recommendable'] == true,
              onChanged: saving ? null : (v) => save('recommendable', v),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: SwitchListTile(
              key: const Key('privacy_mutual'),
              title: const Text('Hiển thị bạn chung'),
              subtitle: const Text(
                'Khi tắt, ẩn mục bạn chung của bạn và không dùng bạn làm cầu nối cho các gợi ý mới. Bạn vẫn xem được bạn chung được phép hiển thị trên hồ sơ khác.',
              ),
              value: privacy!['mutualVisibility'] == true,
              onChanged: saving ? null : (v) => save('mutualVisibility', v),
            ),
          ),
        ],
        if (saving) const LinearProgressIndicator(),
        if (error != null) ...[
          Text(error!),
          TextButton(
            onPressed: saving ? null : load,
            child: const Text('Thử lại'),
          ),
        ],
      ],
    ),
  );
}
