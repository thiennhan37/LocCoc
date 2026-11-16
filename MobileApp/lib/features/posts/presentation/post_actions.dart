import 'dart:async';
import 'package:flutter/material.dart';
import '../data/feed_api.dart';
import '../data/post_reaction_api.dart';

class PostActions extends StatefulWidget {
  const PostActions({
    super.key,
    required this.post,
    required this.reactions,
    required this.active,
    this.onMessage,
  });
  final FeedPost post;
  final PostReactionsRepository reactions;
  final bool active;
  final Future<void> Function(FeedPost)? onMessage;
  @override
  State<PostActions> createState() => _PostActionsState();
}

class _PostActionsState extends State<PostActions> {
  ReactionSummary? _summary;
  bool _loading = false, _busy = false, _failed = false, _choosing = false;
  @override
  void initState() {
    super.initState();
    if (widget.active) unawaited(_load());
  }

  @override
  void didUpdateWidget(PostActions old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading || _busy || _choosing) return;
    setState(() => _loading = true);
    try {
      final data = await widget.reactions.load(widget.post.id);
      if (mounted) {
        setState(() {
          _summary = data;
          _failed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _react(String emoji) async {
    if (_busy || _loading || _summary == null || !widget.active) return;
    setState(() => _busy = true);
    try {
      final result = await widget.reactions.set(
        widget.post.id,
        _summary!.myReaction == emoji ? null : emoji,
      );
      if (mounted) {
        setState(() {
          _summary = result;
          _failed = false;
        });
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Chưa lưu được cảm xúc. Bạn hãy thử lại.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _message() async {
    if (_busy ||
        widget.post.mine ||
        !widget.active ||
        widget.onMessage == null) {
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.onMessage!(widget.post);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _more() async {
    _choosing = true;
    final emoji = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              for (final emoji in postReactionEmoji)
                TextButton(
                  onPressed: () => Navigator.pop(context, emoji),
                  child: Text(
                    '$emoji ${_summary?.counts[emoji] ?? 0}',
                    style: const TextStyle(fontSize: 24),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    // Home becomes inactive while the sheet covers it. Wait for its route
    // visibility to rebuild, without starting a competing summary reload.
    await WidgetsBinding.instance.endOfFrame;
    _choosing = false;
    if (mounted && emoji != null) await _react(emoji);
  }

  @override
  Widget build(BuildContext context) {
    final enabled =
        widget.active && !_busy && !_loading && !_failed && _summary != null;
    return Container(
      key: ValueKey('post-actions-${widget.post.id}'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        children: [
          Expanded(
            child: widget.post.mine
                ? const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: Text(
                      'Cảm xúc',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  )
                : TextButton(
                    key: const ValueKey('message-author'),
                    onPressed:
                        widget.active && !_busy && widget.onMessage != null
                        ? _message
                        : null,
                    child: const Text(
                      'Gửi tin nhắn…',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
          ),
          for (final emoji in postReactionEmoji.take(3))
            Semantics(
              selected: _summary?.myReaction == emoji,
              child: IconButton(
                key: ValueKey('reaction-$emoji'),
                tooltip: 'Cảm xúc $emoji',
                padding: const EdgeInsets.all(4),
                constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
                style: IconButton.styleFrom(
                  backgroundColor: _summary?.myReaction == emoji
                      ? Colors.white24
                      : Colors.transparent,
                ),
                onPressed: enabled ? () => _react(emoji) : null,
                icon: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: FittedBox(
                        child: Text(
                          emoji,
                          style: const TextStyle(fontSize: 24),
                        ),
                      ),
                    ),
                    SizedBox(
                      height: 14,
                      child: FittedBox(
                        child: Text(
                          _summary == null
                              ? '—'
                              : '${_summary!.counts[emoji] ?? 0}',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_loading || _busy)
            const SizedBox(
              width: 40,
              height: 24,
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else
            IconButton(
              tooltip: _failed ? 'Tải lại cảm xúc' : 'Thêm cảm xúc',
              onPressed: _failed
                  ? _load
                  : enabled
                  ? _more
                  : null,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
              padding: const EdgeInsets.all(4),
              icon: _failed
                  ? const Icon(Icons.refresh)
                  : _summary?.myReaction != null &&
                        !postReactionEmoji
                            .take(3)
                            .contains(_summary!.myReaction)
                  ? Text(
                      _summary!.myReaction!,
                      style: const TextStyle(fontSize: 24),
                    )
                  : const Icon(Icons.add_reaction_outlined),
            ),
        ],
      ),
    );
  }
}
