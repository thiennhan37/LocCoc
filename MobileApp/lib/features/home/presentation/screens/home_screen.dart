import '../../../posts/data/author_feed_api.dart';
import '../widgets/author_picker.dart';
import '../../../posts/application/gallery_controller.dart';
import '../../../posts/presentation/photo_gallery_screen.dart';
import '../../application/memories_controller.dart';
import '../widgets/memories_calendar.dart';
import '../../../chat/domain/chat_models.dart';
import '../../../posts/data/post_reaction_api.dart';
import '../../application/camera_session.dart';
import '../../../posts/application/feed_controller.dart';
import '../../../posts/data/feed_api.dart';
import '../../../posts/presentation/feed_sliver.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../../core/widgets/user_cover.dart';
import '../../../../core/widgets/full_screen_image_viewer.dart';
import '../../../users/presentation/avatar_url_screen.dart';
import '../../../debug/developer_tools.dart';
import '../../../debug/presentation/debug_screen.dart';
import '../widgets/home_navigation.dart';
import 'package:flutter/services.dart';
import '../../../auth/presentation/widgets/session_boundary.dart';
import 'capture_moment_screen.dart';
import '../../../posts/presentation/photo_editor_screen.dart';
import 'dart:async';
import '../../../chat/data/chat_api.dart';
import '../../../chat/data/chat_socket_client.dart';
import '../../../chat/presentation/chat_controller.dart';
import '../../../chat/presentation/chat_screens.dart';
import '../../../notifications/data/notification_api.dart';
import '../../../notifications/data/push_notifications.dart';
import '../../../notifications/presentation/notifications_screen.dart';
import 'package:flutter/material.dart';
import '../../../users/presentation/profile_share_card.dart';
import '../../../users/presentation/profile_link_session.dart';

import '../widgets/home_theme.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../auth/data/services/auth_api_client.dart';
import '../../../auth/data/services/google_sign_in_service.dart';
import '../../../auth/domain/models/auth_session.dart';
import '../../../auth/presentation/screens/auth_screen.dart';
import '../../../auth/presentation/widgets/logout_session_dialog.dart';
import '../../../users/data/user_api_client.dart';
import '../../../users/presentation/friends_screen.dart';
import '../../../users/presentation/edit_profile_screen.dart';
import '../../../settings/presentation/settings_privacy_screen.dart';
import '../../../moments/data/moment_api.dart';
import '../../../moments/presentation/moments_screen.dart';

class HomeScreen extends StatefulWidget {
  final CameraSession? camera;
  final ChatController Function()? chatControllerFactory;
  final AuthSession session;
  final GoogleAuthService? googleAuthService;
  final Map<String, dynamic>? profile;
  final UserApiClient? userApi;
  final int initialTab;
  final HomeTab? initialDestination;

