import 'package:flutter/material.dart';
import '../application/gallery_controller.dart';
import '../data/feed_api.dart';

class PhotoGalleryScreen extends StatelessWidget {
  const PhotoGalleryScreen({
    super.key,
    required this.controller,
    this.imageBuilder,
  });
  final GalleryController controller;
  final Widget Function(FeedPost)? imageBuilder;

  Widget _image(FeedPost post, {bool full = false}) {
    if (imageBuilder != null) return imageBuilder!(post);
    try {
      return Image.network(
        controller.api.imageUri(post.mediaKey).toString(),
        fit: full ? BoxFit.contain : BoxFit.cover,
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

  void _open(BuildContext context, FeedPost post) {
    final date = post.createdAt.toLocal();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: Text(
              post.ownerId == controller.ownerId ? 'Bạn' : post.authorName,
            ),
          ),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: InteractiveViewer(
                    child: Center(child: _image(post, full: true)),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      if (post.caption?.isNotEmpty == true)
                        Text(
                          post.caption!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                          ),
                        ),
                      const SizedBox(height: 8),
                      Text(
                        '${date.day}/${date.month}/${date.year}',
                        style: const TextStyle(color: Colors.white54),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final posts = controller.items;
      return Scaffold(
        backgroundColor: const Color(0xFF242424),
        appBar: AppBar(
          backgroundColor: const Color(0xFF242424),
          foregroundColor: Colors.white,
          title: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF363636),
              borderRadius: BorderRadius.circular(30),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<GalleryFilter>(
                value: controller.filter,
                dropdownColor: const Color(0xFF363636),
                icon: const Icon(Icons.expand_more, color: Colors.white),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
                items: const [
                  DropdownMenuItem(
                    value: GalleryFilter.all,
                    child: Text('Tất cả'),
                  ),
                  DropdownMenuItem(
                    value: GalleryFilter.friends,
                    child: Text('Bạn bè'),
                  ),
                  DropdownMenuItem(
                    value: GalleryFilter.mine,
                    child: Text('Của tôi'),
                  ),
                ],
                onChanged: (value) {
                  if (value != null) controller.filter = value;
                },
              ),
            ),
          ),
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              if (controller.loading)
                const LinearProgressIndicator(color: Color(0xFFFFC94A)),
              if (controller.error != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
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
                  ),
                ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: controller.refresh,
                  child: posts.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                vertical: 80,
                                horizontal: 24,
                              ),
                              child: Text(
                                controller.loading
                                    ? 'Đang tải ảnh…'
                                    : controller.error != null
                                    ? 'Kéo xuống để tải lại.'
                                    : 'Chưa có ảnh trong mục này.',
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.white70),
                              ),
                            ),
                          ],
                        )
                      : GridView.builder(
                          key: const PageStorageKey('photo-gallery-grid'),
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(4, 20, 4, 16),
                          itemCount: posts.length,
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                crossAxisSpacing: 4,
                                mainAxisSpacing: 4,
                              ),
                          itemBuilder: (context, index) {
                            final post = posts[index];
                            return Semantics(
                              button: true,
                              label: 'Xem ảnh của ${post.authorName}',
                              child: InkWell(
                                key: ValueKey('gallery-${post.id}'),
                                onTap: () => _open(context, post),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(20),
                                  child: _image(post),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
