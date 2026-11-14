import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../data/user_api_client.dart';
import 'profile_link_session.dart';

class ProfileShareCard extends StatefulWidget {
  final UserApiClient api;
  final VoidCallback onSearch;
  final Map<String, dynamic>? profile;
  final bool showCard;
  const ProfileShareCard({
    super.key,
    required this.api,
    required this.onSearch,
    this.profile,
    this.showCard = true,
  });
  @override
  State<ProfileShareCard> createState() => _ProfileShareCardState();
}

class _ProfileShareCardState extends State<ProfileShareCard> {
  late final Future<Map<String, dynamic>> profile = widget.profile == null
      ? widget.api.me()
      : Future.value(widget.profile);
  bool copying = false;
  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: EdgeInsets.all(widget.showCard ? 20 : 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FilledButton.icon(
            onPressed: widget.onSearch,
            icon: const Icon(Icons.search),
            label: const Text('Tìm bạn'),
          ),
          const SizedBox(height: 16),
          FutureBuilder<Map<String, dynamic>>(
            future: profile,
            builder: (context, snapshot) {
              final username = snapshot.data?['username'];
              if (username is! String ||
                  !RegExp(r'^[a-z0-9_]{2,30}$').hasMatch(username)) {
                return Text(
                  snapshot.hasError
                      ? 'Chưa tải được liên kết cá nhân. Hãy mở lại mục gợi ý.'
                      : snapshot.connectionState == ConnectionState.done
                      ? 'Hãy hoàn tất username để chia sẻ hồ sơ.'
                      : 'Đang tải liên kết cá nhân…',
                  textAlign: TextAlign.center,
                );
              }
              final link = Uri.https(appLinkHost, '/$username').toString();
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final qrSize = constraints.maxWidth.isFinite
                          ? math.max(0.0, math.min(180.0, constraints.maxWidth))
                          : 180.0;
                      return QrImageView(
                        data: link,
                        size: qrSize,
                        backgroundColor: Colors.white,
                        semanticsLabel: 'Mã QR liên kết cá nhân',
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  SelectableText(link, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      TextButton.icon(
                        icon: const Icon(Icons.copy),
                        label: const Text('Sao chép liên kết'),
                        onPressed: copying
                            ? null
                            : () async {
                                setState(() => copying = true);
                                try {
                                  await Clipboard.setData(
                                    ClipboardData(text: link),
                                  );
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Đã sao chép liên kết.'),
                                      ),
                                    );
                                  }
                                } catch (_) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Chưa thể sao chép liên kết. Vui lòng thử lại.',
                                        ),
                                      ),
                                    );
                                  }
                                } finally {
                                  if (mounted) setState(() => copying = false);
                                }
                              },
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.share),
                        label: const Text('Chia sẻ'),
                        onPressed: () async {
                          final box = context.findRenderObject() as RenderBox?;
                          try {
                            await SharePlus.instance.share(
                              ShareParams(
                                text: link,
                                sharePositionOrigin: box == null
                                    ? null
                                    : box.localToGlobal(Offset.zero) & box.size,
                              ),
                            );
                          } catch (_) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Chưa thể chia sẻ. Bạn có thể sao chép liên kết.',
                                  ),
                                ),
                              );
                            }
                          }
                        },
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
    return widget.showCard ? Card(child: content) : content;
  }
}
