import 'package:flutter/material.dart';
import '../../application/memories_controller.dart';
import '../../../posts/data/feed_api.dart';

class MemoriesCalendar extends StatelessWidget {
  const MemoriesCalendar({
    super.key,
    required this.controller,
    this.now,
    this.imageBuilder,
    this.enabled = true,
  });
  final MemoriesController controller;
  final DateTime? now;
  final Widget Function(FeedPost)? imageBuilder;
  final bool enabled;
  static const _gold = Color(0xFFFFC94A);

  Widget _image(FeedPost post) {
    if (imageBuilder != null) return imageBuilder!(post);
    try {
      return Image.network(
        controller.api.imageUri(post.mediaKey).toString(),
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const Center(
          child: Icon(Icons.broken_image_outlined, color: Colors.white54),
        ),
        loadingBuilder: (_, child, progress) => progress == null
            ? child
            : const Center(
                child: Icon(Icons.photo_outlined, color: Colors.white38),
              ),
      );
    } on FormatException {
      return const Center(
        child: Icon(Icons.image_not_supported_outlined, color: Colors.white54),
      );
    }
  }

  void _openDay(BuildContext context, DateTime day, List<FeedPost> posts) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: const Color(0xFF191919),
      builder: (_) => FractionallySizedBox(
        heightFactor: .85,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                '${day.day}/${day.month}/${day.year} · ${posts.length} bài đăng',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: posts.length,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                itemBuilder: (_, index) {
                  final post = posts[index];
                  final time = post.createdAt.toLocal();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(24),
                          child: AspectRatio(
                            aspectRatio: 1,
                            child: _image(post),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                          style: const TextStyle(color: Colors.white54),
                        ),
                        if (post.caption?.isNotEmpty == true)
                          Text(
                            post.caption!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.black,
    child: AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final date = (now ?? DateTime.now()).toLocal();
        final today = DateTime(date.year, date.month, date.day);
        final days = controller.days;
        final oldest = days.keys.fold(today, (a, b) => a.isBefore(b) ? a : b);
        final months =
            (today.year - oldest.year) * 12 + today.month - oldest.month + 1;
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Text(
                    'Kỷ niệm',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: enabled ? controller.refresh : () async {},
                    child: ListView.builder(
                      key: const PageStorageKey('memories-calendar'),
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      itemCount: months + 1,
                      itemBuilder: (context, index) {
                        if (index == 0) {
                          return Column(
                            children: [
                              if (controller.loading)
                                const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: LinearProgressIndicator(color: _gold),
                                ),
                              if (controller.error != null) ...[
                                Text(
                                  controller.error!,
                                  style: const TextStyle(color: Colors.white70),
                                ),
                                TextButton(
                                  onPressed: controller.loading
                                      ? null
                                      : controller.refresh,
                                  child: const Text('Thử lại'),
                                ),
                              ],
                              if (!controller.loading &&
                                  controller.error == null &&
                                  days.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 20),
                                  child: Text(
                                    enabled
                                        ? 'Chưa có kỷ niệm. Hãy đăng khoảnh khắc đầu tiên!'
                                        : 'Đăng nhập để xem kỷ niệm của bạn.',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.white60,
                                    ),
                                  ),
                                ),
                            ],
                          );
                        }
                        final month = DateTime(
                          today.year,
                          today.month - index + 1,
                        );
                        return _month(context, month, today, days);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );

  Widget _month(
    BuildContext context,
    DateTime month,
    DateTime today,
    Map<DateTime, List<FeedPost>> days,
  ) {
    final offset = month.weekday - 1;
    final count = DateTime(month.year, month.month + 1, 0).day;
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF121212),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: const Color(0xFF242424),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Text(
              'Tháng ${month.month} ${month.year}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 16, 12, 6),
            child: Row(
              children: [
                for (final label in ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
                  Expanded(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 11,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.all(12),
            itemCount: ((offset + count) / 7).ceil() * 7,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              crossAxisSpacing: 5,
              mainAxisSpacing: 8,
            ),
            itemBuilder: (context, index) {
              final dayNumber = index - offset + 1;
              if (dayNumber < 1 || dayNumber > count) {
                return const SizedBox.shrink();
              }
              final day = DateTime(month.year, month.month, dayNumber);
              final posts = days[day] ?? const <FeedPost>[];
              final isToday = day == today;
              return Semantics(
                button: posts.isNotEmpty,
                label:
                    '$dayNumber/${month.month}/${month.year}, ${posts.length} bài đăng${isToday ? ', hôm nay' : ''}',
                child: Tooltip(
                  message: '$dayNumber/${month.month}/${month.year}',
                  child: GestureDetector(
                    onTap: posts.isEmpty
                        ? null
                        : () => _openDay(context, day, posts),
                    child: Container(
                      decoration: BoxDecoration(
                        color: posts.isNotEmpty || day.isAfter(today)
                            ? const Color(0xFF292929)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(13),
                        border: isToday
                            ? Border.all(color: _gold, width: 3)
                            : null,
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: posts.isNotEmpty
                          ? _image(posts.first)
                          : Center(
                              child: Container(
                                width: 11,
                                height: 11,
                                decoration: BoxDecoration(
                                  color: isToday
                                      ? _gold
                                      : const Color(0xFF2D2D2D),
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