  const HomeScreen({
    super.key,
    required this.session,
    this.camera,
    this.chatControllerFactory,
    this.googleAuthService,
    this.profile,
    this.userApi,
    this.initialTab = 0,
    this.initialDestination,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  late final FeedController _feed = FeedController(
    AuthorFeedApi(SessionFeedApi(_effectiveUserApi), () => _selectedAuthor.id),
  );
  late final PostReactionApi _reactions = PostReactionApi(_effectiveUserApi);
  late final MemoriesController _calendar = MemoriesController(
    SessionFeedApi(_effectiveUserApi),
    session.user.id,
  );
  final PageController _homePages = PageController();
  int _homePage = 0;
  AuthorChoice _selectedAuthor = const AuthorChoice(null, 'Tất cả bạn bè');
  bool _authorMenuOpen = false;

  List<Map<String, dynamic>> _memories = [];
  bool _memoriesLoading = false;
  bool _memoriesLoadingMore = false;
  bool _memoriesLoaded = false;
  String? _memoriesCursor;
  String? _memoriesError;
  String? _memoriesMoreError;
  int _memoriesRevision = 0;
  final Map<String, Future<Uint8List>> _memoryImages = {};

  Future<void> _refreshHome() async {
    await Future.wait([
      _refreshSocialSummary(),
      if (_realSession) _feed.refresh(),
      if (_realSession) _loadMemories(),
    ]);
  }

  Future<void> _loadMemories({bool more = false}) async {
    if (!mounted || !_realSession || _isLoggingOut || _isDeletingAccount) {
      return;
    }
    if (more &&
        (_memoriesLoading || _memoriesLoadingMore || _memoriesCursor == null)) {
      return;
    }
    final cursor = more ? _memoriesCursor : null;
    final revision = ++_memoriesRevision;
    setState(() {
      _memoriesLoading = !more;
      _memoriesLoadingMore = more;
      _memoriesError = null;
      _memoriesMoreError = null;
    });
    try {
      final api = MomentApi(_effectiveUserApi);
      final res = await api.list(cursor: cursor);
      if (!mounted || revision != _memoriesRevision) return;
      final rawItems = res['items'];
      if (rawItems is! List) throw const FormatException('Invalid memories');
      final items = rawItems
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      final nextCursor = res['nextCursor'] as String?;
      setState(() {
        _memories = more
            ? {
                for (final item in [..._memories, ...items]) item['id']: item,
              }.values.toList()
            : items;
        _memoriesCursor = nextCursor;
        _memoriesLoaded = true;
        _memoriesLoading = false;
        _memoriesLoadingMore = false;
        _memoriesError = null;
      });
    } catch (e) {
      if (!mounted || revision != _memoriesRevision) return;
      setState(() {
        _memoriesLoaded = true;
        _memoriesLoading = false;
        _memoriesLoadingMore = false;
        if (more) {
          _memoriesMoreError = 'Chưa thể tải thêm kỷ niệm. Hãy thử lại.';
        } else {
          _memoriesError = 'Chưa thể tải kỷ niệm. Hãy thử lại.';
        }
      });
    }
  }

  Future<Uint8List> _getMemoryImage(String id) {
    return _memoryImages.putIfAbsent(
      id,
      () => _effectiveUserApi.momentImage(id),
    );
  }

  void _retryMemoryImage(String id) {
    setState(() {
      _memoryImages.remove(id);
    });
  }

  String _formatMemoryDate(dynamic rawDate) {
    if (rawDate == null) return 'Hôm nay';
    DateTime? dt;
    if (rawDate is DateTime) {
      dt = rawDate.toLocal();
    } else if (rawDate is String) {
      dt = DateTime.tryParse(rawDate)?.toLocal();
    }
    if (dt == null) return 'Hôm nay';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(dt.year, dt.month, dt.day);
    final diffDays = today.difference(target).inDays;
    if (diffDays == 0) return 'Hôm nay';
    if (diffDays == 1) return 'Hôm qua';
    if (dt.year == now.year) {
      return '${dt.day} tháng ${dt.month}';
    }
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  Future<void> _openMomentsSearch() async {
    if (!_realSession) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            MomentsScreen(api: MomentApi(_effectiveUserApi), active: true),
      ),
    );
    unawaited(_loadMemories());
  }

  Map<String, dynamic>? _editedProfile;
  Map<String, dynamic>? get _profile => _editedProfile ?? widget.profile;
  int _unseenCount = 0;
  int _countsVersion = 0;
  int? _friendCount;
  bool _friendCountError = false;
  int _socialVersion = 0;
  PushNotifications? _push;
  ChatController? _chat;
  ChatController _createChatController() =>
      widget.chatControllerFactory?.call() ??
      ChatController(
        api: ChatApi(_effectiveUserApi),
        socket: ChatSocketClient(),
      );

  Future<void> _openChat() async {
    if (!_realSession ||
        !session.authenticated ||
        session.accessToken.isEmpty) {
      return;
    }
    final controller = _createChatController();
    _chat = controller;
    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ChatInboxScreen(controller: controller),
        ),
      );
    } finally {
      controller.dispose();
      if (identical(_chat, controller)) _chat = null;
    }
  }

  bool _openingAuthorChat = false;
  Future<void> _messageAuthor(FeedPost post) async {
    if (_openingAuthorChat ||
        _isLoggingOut ||
        _isDeletingAccount ||
        !_realSession ||
        post.mine ||
        post.ownerId == session.user.id ||
        !session.authenticated ||
        session.accessToken.isEmpty) {
      return;
    }
    _openingAuthorChat = true;
    final accountId = session.user.id;
    final controller = _createChatController();
    _chat = controller;
    try {
      final conversation = await controller.openDirect(post.ownerId);
      if (!mounted ||
          _isLoggingOut ||
          _isDeletingAccount ||
          session.user.id != accountId) {
        return;
      }
      if (conversation == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(controller.error ?? 'Chưa thể mở cuộc trò chuyện.'),
          ),
        );
        return;
      }
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ChatDetailScreen(
            controller: controller,
            conversationId: conversation.id,
            postAttachment: ChatPostAttachment(
              postId: post.id,
              mediaKey: post.mediaKey,
            ),
          ),
        ),
      );
    } finally {
      controller.dispose();
      if (identical(_chat, controller)) _chat = null;
      _openingAuthorChat = false;
    }
  }

  Timer? _notificationTimer;
  late final UserApiClient _notificationUserApi = _effectiveUserApi;
  late final NotificationApi _notifications = NotificationApi(
    _notificationUserApi,
  );
  bool get _realSession => !session.accessToken.startsWith('demo-');
  @override
  void initState() {
    super.initState();
    _authService.updateSession(session);
    if (_realSession) unawaited(_feed.refresh());
    if (_realSession && _currentTab == HomeTab.memories) {
      unawaited(_calendar.refresh());
    }
    _authService.addReplacementCleanup(_prepareSessionReplacement);
    WidgetsBinding.instance.addObserver(this);
    if (_realSession) {
      _refreshSocialSummary();
      if (_currentTab == HomeTab.memories || _currentTab == HomeTab.profile) {
        unawaited(_loadMemories());
      }
      if (widget.profile == null) unawaited(_loadProfile());
      _refreshNotifications();
      _notificationTimer = Timer.periodic(
        const Duration(seconds: 30),
        (_) => _refreshNotifications(),
      );
      _push = PushNotifications(_notifications, (data) {
        if (mounted && !_isLoggingOut && !_isDeletingAccount) {
          unawaited(
            openNotification(
              context,
              _notifications,
              data,
            ).then((_) => _refreshAfterNotifications()),
          );
        }
      }, () => unawaited(_refreshNotifications()));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_push!.start().catchError((Object _) {}));
      });
    }
  }

  Future<void> _refreshNotifications() async {
    if (!mounted || !_realSession || _isLoggingOut || _isDeletingAccount) {
      return;
    }
    try {
      final version = ++_countsVersion;
      final counts = await _notifications.counts();
      if (mounted && version == _countsVersion) {
        setState(() => _unseenCount = counts['unseenCount'] as int);
      }
    } catch (_) {}
  }

  Future<void> _refreshSocialSummary() async {
    if (!mounted || !_realSession || _isLoggingOut || _isDeletingAccount) {
      return;
    }
    final version = ++_socialVersion;
    try {
      final data = await _effectiveUserApi.request('GET', 'me/social-summary');
      final count = data['friendCount'];
      if (count is! int || count < 0) {
        throw const FormatException('Invalid summary');
      }
      if (mounted && version == _socialVersion) {
        setState(() {
          _friendCount = count;
          _friendCountError = false;
        });
      }
    } catch (_) {
      if (mounted && version == _socialVersion) {
        setState(() {
          _friendCount = null;
          _friendCountError = true;
        });
      }
    }
  }

  Future<void> _openAccounts({int tab = 0}) async {
    if (!_realSession) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Hãy đăng nhập tài khoản thật để tìm và kết nối bạn bè.',
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => FriendsScreen(
          api: _effectiveUserApi,
          initialTab: tab,
          autofocus: tab == 0,
          singleTab: tab == 0,
        ),
      ),
    );
    await _refreshSocialSummary();
    if (mounted && _realSession) await _feed.refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        !_isLoggingOut &&
        !_isDeletingAccount) {
      unawaited(_refreshNotifications());
      unawaited(_refreshSocialSummary());
      unawaited(_push?.sync());
    }
  }

  @override
  void dispose() {
    _homePages.dispose();
    _feed.dispose();
    _calendar.dispose();
    _authService.removeReplacementCleanup(_prepareSessionReplacement);
    _chat?.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _notificationTimer?.cancel();
    _push?.dispose();
    super.dispose();
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => NotificationsScreen(
          api: _notifications,
          onChanged: () => unawaited(_refreshNotifications()),
        ),
      ),
    );
    await _refreshAfterNotifications();
  }

  Future<void> _refreshAfterNotifications() async {
    await Future.wait([_refreshNotifications(), _refreshSocialSummary()]);
  }

  late HomeTab _currentTab =
      widget.initialDestination == HomeTab.debug && !developerToolsEnabled
      ? HomeTab.home
      : widget.initialDestination ?? homeTabFromLegacy(widget.initialTab);
  bool _isLoggingOut = false;
  bool _awaitingLogoutChoice = false;
  bool _isDeletingAccount = false;

  UserApiClient? _fallbackUserApi;
  AuthSession get session =>
      widget.userApi?.session ?? _fallbackUserApi?.session ?? widget.session;
  late final GoogleAuthService _authService =
      widget.googleAuthService ?? GoogleAuthService();
  UserApiClient get _effectiveUserApi =>
      widget.userApi ??
      (_fallbackUserApi ??= UserApiClient(
        auth: _authService.apiClient,
        session: session,
        onSessionChanged: _authService.updateSession,
        refreshSession: _authService.refreshSession,
        coordinator: _authService,
      ));

  Future<void> _loadProfile() async {
    try {
      final profile = await _effectiveUserApi.me();
      if (!mounted ||
          _isLoggingOut ||
          _isDeletingAccount ||
          profile['id'] != session.user.id) {
        return;
      }
      setState(() => _editedProfile = profile);
    } catch (_) {
      /* Keep an unknown profile rather than fabricated data. */
    }
  }

  void _openRetainedFriends() {
    if (!_realSession) {
      _openAccounts(tab: 3);
      return;
    }
    setState(() => _currentTab = HomeTab.friends);
  }

  Future<void> _shareProfile() async {
    if (!_realSession) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Hãy đăng nhập tài khoản thật để chia sẻ hồ sơ.'),
        ),
      );
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      constraints: const BoxConstraints(maxWidth: 520),
      builder: (sheetContext) => SizedBox(
        width: double.infinity,
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: ProfileShareCard(
              api: _effectiveUserApi,
              profile: _profile,
              showCard: false,
              onSearch: () {
                Navigator.pop(sheetContext);
                _openRetainedFriends();
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _ownAvatar(double size) => UserAvatar(
    avatarUrl: _realSession ? (_profile?['avatarUrl'] as String?) : null,
    displayName: _displayName,
    size: size,
  );

  void _viewOwnAvatar() {
    FullScreenImageViewer.open(
      context,
      imageUrl: _realSession ? (_profile?['avatarUrl'] as String?) : null,
      title: 'Ảnh đại diện',
      subtitle: _displayName,
      emptyMessage: 'Bạn chưa cập nhật ảnh đại diện.',
    );
  }

  void _viewOwnCover() {
    FullScreenImageViewer.open(
      context,
      imageUrl: _realSession ? (_profile?['coverUrl'] as String?) : null,
      title: 'Ảnh bìa',
      subtitle: _displayName,
      emptyMessage: 'Bạn chưa cập nhật ảnh bìa.',
    );
  }

  Future<void> _editAvatar() async {
    if (!_realSession) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Hãy đăng nhập tài khoản thật để đổi ảnh đại diện.'),
        ),
      );
      return;
    }
    if (_profile == null) await _loadProfile();
    if (!mounted || _profile == null || !_effectiveUserApi.isCurrent) return;
    final updated = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            AvatarUrlScreen(api: _effectiveUserApi, profile: _profile!),
      ),
    );
    if (!mounted || updated == null || !_effectiveUserApi.isCurrent) return;
    await _applyProfile(updated);
  }

  Future<void> _applyProfile(Map<String, dynamic> updated) async {
    if (!_effectiveUserApi.isCurrent || !mounted) return;
    setState(() => _editedProfile = updated);
    ProfileLinkScope.maybeOf(
      context,
    )?.attach(_effectiveUserApi, _authService, updated);
    await _authService.vault.profile(
      session.user.id,
      updated,
      isCurrent: () => _effectiveUserApi.isCurrent,
    );
  }

  Future<void> _debugReloadProfile() async {
    if (!developerToolsEnabled ||
        !_realSession ||
        !_effectiveUserApi.isCurrent) {
      throw StateError('Unavailable');
    }
    final profile = await _effectiveUserApi.me();
    if (profile['id'] != session.user.id ||
        !_effectiveUserApi.isCurrent ||
        !mounted) {
      throw StateError('Session changed');
    }
    await _applyProfile(profile);
  }

  Future<void> _debugReloadCounts() async {
    if (!developerToolsEnabled ||
        !_realSession ||
        !_effectiveUserApi.isCurrent) {
      throw StateError('Unavailable');
    }
    final responses = await Future.wait([
      _notifications.counts(),
      _effectiveUserApi.request('GET', 'me/social-summary'),
    ]);
    final unseen = responses[0]['unseenCount'],
        friends = responses[1]['friendCount'];
    if (unseen is! int ||
        friends is! int ||
        unseen < 0 ||
        friends < 0 ||
        !mounted ||
        !_effectiveUserApi.isCurrent) {
      throw StateError('Invalid summary');
    }
    _countsVersion++;
    _socialVersion++;
    setState(() {
      _unseenCount = unseen;
      _friendCount = friends;
      _friendCountError = false;
    });
  }

  Future<void> _logout() => _leaveAccount();

  Future<void> _editProfile() async {
    if (!_realSession) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Hãy đăng nhập tài khoản thật để chỉnh sửa hồ sơ.'),
        ),
      );
      return;
    }
    final updated = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => EditProfileScreen(api: _effectiveUserApi),
      ),
    );
    if (!mounted ||
        !_effectiveUserApi.isCurrent ||
        _isLoggingOut ||
        _isDeletingAccount) {
      return;
    }
    if (updated != null) {
      await _applyProfile(updated);
    } else {
      // Media has its own commit; backing out of unsaved name edits still refreshes it.
      await _loadProfile();
    }
  }

  Future<void> _openSettings() async {
    if (!_realSession) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Hãy đăng nhập tài khoản thật để xem lịch sử đăng nhập.',
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsPrivacyScreen(
          account: _effectiveUserApi,
          onCurrentSessionRevoked: _handleCurrentSessionRevoked,
        ),
      ),
    );
    await _refreshSocialSummary();
  }

  void _stopSessionWork() {
    _isLoggingOut = true;
    _notificationTimer?.cancel();
    _countsVersion++;
    _socialVersion++;
    _memoriesRevision++;
    _memoriesLoaded = false;
    _memoriesCursor = null;
    _memoriesLoadingMore = false;
    _memoriesMoreError = null;
    _memories.clear();
    _memoryImages.clear();
    _push?.dispose();
  }

  Future<void> _handleCurrentSessionRevoked() =>
      _authService.clearRevokedSession(_effectiveUserApi.session);

  Future<void> _prepareSessionReplacement() async {
    _stopSessionWork();
    await _push?.settleRegistration();
  }

  Future<void> _switchAccount() => _leaveAccount();

  Future<void> _leaveAccount() async {
    if (_isLoggingOut || _isDeletingAccount) return;
    setState(() {
      _isLoggingOut = true;
      _awaitingLogoutChoice = true;
    });
    try {
      final retain = await chooseLogoutRetention(
        context,
        _authService,
        _notificationUserApi.session,
      );
      if (retain == null || !mounted) return;
      setState(() => _awaitingLogoutChoice = false);
      await _push?.unregister(strict: retain);
      if (retain) {
        await _authService.leaveRetainingSession(_notificationUserApi.session);
      } else {
        await _authService.signOut(session: _notificationUserApi.session);
      }
      _effectiveUserApi.invalidate();
      _socialVersion++;
      _countsVersion++;
      _notificationTimer?.cancel();
      _push?.dispose();
      if (!mounted) return;
      ProfileLinkScope.maybeOf(context)?.clear();
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) =>
              AuthScreen(googleAuthService: _authService, autoRestore: false),
        ),
        (_) => false,
      );
    } catch (_) {
      await _push?.sync();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text(AppStrings.logoutFailed)));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoggingOut = false;
          _awaitingLogoutChoice = false;
        });
      }
    }
  }

  Future<void> _confirmDeleteAccount() async {
    if (_isDeletingAccount || _isLoggingOut) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(AppStrings.deleteAccountTitle),
        content: const Text(AppStrings.deleteAccountConfirm),
        actions: [
          TextButton(
            key: const Key('cancel_delete_account_button'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(AppStrings.cancel),
          ),
          TextButton(
            key: const Key('confirm_delete_account_button'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: TextButton.styleFrom(foregroundColor: HomeColors.error),
            child: const Text(AppStrings.deleteAccountConfirmButton),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!mounted || _isDeletingAccount || _isLoggingOut) return;

    setState(() => _isDeletingAccount = true);
    try {
      await _push?.unregister();
      await _notificationUserApi.deleteAccount();
      _push?.dispose();
      await _authService.clearSession();
      _effectiveUserApi.invalidate();
      _notificationTimer?.cancel();
      _countsVersion++;
      _socialVersion++;
      if (mounted) ProfileLinkScope.maybeOf(context)?.clear();

      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) =>
              AuthScreen(googleAuthService: _authService, autoRestore: false),
        ),
        (_) => false,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(AppStrings.deleteAccountSuccess)),
      );
    } catch (e) {
      await _push?.sync();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e is AuthApiException
                ? userError(e)
                : AppStrings.deleteAccountFailed,
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _isDeletingAccount = false);
    }
  }

  String get _displayName {
    if (_profile != null) {
      final name = _profile!['displayName'] as String?;
      return name != null && name.trim().isNotEmpty
          ? name
          : (_profile!['username'] as String? ?? 'Người dùng');
    }
    if (_realSession) return 'Người dùng';
    final email = session.user.email;
    if (email != null && email.isNotEmpty) {
      final namePart = email.split('@').first;
      if (namePart.isNotEmpty) {
        return namePart[0].toUpperCase() + namePart.substring(1);
      }
    }
    return _realSession ? 'Người dùng' : 'Minh Anh';
  }

  String get _displayHandle {
    if (_realSession) {
      final username = _profile?['username'];
      return username is String && username.isNotEmpty
          ? '@$username'
          : 'Chưa có username';
    }
    final email = session.user.email;
    if (email != null && email.isNotEmpty) {
      return '@${email.split('@').first}';
    }
    return '@minhanh';
  }

  Widget _buildSafeAssetImage(
    String assetPath, {
    double? width,
    double? height,
    BoxFit fit = BoxFit.cover,
    Widget? fallback,
  }) {
    return Image.asset(
      assetPath,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (context, error, stackTrace) {
        return fallback ??
            Container(
              width: width,
              height: height,
              color: HomeColors.coralLight,
              child: const Icon(
                Icons.image_outlined,
                color: HomeColors.primary,
                size: 20,
              ),
            );
      },
    );
  }

  @override
  Widget build(BuildContext context) => SessionBoundary(
    auth: _authService,
    api: _effectiveUserApi,
    onEnding: _stopSessionWork,
    child: Theme(
      data: HomeColors.theme,
      child: Builder(builder: _buildContent),
    ),
  );

  Widget _buildContent(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: SafeArea(
          child: IndexedStack(
            index: _currentTab.index,
            children: [
              _buildHomeTab(),
              _buildMemoriesTab(),
              _buildProfileTab(),
              if (_realSession)
                FriendsScreen(
                  api: _effectiveUserApi,
                  initialTab: 3,
                  embedded: true,
                  active: _currentTab == HomeTab.friends,
                  header: _buildFriendStories(),
                )
              else
                SingleChildScrollView(child: _buildFriendStories()),
              if (developerToolsEnabled)
                DebugScreen(
                  api: _effectiveUserApi,
                  push: _push,
                  reloadProfile: _debugReloadProfile,
                  reloadCounts: _debugReloadCounts,
                ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: HomeNavigation(
        selected: _currentTab,
        onSelected: _selectTab,
      ),
    );
  }

  // ==========================================
  // TAB 0: TRANG CHỦ (HOME PAGE)
  // ==========================================
  Widget _buildFriendStories() => Padding(
    padding: const EdgeInsets.fromLTRB(8, 12, 8, 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildTitleSection(),
        const SizedBox(height: 12),
        _buildStoriesRow(),
      ],
    ),
  );

  Widget _buildProtectedPhoto(FeedApi api, FeedPost post) =>
      FutureBuilder<Uint8List>(
        future: (api as ProtectedFeedImages).image(post.mediaKey),
        builder: (_, snapshot) {
          if (snapshot.hasData) {
            return Image.memory(
              snapshot.data!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) =>
                  const Icon(Icons.broken_image_outlined),
            );
          }
          return Icon(
            snapshot.hasError
                ? Icons.broken_image_outlined
                : Icons.photo_outlined,
          );
        },
      );

  Future<void> _openPhotoGallery() async {
    final controller = GalleryController(
      SessionFeedApi(_effectiveUserApi),
      session.user.id,
    );
    if (_realSession) unawaited(controller.refresh());
    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => PhotoGalleryScreen(
            controller: controller,
            imageBuilder: (post) => _buildProtectedPhoto(controller.api, post),
          ),
        ),
      );
    } finally {
      controller.dispose();
    }
  }

  Widget _buildHomeTab() => Column(
    children: [
      Expanded(
        child: RefreshIndicator(
          onRefresh: _refreshHome,
          child: FeedPages(
            controller: _feed,
            pageController: _homePages,
            selectedPage: _homePage,
            reactions: _realSession ? _reactions : null,
            onMessage: _messageAuthor,
            postHeader: _buildHomeHeader(),
            active:
                _currentTab == HomeTab.home &&
                _homePage > 0 &&
                !_isLoggingOut &&
                !_isDeletingAccount &&
                (ModalRoute.isCurrentOf(context) ?? true),
            onPageChanged: (page) => setState(() => _homePage = page),
            leading: _buildCameraTab(),
          ),
        ),
      ),
    ],
  );

  Widget _buildCameraTab() => CaptureMomentScreen(
    camera: widget.camera,
    ownerId: session.user.id,
    userApi: _effectiveUserApi,
    embedded: true,
    active:
        _currentTab == HomeTab.home &&
        _homePage == 0 &&
        !_isLoggingOut &&
        !_isDeletingAccount,
    onHistory: _openHistory,
    onPublished: (_) {
      unawaited(_feed.refresh());
      unawaited(_loadMemories());
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã đăng khoảnh khắc của bạn.')),
      );
    },
    header: _buildHomeHeader(),
  );

  Future<void> _chooseHomeAuthor() async {
    setState(() => _authorMenuOpen = true);
    final choice = await showAuthorPicker(
      context,
      api: _effectiveUserApi,
      selfName: _displayName,
      selfAvatar: _profile?['avatarUrl'] as String?,
    );
    if (!mounted) return;
    setState(() => _authorMenuOpen = false);
    if (choice == null || choice.id == _selectedAuthor.id) return;
    setState(() {
      _selectedAuthor = choice;
      _homePage = 0;
    });
    if (_homePages.hasClients) _homePages.jumpToPage(0);
    await _feed.refresh();
  }

  Widget _buildHomeHeader() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Row(
        children: [
          IconButton.filledTonal(
            key: const ValueKey('open-photo-gallery'),
            tooltip: 'Thư viện ảnh',
            onPressed: _openPhotoGallery,
            style: IconButton.styleFrom(
              backgroundColor: const Color(0xFF202020),
            ),
            icon: const Icon(Icons.grid_view_rounded, color: Colors.white),
          ),
          IconButton.filledTonal(
            tooltip: 'Thông báo',
            onPressed: _realSession ? _openNotifications : null,
            style: IconButton.styleFrom(
              backgroundColor: const Color(0xFF202020),
            ),
            icon: Badge(
              isLabelVisible: _unseenCount > 0,
              label: Text('$_unseenCount'),
              child: const Icon(Icons.campaign_outlined, color: Colors.white),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton.icon(
              onPressed: _realSession ? _chooseHomeAuthor : null,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF202020),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 14,
                ),
              ),
              icon: Icon(
                _authorMenuOpen ? Icons.expand_less : Icons.expand_more,
              ),
              label: Text(
                _selectedAuthor.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          IconButton(
            tooltip: 'Mở hồ sơ cá nhân',
            onPressed: () => _selectTab(HomeTab.profile),
            icon: _ownAvatar(42),
          ),
        ],
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          key: const Key('home_chat'),
          onPressed: _realSession ? _openChat : null,
          icon: const Icon(Icons.chat_bubble_outline_rounded),
          label: const Text('Tin nhắn'),
          style: OutlinedButton.styleFrom(
            backgroundColor: const Color(0xFF202020),
            foregroundColor: Colors.white,
            side: const BorderSide(color: HomeColors.border),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      ),
    ],
  );

  Future<void> _openHistory() async {
    if (!_homePages.hasClients) return;
    await _homePages.animateToPage(
      1,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOut,
    );
  }

  Widget _buildAccountSearchBar() => Semantics(
    button: true,
    label: 'Tìm tài khoản',
    child: Material(
      color: HomeColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        key: const Key('home_account_search'),
        borderRadius: BorderRadius.circular(18),
        onTap: () => _openAccounts(),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          decoration: BoxDecoration(
            border: Border.all(color: HomeColors.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: const Row(
            children: [
              Icon(Icons.search_rounded, color: HomeColors.primary),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Tìm bạn bằng tên hoặc @username',
                  style: TextStyle(
                    color: HomeColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward_rounded,
                size: 18,
                color: HomeColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    ),
  );

  bool _openingCamera = false;
  Future<void> _openCamera() async {
    if (_openingCamera || _isLoggingOut || _isDeletingAccount) return;
    if (!_realSession || !session.authenticated || session.user.id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hãy đăng nhập để gửi ảnh.')),
      );
      return;
    }
    _openingCamera = true;
    try {
      final result = await Navigator.of(context).push<PublishedPhoto>(
        MaterialPageRoute(
          builder: (_) => CaptureMomentScreen(
            ownerId: session.user.id,
            userApi: _effectiveUserApi,
          ),
        ),
      );
      if (mounted && result != null) {
        await Future.wait([_feed.refresh(), _loadMemories()]);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã đăng khoảnh khắc của bạn.')),
        );
      }
    } finally {
      _openingCamera = false;
    }
  }

  Widget _buildTitleSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const [
        Text(
          AppStrings.homeTitle,
          style: TextStyle(
            fontSize: 25,
            fontWeight: FontWeight.w800,
            color: HomeColors.textPrimary,
            letterSpacing: -0.6,
          ),
        ),
        SizedBox(height: 4),
        Text(
          AppStrings.homeSubtitle,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w400,
            color: HomeColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildStoriesRow() {
    final stories = [
      {'name': 'Nam', 'asset': 'assets/images/story_nam_clean.png'},
      {'name': 'Thảo Vy', 'asset': 'assets/images/story_thaovy_clean.png'},
      {'name': 'Linh', 'asset': 'assets/images/story_linh_clean.png'},
      {'name': 'Bân', 'asset': 'assets/images/story_ban_clean.png'},
    ];

    return SizedBox(
      height: 70 + MediaQuery.textScalerOf(context).scale(11) * 1.5,
      child: ListView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        children: [
          // Invite friends button
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: GestureDetector(
              onTap: _openCamera,
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: HomeColors.coralLight,
                      border: Border.all(
                        color: HomeColors.coralBorder,
                        width: 1.5,
                      ),
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.add_rounded,
                        color: HomeColors.primary,
                        size: 24,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Thêm tin',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: HomeColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Friend stories
          ...stories.map((story) {
            return Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: HomeColors.primary, width: 2.2),
                      color: Colors.white,
                    ),
                    padding: const EdgeInsets.all(2.5),
                    child: ClipOval(
                      child: _buildSafeAssetImage(
                        story['asset']!,
                        fallback: Container(
                          color: HomeColors.primarySoft,
                          child: Center(
                            child: Text(
                              story['name']![0],
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: HomeColors.primary,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    story['name']!,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: HomeColors.textPrimary,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  void _selectTab(HomeTab tab) {
    setState(() => _currentTab = tab);
    if (tab == HomeTab.memories && _realSession) {
      unawaited(_calendar.refresh());
    }
    if (tab == HomeTab.profile) unawaited(_refreshSocialSummary());
    if ((tab == HomeTab.profile || tab == HomeTab.memories) &&
        _realSession &&
        !_memoriesLoaded) {
      unawaited(_loadMemories());
    }
  }

  Future<void> _openMemoriesCalendar() async {
    if (_realSession) unawaited(_calendar.refresh());
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Lịch kỷ niệm')),
          body: MemoriesCalendar(
            controller: _calendar,
            enabled: _realSession,
            imageBuilder: (post) => _buildProtectedPhoto(_calendar.api, post),
          ),
        ),
      ),
    );
  }

  Widget _buildMemoriesTab() {
    if (!_realSession) {
      final memories = [
        {
          'tag': 'Hôm nay',
          'asset': 'assets/images/p1_sunset.png',
          'desc': 'Hoàng hôn bên hồ',
        },
        {
          'tag': '24 tháng 10',
          'asset': 'assets/images/p2_cat.png',
          'desc': 'Mèo cưng phơi nắng',
        },
        {
          'tag': '23 tháng 10',
          'asset': 'assets/images/p3_coffee.png',
          'desc': 'Cà phê sớm',
        },
      ];

      return Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFFBF9), Color(0xFFFFF5F0), Color(0xFFFFFFFF)],
          ),
        ),
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      const Text(
                        AppStrings.memoryGallery,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFECE5),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFFFFCCBC)),
                        ),
                        child: const Text(
                          'Bản xem trước',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFFF5722),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 6,
                          mainAxisSpacing: 6,
                          childAspectRatio: 1.0,
                        ),
                    itemCount: memories.length,
                    itemBuilder: (context, index) =>
                        _buildMockGridMemoryTile(memories[index]),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFFBF9), Color(0xFFFFF5F0), Color(0xFFFFFFFF)],
        ),
      ),
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: RefreshIndicator(
            color: const Color(0xFFFF5722),
            onRefresh: _loadMemories,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            const Text(
                              AppStrings.memoryGallery,
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF1E293B),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFECE5),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: const Color(0xFFFFCCBC),
                                ),
                              ),
                              child: Text(
                                _memories.isEmpty
                                    ? '0 kỷ niệm'
                                    : '${_memories.length} kỷ niệm gần đây',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFFFF5722),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        key: const Key('memories_calendar'),
                        tooltip: 'Lịch kỷ niệm',
                        onPressed: _openMemoriesCalendar,
                        icon: const Icon(Icons.calendar_month),
                      ),
                      Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(24),
                          onTap: _openMomentsSearch,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFECE5),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: const Color(0xFFFFCCBC),
                              ),
                            ),
                            child: const Icon(
                              Icons.search_rounded,
                              color: Color(0xFFFF5722),
                              size: 22,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_memoriesLoading && _memories.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: Color(0xFFFF5722),
                        ),
                      ),
                    )
                  else if (_memoriesError != null && _memories.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFFFFE0D6)),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(
                              0xFFFF5722,
                            ).withValues(alpha: 0.06),
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Text(
                            _memoriesError!,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: _loadMemories,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFF5722),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    )
                  else if (_memories.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 48,
                        horizontal: 24,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: const Color(0xFFFFE0D6)),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(
                              0xFFFF5722,
                            ).withValues(alpha: 0.06),
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: const BoxDecoration(
                              color: Color(0xFFFFECE5),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.photo_library_outlined,
                              size: 40,
                              color: Color(0xFFFF5722),
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'Chưa có kỷ niệm nào',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Hãy ghi lại và lưu giữ khoảnh khắc đầu tiên của bạn!',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 14,
                              color: Color(0xFF64748B),
                            ),
                          ),
                          const SizedBox(height: 20),
                          ElevatedButton.icon(
                            onPressed: _openCamera,
                            icon: const Icon(Icons.camera_alt_rounded),
                            label: const Text('Chụp khoảnh khắc'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFF5722),
                              foregroundColor: Colors.white,
                              elevation: 2,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 22,
                                vertical: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 6,
                            mainAxisSpacing: 6,
                            childAspectRatio: 1.0,
                          ),
                      itemCount: _memories.length,
                      itemBuilder: (context, index) =>
                          _buildGridMemoryTile(_memories[index]),
                    ),
                  if (_memoriesMoreError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        _memoriesMoreError!,
                        style: const TextStyle(color: Color(0xFF64748B)),
                      ),
                    ),
                  if (_memoriesCursor != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: TextButton(
                        key: const Key('memories_load_more'),
                        onPressed: _memoriesLoading || _memoriesLoadingMore
                            ? null
                            : () => _loadMemories(more: true),
                        style: TextButton.styleFrom(
                          foregroundColor: const Color(0xFFFF5722),
                        ),
                        child: Text(
                          _memoriesLoadingMore
                              ? 'Đang tải thêm...'
                              : 'Xem thêm kỷ niệm',
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGridMemoryTile(Map<String, dynamic> m) {
    final id = m['id']?.toString() ?? '';
    final dateTag = _formatMemoryDate(m['capturedAt'] ?? m['createdAt']);

    return GestureDetector(
      onTap: () => _showMemoryDetailDialog(m),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFFFE0D6)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            FutureBuilder<Uint8List>(
              future: _getMemoryImage(id),
              builder: (context, snap) {
                if (snap.hasData) {
                  return Image.memory(snap.data!, fit: BoxFit.cover);
                }
                if (snap.hasError) {
                  return Center(
                    child: IconButton(
                      icon: const Icon(
                        Icons.refresh_rounded,
                        color: Color(0xFFFF5722),
                        size: 20,
                      ),
                      onPressed: () => _retryMemoryImage(id),
                    ),
                  );
                }
                return Container(
                  color: const Color(0xFFFFF0EB),
                  child: const Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFFFF5722),
                      ),
                    ),
                  ),
                );
              },
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.65),
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: Text(
                  dateTag,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showMemoryDetailDialog(Map<String, dynamic> m) {
    final id = m['id']?.toString() ?? '';
    final dateTag = _formatMemoryDate(m['capturedAt'] ?? m['createdAt']);
    final caption = (m['caption'] as String?)?.trim();
    final place = (m['place'] as String?)?.trim();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFFFFFBF9),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            MediaQuery.of(ctx).padding.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFCCBC),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: AspectRatio(
                  aspectRatio: 1.0,
                  child: FutureBuilder<Uint8List>(
                    future: _getMemoryImage(id),
                    builder: (context, snap) {
                      if (snap.hasData) {
                        return Image.memory(snap.data!, fit: BoxFit.cover);
                      }
                      return Container(
                        color: const Color(0xFFFFF0EB),
                        child: const Center(
                          child: CircularProgressIndicator(
                            color: Color(0xFFFF5722),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: 16),
              if (caption != null && caption.isNotEmpty) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.favorite_rounded,
                      color: Color(0xFFFF5722),
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        caption,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
              Row(
                children: [
                  const Icon(
                    Icons.access_time_rounded,
                    color: Color(0xFF64748B),
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    dateTag,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF64748B),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (place != null && place.isNotEmpty) ...[
                    const SizedBox(width: 14),
                    const Icon(
                      Icons.location_on_outlined,
                      color: Color(0xFF64748B),
                      size: 16,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        place,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMockGridMemoryTile(Map<String, String> m) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFFE0D6)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _buildSafeAssetImage(m['asset']!),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.65),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: Text(
                m['tag']!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ==========================================
  // TAB 2: HỒ SƠ CÁ NHÂN (PROFILE PAGE)
  // ==========================================
  Widget _buildProfileTab() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: RefreshIndicator(
          onRefresh: () async {
            await Future.wait([
              _refreshSocialSummary(),
              if (_realSession) _loadMemories(),
            ]);
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: _buildAccountSearchBar()),
                    const SizedBox(width: 8),
                    IconButton(
                      tooltip: 'Thông báo',
                      onPressed: _realSession ? _openNotifications : null,
                      icon: Badge(
                        isLabelVisible: _unseenCount > 0,
                        label: Text('$_unseenCount'),
                        child: const Icon(Icons.notifications_outlined),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Đăng xuất',
                      onPressed: _isLoggingOut || _isDeletingAccount
                          ? null
                          : _logout,
                      style: IconButton.styleFrom(
                        backgroundColor: HomeColors.surface,
                        padding: const EdgeInsets.all(12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                          side: const BorderSide(color: HomeColors.border),
                        ),
                      ),
                      icon: const Icon(
                        Icons.logout_rounded,
                        color: HomeColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Top Profile Navigation Bar
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _currentTab = HomeTab.home),
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: HomeColors.surface,
                          border: Border.all(color: HomeColors.border),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.arrow_back_rounded,
                            color: HomeColors.textPrimary,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                    const Expanded(
                      child: Text(
                        AppStrings.profileTitle,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                          color: HomeColors.textPrimary,
                        ),
                      ),
                    ),
                    IconButton(
                      key: const Key('profile_share'),
                      tooltip: 'Chia sẻ hồ sơ',
                      onPressed: _shareProfile,
                      icon: const Icon(Icons.share_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                GestureDetector(
                  key: const Key('view_own_cover'),
                  onTap: _viewOwnCover,
                  child: UserCover(
                    coverUrl: _realSession
                        ? (_profile?['coverUrl'] as String?)
                        : null,
                    onTap: _viewOwnCover,
                  ),
                ),
                TextButton.icon(
                  key: const Key('edit_cover_photo'),
                  onPressed: _editProfile,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Chỉnh sửa ảnh bìa'),
                ),
                const SizedBox(height: 16),
                // Avatar & Name Section
                Center(
                  child: Column(
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          GestureDetector(
                            key: const Key('view_own_avatar'),
                            onTap: _viewOwnAvatar,
                            child: Container(
                              width: 96,
                              height: 96,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: HomeColors.primary,
                                  width: 2.5,
                                ),
                                color: Colors.white,
                              ),
                              padding: const EdgeInsets.all(3),
                              child: ClipOval(child: _ownAvatar(82)),
                            ),
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: Material(
                              color: HomeColors.primary,
                              shape: const CircleBorder(),
                              child: IconButton(
                                key: const Key('edit_avatar_url'),
                                tooltip: 'Đổi ảnh đại diện',
                                onPressed: _editAvatar,
                                icon: const Icon(
                                  Icons.edit_outlined,
                                  color: Colors.black,
                                  size: 18,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _displayName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: HomeColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _displayHandle,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: HomeColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      if (!_realSession)
                        const Text(
                          'Gom những ngày bình thường đáng nhớ.',
                          style: TextStyle(
                            fontSize: 13,
                            color: HomeColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                if (!_realSession) const Text('Bản xem trước · Thống kê mẫu'),
                // Stats Row (128 Khoảnh khắc | 8 Bạn thân | 24 Ngày bên nhau)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: HomeColors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: HomeColors.border),
                  ),
                  child: Wrap(
                    alignment: WrapAlignment.spaceEvenly,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 16,
                    runSpacing: 12,
                    children: [
                      if (!_realSession) ...[
                        _buildStatCol('128', AppStrings.momentsCountLabel),
                      ],
                      InkWell(
                        key: const Key('profile_friend_count'),
                        onTap: _openRetainedFriends,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: _buildStatCol(
                            _friendCount?.toString() ?? '—',
                            'Bạn bè',
                          ),
                        ),
                      ),
                      if (!_realSession) ...[
                        _buildStatCol('24', AppStrings.daysTogetherLabel),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Edit Profile Button
                if (_friendCountError)
                  TextButton.icon(
                    onPressed: _refreshSocialSummary,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Thử tải lại số bạn bè'),
                  ),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: HomeColors.primary,
                    side: const BorderSide(
                      color: HomeColors.primary,
                      width: 1.5,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text(
                    AppStrings.editProfile,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  onPressed: _editProfile,
                ),
                const SizedBox(height: 22),

                // Memory Gallery Preview
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    const Text(
                      AppStrings.memoryGallery,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: HomeColors.textPrimary,
                      ),
                    ),
                    GestureDetector(
                      onTap: _openMemoriesCalendar,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          Text(
                            AppStrings.seeAll,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: HomeColors.primary,
                            ),
                          ),
                          SizedBox(width: 4),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 14,
                            color: HomeColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (_realSession && _memories.isNotEmpty)
                  SizedBox(
                    height: 120,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: _memories
                          .take(5)
                          .map(_buildRealMemoryMiniCard)
                          .toList(),
                    ),
                  )
                else if (_realSession && _memories.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'Chưa có kỷ niệm nào.',
                      style: TextStyle(
                        color: HomeColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  )
                else
                  SizedBox(
                    height: 120,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        _buildMemoryMiniCard(
                          'assets/images/p1_sunset.png',
                          'Hôm nay',
                        ),
                        _buildMemoryMiniCard(
                          'assets/images/p2_cat.png',
                          '24 tháng 10',
                        ),
                        _buildMemoryMiniCard(
                          'assets/images/p3_coffee.png',
                          '23 tháng 10',
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),

                // Settings Items
                InkWell(
                  onTap: _openRetainedFriends,
                  child: _buildSettingRow(
                    Icons.group_outlined,
                    'Bạn bè của bạn',
                    _friendCount == null ? '—' : '$_friendCount người',
                  ),
                ),
                const SizedBox(height: 10),
                InkWell(
                  key: const Key('profile_settings'),
                  onTap: _openSettings,
                  child: _buildSettingRow(
                    Icons.settings_outlined,
                    AppStrings.settingsPrivacy,
                    null,
                  ),
                ),
                const SizedBox(height: 24),

                // Logout Button
                CustomButton(
                  text: 'Chuyển tài khoản',
                  textColor: HomeColors.primary,
                  backgroundColor: HomeColors.primary,
                  isOutlined: true,
                  icon: Icons.switch_account_outlined,
                  onPressed: _isLoggingOut || _isDeletingAccount
                      ? null
                      : _switchAccount,
                ),
                const SizedBox(height: 12),
                CustomButton(
                  text: AppStrings.logout,
                  textColor: HomeColors.primary,
                  backgroundColor: HomeColors.primary,
                  isOutlined: true,
                  isLoading: _isLoggingOut && !_awaitingLogoutChoice,
                  onPressed: _isLoggingOut || _isDeletingAccount
                      ? null
                      : _logout,
                ),
                const SizedBox(height: 12),

                // Delete Account Button (Danger Zone)
                CustomButton(
                  key: const Key('delete_account_button'),
                  text: _isDeletingAccount
                      ? AppStrings.deletingAccount
                      : AppStrings.deleteAccount,
                  isOutlined: true,
                  isLoading: _isDeletingAccount,
                  backgroundColor: HomeColors.error,
                  textColor: HomeColors.error,
                  icon: Icons.delete_outline_rounded,
                  onPressed: _isDeletingAccount || _isLoggingOut
                      ? null
                      : _confirmDeleteAccount,
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatCol(String num, String label) {
    return Column(
      children: [
        Text(
          num,
          style: const TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: HomeColors.textPrimary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w500,
            color: HomeColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildRealMemoryMiniCard(Map<String, dynamic> m) {
    final id = m['id']?.toString() ?? '';
    final tag = _formatMemoryDate(m['capturedAt'] ?? m['createdAt']);
    return GestureDetector(
      onTap: () => setState(() => _currentTab = HomeTab.memories),
      child: Container(
        width: 110,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: HomeColors.border),
          color: HomeColors.surface,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            FutureBuilder<Uint8List>(
              future: _getMemoryImage(id),
              builder: (context, snap) {
                if (snap.hasData) {
                  return Image.memory(snap.data!, fit: BoxFit.cover);
                }
                return Container(
                  color: HomeColors.surface,
                  child: const Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: HomeColors.primary,
                      ),
                    ),
                  ),
                );
              },
            ),
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.65),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
            Positioned(
              bottom: 8,
              left: 8,
              right: 8,
              child: Text(
                tag,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMemoryMiniCard(String asset, String tag) {
    return Container(
      width: 110,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: HomeColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _buildSafeAssetImage(asset),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.65),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
          Positioned(
            bottom: 8,
            left: 8,
            right: 8,
            child: Text(
              tag,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingRow(IconData icon, String title, String? trailingText) =>
      Card(
        child: ListTile(
          leading: Icon(icon, color: HomeColors.primary),
          title: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: trailingText == null ? null : Text(trailingText),
          trailing: const Icon(
            Icons.chevron_right,
            color: HomeColors.textSecondary,
          ),
        ),
      );
}
