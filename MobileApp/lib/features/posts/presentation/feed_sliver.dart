import 'package:flutter/material.dart';
import '../application/feed_controller.dart';
import '../data/feed_api.dart';
import 'view_dwell.dart';

class FeedSliver extends StatelessWidget {
  const FeedSliver({super.key, required this.controller, required this.active});
  final FeedController controller;
  final bool active;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) => SliverMainAxisGroup(
      slivers: [
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.only(top: 8, bottom: 16),
            child: Text(
              'Khoảnh khắc gần đây',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
            ),
          ),
        ),
        SliverList.builder(
          itemCount: controller.items.length,
          itemBuilder: (context, index) {
            final post = controller.items[index];
            return _FeedCard(
              key: ValueKey(post.id),
              post: post,
              controller: controller,
              active: active,
            );
          },
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              children: [
                if (controller.loading)
                  const CircularProgressIndicator()
                else if (controller.error != null) ...[
                  Text(controller.error!, textAlign: TextAlign.center),
                  TextButton(
                    onPressed: controller.items.isEmpty
                        ? controller.refresh
                        : controller.loadMore,
                    child: const Text('Thử lại'),
                  ),
                ] else if (controller.items.isEmpty)
                  const Text(
                    'Chưa có khoảnh khắc nào.\nĐăng ảnh đầu tiên hoặc kết bạn để xem thêm.',
                    textAlign: TextAlign.center,
                  )
                else if (controller.hasMore)
                  OutlinedButton(
                    onPressed: controller.loadMore,
                    child: const Text('Xem thêm khoảnh khắc'),
                  )
                else
                  const Text(
                    'Bạn đã xem hết danh sách.',
                    style: TextStyle(color: Colors.black54),
                  ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class _FeedCard extends StatefulWidget {
  const _FeedCard({
    super.key,
    required this.post,
    required this.controller,
    required this.active,
  });
  final FeedPost post;
  final FeedController controller;
  final bool active;
  @override
  State<_FeedCard> createState() => _FeedCardState();
}

class _FeedCardState extends State<_FeedCard> {
  bool _loaded = false;
  int _retry = 0;
  void _imageReady(bool value) {
    if (_loaded == value) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _loaded != value) setState(() => _loaded = value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    String? url;
    try {
      if (post.mediaType == 0) {
        url = widget.controller.api.imageUri(post.mediaKey).toString();
      }
    } catch (_) {
      /* Metadata-only legacy posts may not have local media. */
    }
    final date = post.createdAt.toLocal();
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: const Color(0xFFFFE1D8),
                child: Icon(
                  post.mine ? Icons.person : Icons.people_outline,
                  color: const Color(0xFFB84B36),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.mine ? 'Bạn' : post.authorName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      '${date.day}/${date.month}/${date.year} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(
                        color: Colors.black54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.controller.isSeen(post))
                const Tooltip(
                  message: 'Đã xem',
                  child: Icon(Icons.done_all, size: 18, color: Colors.black45),
                ),
            ],
          ),
          const SizedBox(height: 12),
          ViewDwell(
            active: widget.active && !widget.controller.isSeen(post),
            ready: _loaded,
            onViewed: () => widget.controller.markSeen(post.id),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(30),
              child: AspectRatio(
                aspectRatio: 1,
                child: ColoredBox(
                  color: const Color(0xFFEDE9E4),
                  child: url == null
                      ? const Center(
                          child: Text('Ảnh này chưa có bản xem trước.'),
                        )
                      : Image.network(
                          url,
                          key: ValueKey('$url-$_retry'),
                          fit: BoxFit.cover,
                          frameBuilder: (context, child, frame, sync) {
                            _imageReady(sync || frame != null);
                            return child;
                          },
                          loadingBuilder: (context, child, progress) =>
                              progress == null
                              ? child
                              : const Center(
                                  child: CircularProgressIndicator(),
                                ),
                          errorBuilder: (context, error, stack) {
                            _imageReady(false);
                            return Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.broken_image_outlined,
                                    size: 34,
                                  ),
                                  const Text('Không tải được ảnh'),
                                  TextButton(
                                    onPressed: () async {
                                      await NetworkImage(url!).evict();
                                      if (mounted) setState(() => _retry++);
                                    },
                                    child: const Text('Tải lại ảnh'),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ),
            ),
          ),
          if (post.caption?.isNotEmpty ?? false)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
              child: Text(
                post.caption!,
                style: const TextStyle(fontSize: 15, height: 1.4),
              ),
            ),
        ],
      ),
    );
  }
}
