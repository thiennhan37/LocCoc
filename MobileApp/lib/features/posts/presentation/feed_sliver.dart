import 'dart:typed_data';
import 'dart:math' as math;
import '../data/post_reaction_api.dart';
import 'post_actions.dart';
import 'package:flutter/material.dart';
import '../application/feed_controller.dart';
import '../data/feed_api.dart';
import 'view_dwell.dart';

class FeedSliver extends StatelessWidget {
  const FeedSliver({super.key, required this.controller, required this.active});
  final FeedController controller;
  final bool active;
  @override
  Widget build(BuildContext context) => SliverFillRemaining(
    hasScrollBody: true,
    child: FeedPages(controller: controller, active: active),
  );
}

/// A single pager keeps camera-to-feed gestures and post pagination consistent.
class FeedPages extends StatelessWidget {
  const FeedPages({
    super.key,
    required this.controller,
    required this.active,
    this.leading,
    this.pageController,
    this.onPageChanged,
    this.selectedPage,
    this.reactions,
    this.onMessage,
    this.postHeader,
  });
  final FeedController controller;
  final bool active;
  final Widget? leading;
  final PageController? pageController;
  final ValueChanged<int>? onPageChanged;
  final int? selectedPage;
  final PostReactionsRepository? reactions;
  final Future<void> Function(FeedPost)? onMessage;
  final Widget? postHeader;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final offset = leading == null ? 0 : 1;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (leading == null)
            const Padding(
              padding: EdgeInsets.only(top: 8, bottom: 16),
              child: Text(
                'Khoảnh khắc gần đây',
                style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
              ),
            ),
          Expanded(
            child: PageView.builder(
              key: const ValueKey('feed-pager'),
              controller: pageController,
              scrollDirection: Axis.vertical,
              itemCount: controller.items.length + 1 + offset,
              onPageChanged: (page) {
                onPageChanged?.call(page);
                final index = page - offset;
                controller.prepareImages(index);
                if (index >= 0 &&
                    index >= controller.items.length - 4 &&
                    controller.hasMore &&
                    controller.error == null) {
                  controller.loadMore();
                }
              },
              itemBuilder: (context, page) {
                if (leading != null && page == 0) return leading!;
                final index = page - offset;
                if (index == controller.items.length) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (controller.loading)
                            const CircularProgressIndicator()
                          else if (controller.error != null) ...[
                            Text(
                              controller.error!,
                              textAlign: TextAlign.center,
                            ),
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
                            Text(
                              'Bạn đã xem hết danh sách.',
                              style: TextStyle(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                }
                final post = controller.items[index];
                final card = _FeedCard(
                  key: ValueKey(post.id),
                  post: post,
                  controller: controller,
                  active:
                      active && (selectedPage == null || selectedPage == page),
                  reactions: reactions,
                  onMessage: onMessage,
                  header: postHeader,
                );
                return leading == null
                    ? card
                    : Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                        child: card,
                      );
              },
            ),
          ),
        ],
      );
    },
  );
}

class _FeedCard extends StatefulWidget {
  const _FeedCard({
    super.key,
    required this.post,
    required this.controller,
    required this.active,
    this.reactions,
    this.onMessage,
    this.header,
  });
  final FeedPost post;
  final PostReactionsRepository? reactions;
  final Future<void> Function(FeedPost)? onMessage;
  final Widget? header;
  final FeedController controller;
  final bool active;
  @override
  State<_FeedCard> createState() => _FeedCardState();
}

