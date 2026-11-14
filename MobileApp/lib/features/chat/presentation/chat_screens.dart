import 'dart:async';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../domain/chat_models.dart';
import 'chat_controller.dart';
import 'chat_friends_controller.dart';

class ChatInboxScreen extends StatefulWidget {
  final ChatController controller;
  final bool ownsController;
  const ChatInboxScreen({
    super.key,
    required this.controller,
    this.ownsController = false,
  });
  @override
  State<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends State<ChatInboxScreen>
    with WidgetsBindingObserver {
  ChatController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    c.addListener(_changed);
    c.start();
    unawaited(c.loadInbox());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      c.setForeground(state == AppLifecycleState.resumed);
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(_changed);
    if (widget.ownsController) c.dispose();
    super.dispose();
  }

  Future<void> _open(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatDetailScreen(controller: c, conversationId: id),
      ),
    );
    if (mounted) unawaited(c.loadInbox());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Tin nhắn'),
      actions: [
        IconButton(
          tooltip: 'Trò chuyện mới',
          onPressed: c.expired
              ? null
              : () async {
                  final id = await Navigator.of(context).push<String>(
                    MaterialPageRoute(
                      builder: (_) => ChatFriendPickerScreen(controller: c),
                    ),
                  );
                  if (id != null && mounted) await _open(id);
                },
          icon: const Icon(Icons.edit_square),
        ),
      ],
    ),
    body: Column(
      children: [
        _ConnectionBanner(controller: c),
        if (c.inboxLoading) const LinearProgressIndicator(),
        if (c.error != null) _ErrorNotice(c.error!, () => c.loadInbox()),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => c.loadInbox(),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                if (c.conversations.isEmpty &&
                    !c.inboxLoading &&
                    c.error == null)
                  const _EmptyState(
                    icon: Icons.forum_outlined,
                    title: 'Bắt đầu một cuộc trò chuyện',
                    subtitle: 'Chọn một người bạn và gửi lời chào đầu tiên.',
                  ),
                ...c.conversations.map(
                  (row) => Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    elevation: 0,
                    color: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: const BorderSide(color: AppColors.border),
                    ),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      leading: _PeerAvatar(peer: row.peer),
                      title: Text(
                        row.peer?.displayName ?? 'Người dùng không khả dụng',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        row.canInteract
                            ? row.lastMessage?.text ??
                                  'Gửi lời chào đầu tiên 👋'
                            : 'Hiện không thể nhắn tin',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _clock(row.lastMessage?.createdAt ?? row.updatedAt),
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textMuted,
                            ),
                          ),
                          if (row.unreadCount > 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Badge(
                                label: Text(
                                  row.unreadCount > 99
                                      ? '99+'
                                      : '${row.unreadCount}',
                                ),
                              ),
                            ),
                        ],
                      ),
                      onTap: () => _open(row.id),
                    ),
                  ),
                ),
                if (c.nextCursor != null)
                  TextButton(
                    onPressed: c.inboxLoading
                        ? null
                        : () => c.loadInbox(more: true),
                    child: const Text('Xem thêm hội thoại'),
                  ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class ChatFriendPickerScreen extends StatefulWidget {
  final ChatController controller;
  const ChatFriendPickerScreen({super.key, required this.controller});
  @override
  State<ChatFriendPickerScreen> createState() => _ChatFriendPickerScreenState();
}

class _ChatFriendPickerScreenState extends State<ChatFriendPickerScreen> {
  final input = TextEditingController();
  late final ChatFriendsController friends = ChatFriendsController(
    widget.controller.api,
  );
  String? error, busy;
  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    friends.addListener(_changed);
    unawaited(friends.load());
  }

  @override
  void dispose() {
    friends.removeListener(_changed);
    friends.dispose();
    input.dispose();
    super.dispose();
  }

  Future<void> _choose(ChatPeer peer) async {
    if (busy != null) return;
    setState(() => busy = peer.id);
    final result = await widget.controller.openDirect(peer.id);
    if (!mounted) return;
    if (result != null) {
      Navigator.of(context).pop(result.id);
    } else {
      setState(() {
        busy = null;
        error = widget.controller.error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = input.text.trim().toLowerCase();
    final matches = friends.matching(query);
    return Scaffold(
      appBar: AppBar(title: const Text('Trò chuyện mới')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: input,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Tìm trong danh sách bạn bè',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          ),
          if (friends.loading) const LinearProgressIndicator(),
          if (error != null || friends.error != null)
            _ErrorNotice(error ?? friends.error!, () => friends.load()),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => friends.load(),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  if (!friends.loading && matches.isEmpty)
                    _EmptyState(
                      icon: Icons.people_outline,
                      title: query.isEmpty
                          ? 'Chưa có bạn bè'
                          : 'Chưa tìm thấy bạn',
                      subtitle: query.isEmpty
                          ? 'Kết bạn để bắt đầu trò chuyện riêng tư.'
                          : 'Thử tên khác hoặc tải thêm bạn bè.',
                    ),
                  ...matches.map(
                    (peer) => Card(
                      elevation: 0,
                      color: Colors.white,
                      child: ListTile(
                        leading: _PeerAvatar(peer: peer),
                        title: Text(
                          peer.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text('@${peer.username}'),
                        trailing: busy == peer.id
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(
                                Icons.chat_bubble_outline_rounded,
                                color: AppColors.primary,
                              ),
                        onTap: busy == null ? () => _choose(peer) : null,
                      ),
                    ),
                  ),
                  if (friends.hasMore)
                    TextButton(
                      onPressed: friends.loading
                          ? null
                          : () => friends.load(more: true),
                      child: const Text('Tải thêm bạn bè'),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ChatDetailScreen extends StatefulWidget {
  final ChatController controller;
  final String conversationId;
  const ChatDetailScreen({
    super.key,
    required this.controller,
    required this.conversationId,
  });
  @override
  State<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<ChatDetailScreen>
    with WidgetsBindingObserver {
  final input = TextEditingController();
  final scroll = ScrollController();
  ChatController get c => widget.controller;
  String get id => widget.conversationId;
  int count = 0;
  String? _lastMessageKey;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    input.text = c.draft(id);
    c.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(c.open(id));
    });
  }

  void _changed() {
    if (!mounted) return;
    final messages = c.messages(id);
    final next = messages.length;
    final tail = messages.isEmpty
        ? null
        : '${messages.last.message.senderId}/${messages.last.message.clientMessageId}';
    final newTail = tail != _lastMessageKey;
    final follow = !scroll.hasClients || scroll.offset < 100;
    final oldOffset = scroll.hasClients ? scroll.offset : 0.0;
    final oldExtent = scroll.hasClients ? scroll.position.maxScrollExtent : 0.0;
    setState(() {});
    if (next > count && newTail) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !scroll.hasClients) return;
        if (follow) {
          unawaited(
            scroll.animateTo(
              0,
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
            ),
          );
        } else {
          // The reversed list inserts new bubbles below the current viewport.
          // Compensate their height; loading older bubbles keeps the same offset.
          final delta = scroll.position.maxScrollExtent - oldExtent;
          scroll.jumpTo(
            (oldOffset + delta).clamp(0.0, scroll.position.maxScrollExtent),
          );
        }
      });
    }
    _lastMessageKey = tail;
    count = next;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      c.setForeground(state == AppLifecycleState.resumed);
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.setDraft(id, input.text);
    c.closeConversation(id);
    c.removeListener(_changed);
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = input.text;
    if (await c.sendText(text)) {
      if (mounted && input.text == text) {
        input.clear();
        c.setDraft(id, '');
      }
      if (mounted && scroll.hasClients) {
        unawaited(
          scroll.animateTo(
            0,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversation = c.conversation(id);
    final rows = c.messages(id);
    final enabled = conversation?.canInteract == true && !c.expired;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            _PeerAvatar(peer: conversation?.peer, radius: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                conversation?.peer?.displayName ?? 'Hội thoại',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          _ConnectionBanner(controller: c),
          if (c.opening(id)) const LinearProgressIndicator(),
          if (c.error != null) _ErrorNotice(c.error!, () => c.resync(id)),
          if (conversation != null && !conversation.canInteract)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'Hiện không thể tiếp tục hội thoại này.',
                textAlign: TextAlign.center,
              ),
            ),
          Expanded(
            child: rows.isEmpty && !c.opening(id)
                ? const _EmptyState(
                    icon: Icons.waving_hand_outlined,
                    title: 'Gửi một lời chào',
                    subtitle: 'Những câu chuyện nhỏ giúp mình gần nhau hơn.',
                  )
                : ListView.builder(
                    controller: scroll,
                    reverse: true,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    itemCount: rows.length + (c.hasOlder(id) ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == rows.length) {
                        return Center(
                          child: TextButton(
                            onPressed: c.loadingOlder(id)
                                ? null
                                : () => c.loadOlder(id),
                            child: Text(
                              c.loadingOlder(id)
                                  ? 'Đang tải…'
                                  : 'Tin nhắn trước đó',
                            ),
                          ),
                        );
                      }
                      final position = rows.length - 1 - index;
                      final bubble = rows[position];
                      final m = bubble.message;
                      final mine = m.senderId == c.accountId;
                      final day = _day(m.createdAt);
                      final showDay =
                          position == 0 ||
                          _day(rows[position - 1].message.createdAt) != day;
                      final read =
                          mine &&
                          bubble.status == ChatSendStatus.sent &&
                          m.sequence <=
                              (conversation?.peerLastReadSequence ??
                                  BigInt.zero);
                      return Column(
                        children: [
                          if (showDay)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              child: Text(
                                day,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ),
                          Align(
                            alignment: mine
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth:
                                    MediaQuery.sizeOf(context).width * .78,
                              ),
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 5),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 15,
                                  vertical: 11,
                                ),
                                decoration: BoxDecoration(
                                  color: mine
                                      ? AppColors.primary
                                      : Colors.white,
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(18),
                                    topRight: const Radius.circular(18),
                                    bottomLeft: Radius.circular(mine ? 18 : 4),
                                    bottomRight: Radius.circular(mine ? 4 : 18),
                                  ),
                                ),
                                child: Text(
                                  m.text,
                                  style: TextStyle(
                                    color: mine
                                        ? Colors.white
                                        : AppColors.textPrimary,
                                    fontSize: 15,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Align(
                            alignment: mine
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Padding(
                              padding: const EdgeInsets.only(
                                bottom: 10,
                                left: 4,
                                right: 4,
                              ),
                              child: bubble.status == ChatSendStatus.failed
                                  ? TextButton(
                                      onPressed: enabled
                                          ? () => c.retry(id, m.clientMessageId)
                                          : null,
                                      child: const Text(
                                        'Chưa xác nhận · Thử lại',
                                        style: TextStyle(fontSize: 11),
                                      ),
                                    )
                                  : Text(
                                      bubble.status == ChatSendStatus.pending
                                          ? 'Đang gửi…'
                                          : '${_clock(m.createdAt)}${mine ? ' · ${read ? 'Đã đọc' : 'Đã gửi'}' : ''}',
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: AppColors.textMuted,
                                      ),
                                    ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
          ),
          if (c.isTyping(id))
            const Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                child: Text(
                  'Đang nhập…',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
            ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('chat-composer'),
                      controller: input,
                      enabled: enabled,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (value) {
                        c.setDraft(id, value);
                        c.sendTyping(id, value.trim().isNotEmpty);
                        setState(() {});
                      },
                      decoration: const InputDecoration(
                        hintText: 'Viết tin nhắn…',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    key: const Key('chat-send'),
                    tooltip: 'Gửi tin nhắn',
                    onPressed: enabled && input.text.trim().isNotEmpty
                        ? _send
                        : null,
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PeerAvatar extends StatelessWidget {
  final ChatPeer? peer;
  final double radius;
  const _PeerAvatar({required this.peer, this.radius = 24});
  @override
  Widget build(BuildContext context) => CircleAvatar(
    radius: radius,
    backgroundColor: AppColors.coralLight,
    child: peer?.avatarUrl == null
        ? const Icon(Icons.person_outline_rounded, color: AppColors.primary)
        : ClipOval(
            child: Image.network(
              peer!.avatarUrl!,
              width: radius * 2,
              height: radius * 2,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stack) => const Icon(
                Icons.person_outline_rounded,
                color: AppColors.primary,
              ),
            ),
          ),
  );
}

class _ConnectionBanner extends StatelessWidget {
  final ChatController controller;
  const _ConnectionBanner({required this.controller});
  @override
  Widget build(BuildContext context) => controller.connected
      ? const SizedBox.shrink()
      : Container(
          width: double.infinity,
          color: AppColors.coralLight,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Row(
            children: [
              const Icon(
                Icons.wifi_off_rounded,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  controller.expired
                      ? 'Phiên chat đã kết thúc. Hãy đăng nhập lại.'
                      : 'Đang kết nối lại · bản nháp vẫn được giữ',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
        );
}

class _ErrorNotice extends StatelessWidget {
  final String text;
  final VoidCallback retry;
  const _ErrorNotice(this.text, this.retry);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: AppColors.error, fontSize: 12),
          ),
        ),
        TextButton(onPressed: retry, child: const Text('Tải lại')),
      ],
    ),
  );
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 60),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: AppColors.coralLight,
          child: Icon(icon, size: 36, color: AppColors.primary),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.textSecondary, height: 1.5),
        ),
      ],
    ),
  );
}

String _clock(DateTime value) {
  final local = value.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

String _day(DateTime value) {
  final local = value.toLocal();
  return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
}