class _FeedCardState extends State<_FeedCard> {
  bool _loaded = false;
  int _retry = 0;
  Future<Uint8List>? _protectedImage;
  @override
  void didUpdateWidget(covariant _FeedCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller.api != widget.controller.api ||
        oldWidget.post.id != widget.post.id) {
      _protectedImage = null;
      _loaded = false;
    }
  }

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
    return Column(
      children: [
        if (widget.header != null)
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: widget.header,
              ),
            ),
          ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final metadataHeight = math.max(
                36.0,
                MediaQuery.textScalerOf(context).scale(16) * 1.4,
              );
              final actionsHeight = widget.reactions == null
                  ? 0.0
                  : math.max(
                      64.0,
                      MediaQuery.textScalerOf(context).scale(14) + 24,
                    );
              final reserved =
                  metadataHeight +
                  16 +
                  (actionsHeight > 0 ? actionsHeight + 24 : 0) +
                  16;
              final width = math.min(constraints.maxWidth, 480.0);
              final imageSize = math.min(
                width,
                math.max(0.0, constraints.maxHeight - reserved),
              );
              return Center(
                child: SizedBox(
                  width: width,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: imageSize,
                        height: imageSize,
                        child: ViewDwell(
                          active:
                              widget.active && !widget.controller.isSeen(post),
                          ready: _loaded,
                          onViewed: () => widget.controller.markSeen(post.id),
                          child: ClipRRect(
                            key: ValueKey('post-photo-${post.id}'),
                            borderRadius: BorderRadius.circular(40),
                            child: ColoredBox(
                              color: Theme.of(
                                context,
                              ).colorScheme.surfaceContainerHighest,
                              child: url == null
                                  ? const Center(
                                      child: Text(
                                        'Ảnh này chưa có bản xem trước.',
                                        textAlign: TextAlign.center,
                                      ),
                                    )
                                  : widget.controller.api is ProtectedFeedImages
                                  ? FutureBuilder<Uint8List>(
                                      future: _protectedImage ??=
                                          (widget.controller.api
                                                  as ProtectedFeedImages)
                                              .image(post.mediaKey),
                                      builder: (context, snapshot) {
                                        if (snapshot.hasData) {
                                          return Image.memory(
                                            snapshot.data!,
                                            fit: BoxFit.cover,
                                            errorBuilder:
                                                (context, error, stack) {
                                                  _imageReady(false);
                                                  return const Center(
                                                    child: Text(
                                                      'Không tải được ảnh',
                                                    ),
                                                  );
                                                },
                                            frameBuilder:
                                                (context, child, frame, sync) {
                                                  _imageReady(
                                                    sync || frame != null,
                                                  );
                                                  return child;
                                                },
                                          );
                                        }
                                        _imageReady(false);
                                        if (snapshot.hasError) {
                                          return Center(
                                            child: TextButton(
                                              onPressed: () => setState(
                                                () => _protectedImage = null,
                                              ),
                                              child: const Text('Tải lại ảnh'),
                                            ),
                                          );
                                        }
                                        return const Center(
                                          child: CircularProgressIndicator(),
                                        );
                                      },
                                    )
                                  : Image.network(
                                      url,
                                      key: ValueKey('$url-$_retry'),
                                      fit: BoxFit.cover,
                                      frameBuilder:
                                          (context, child, frame, sync) {
                                            _imageReady(sync || frame != null);
                                            return child;
                                          },
                                      loadingBuilder:
                                          (
                                            context,
                                            child,
                                            progress,
                                          ) => progress == null
                                          ? child
                                          : const Center(
                                              child:
                                                  CircularProgressIndicator(),
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
                                                  await NetworkImage(
                                                    url!,
                                                  ).evict();
                                                  if (mounted) {
                                                    setState(() => _retry++);
                                                  }
                                                },
                                                child: const Text(
                                                  'Tải lại ảnh',
                                                ),
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
                      const SizedBox(height: 16),
                      SizedBox(
                        height: metadataHeight,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const CircleAvatar(
                              radius: 16,
                              backgroundColor: Color(0xFF303033),
                              child: Icon(
                                Icons.person_outline,
                                color: Colors.white70,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                post.mine ? 'Bạn' : post.authorName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Tooltip(
                              message: post.occurredAt.toLocal().toString(),
                              child: Text(
                                _age(post.occurredAt),
                                style: TextStyle(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            if (widget.controller.isSeen(post))
                              const Padding(
                                padding: EdgeInsets.only(left: 6),
                                child: Tooltip(
                                  message: 'Đã xem',
                                  child: Icon(
                                    Icons.done_all,
                                    size: 16,
                                    color: Colors.grey,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (widget.reactions != null) ...[
                        const SizedBox(height: 24),
                        SizedBox(
                          height: actionsHeight,
                          child: PostActions(
                            post: post,
                            reactions: widget.reactions!,
                            active: widget.active,
                            onMessage: widget.onMessage,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _age(DateTime created) {
    final age = DateTime.now().difference(created);
    if (age.inDays > 0) return '${age.inDays} ngày';
    if (age.inHours > 0) return '${age.inHours} giờ';
    if (age.inMinutes > 0) return '${age.inMinutes} phút';
    return 'Vừa xong';
  }
}
