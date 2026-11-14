import '../../../../core/widgets/user_avatar.dart';
import '../../../../core/widgets/user_cover.dart';
import '../../../../core/widgets/full_screen_image_viewer.dart';
import '../../../users/presentation/avatar_url_screen.dart';
import '../../../debug/developer_tools.dart';
import '../../../debug/presentation/debug_screen.dart';
import '../widgets/home_navigation.dart';
import '../widgets/home_actions_header.dart';
import '../../../auth/presentation/widgets/session_boundary.dart';
import 'dart:async';
import '../../../notifications/data/notification_api.dart';
import '../../../notifications/data/push_notifications.dart';
import '../../../notifications/presentation/notifications_screen.dart';
import 'package:flutter/material.dart';
import '../../../users/presentation/profile_share_card.dart';
import '../../../users/presentation/profile_link_session.dart';

import '../../../../core/constants/app_colors.dart';
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

class HomeScreen extends StatefulWidget {
  final AuthSession session;
  final GoogleAuthService? googleAuthService;
  final Map<String, dynamic>? profile;
  final UserApiClient? userApi;
  final int initialTab;
  final HomeTab? initialDestination;

  const HomeScreen({
    super.key,
    required this.session,
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
  Map<String, dynamic>? _editedProfile;
  Map<String, dynamic>? get _profile => _editedProfile ?? widget.profile;
  int _unseenCount = 0;
  int _countsVersion = 0;
  int? _friendCount;
  bool _friendCountError = false;
  int _socialVersion = 0;
  PushNotifications? _push;
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
    _authService.addReplacementCleanup(_prepareSessionReplacement);
    WidgetsBinding.instance.addObserver(this);
    if (_realSession) {
      _refreshSocialSummary();
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
    _authService.removeReplacementCleanup(_prepareSessionReplacement);
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
  bool _isFavorited = false;

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
      backgroundColor: AppColors.card,
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
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
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
              color: AppColors.coralLight,
              child: const Icon(
                Icons.image_outlined,
                color: AppColors.primary,
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
    child: _buildContent(context),
  );

  Widget _buildContent(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
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
              )
            else
              const Center(child: Text('Hãy đăng nhập để kết nối bạn bè.')),
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
      bottomNavigationBar: HomeNavigation(
        selected: _currentTab,
        onSelected: (tab) {
          setState(() => _currentTab = tab);
          if (tab == HomeTab.profile) unawaited(_refreshSocialSummary());
        },
      ),
    );
  }

  // ==========================================
  // TAB 0: TRANG CHỦ (HOME PAGE)
  // ==========================================
  Widget _buildHomeTab() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: RefreshIndicator(
          onRefresh: _refreshSocialSummary,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Session Info & Status Header (ensures test compatibility & session visibility)
                HomeActionsHeader(
                  demo: !_realSession,
                  unseen: _unseenCount,
                  onNotifications: _openNotifications,
                  onLogout: _isLoggingOut || _isDeletingAccount
                      ? null
                      : _logout,
                ),
                const SizedBox(height: 12),

                // Brand Header & User Greeting
                _buildBrandHeader(),
                const SizedBox(height: 14),
                _buildAccountSearchBar(),
                const SizedBox(height: 18),

                const Text('Bản xem trước · Nội dung khoảnh khắc mẫu'),
                // Title Section
                _buildTitleSection(),
                const SizedBox(height: 18),

                // Stories Row
                _buildStoriesRow(),
                const SizedBox(height: 20),

                // Featured Post Card
                _buildFeaturedCard(),
                const SizedBox(height: 20),

                // Action Button ("Gửi một khoảnh khắc")
                _buildActionMomentsButton(),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAccountSearchBar() => Semantics(
    button: true,
    label: 'Tìm tài khoản',
    child: Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        key: const Key('home_account_search'),
        borderRadius: BorderRadius.circular(18),
        onTap: () => _openAccounts(),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: const Row(
            children: [
              Icon(Icons.search_rounded, color: AppColors.primary),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Tìm bạn bằng tên hoặc @username',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward_rounded,
                size: 18,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    ),
  );

  void _postingUnavailable() => ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Tính năng thêm tin, ảnh sẽ được phát triển sau.'),
    ),
  );

  Widget _buildBrandHeader() => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              AppStrings.appName,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
            ),
            Text(
              'Chào, $_displayName',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(width: 8),
      IconButton(
        tooltip: 'Mở hồ sơ cá nhân',
        onPressed: () {
          setState(() => _currentTab = HomeTab.profile);
          unawaited(_refreshSocialSummary());
        },
        icon: _ownAvatar(36),
      ),
    ],
  );

  Widget _buildTitleSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const [
        Text(
          AppStrings.homeTitle,
          style: TextStyle(
            fontSize: 25,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
            letterSpacing: -0.6,
          ),
        ),
        SizedBox(height: 4),
        Text(
          AppStrings.homeSubtitle,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w400,
            color: AppColors.textSecondary,
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
              onTap: _postingUnavailable,
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.coralLight,
                      border: Border.all(
                        color: AppColors.coralBorder,
                        width: 1.5,
                      ),
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.add_rounded,
                        color: AppColors.primary,
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
                      color: Color(0xFF6D6862),
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
                      border: Border.all(color: AppColors.primary, width: 2.2),
                      color: Colors.white,
                    ),
                    padding: const EdgeInsets.all(2.5),
                    child: ClipOval(
                      child: _buildSafeAssetImage(
                        story['asset']!,
                        fallback: Container(
                          color: AppColors.primarySoft,
                          child: Center(
                            child: Text(
                              story['name']![0],
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppColors.primary,
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
                      color: Color(0xFF383431),
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

  Widget _buildFeaturedCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 18,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Media with floating badges
          Stack(
            children: [
              SizedBox(
                height: 310,
                width: double.infinity,
                child: _buildSafeAssetImage(
                  'assets/images/coffee_full.png',
                  fallback: Container(
                    color: const Color(0xFFEFECE8),
                    child: const Center(
                      child: Icon(
                        Icons.coffee_rounded,
                        color: AppColors.primary,
                        size: 48,
                      ),
                    ),
                  ),
                ),
              ),

              // Top-left author pill
              Positioned(
                top: 14,
                left: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.only(
                    top: 4,
                    bottom: 4,
                    left: 4,
                    right: 12,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(9999),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _ownAvatar(24),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '$_displayName • 2 giờ trước',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Bottom-right close friends badge
              Positioned(
                bottom: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xB816191C),
                    borderRadius: BorderRadius.circular(9999),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Text(
                        '✦',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      SizedBox(width: 6),
                      Text(
                        AppStrings.closeFriends,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Card bottom details
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        AppStrings.featuredPostDefaultTitle,
                        style: TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                          letterSpacing: -0.2,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        AppStrings.featuredPostDefaultDesc,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w400,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    setState(() => _isFavorited = !_isFavorited);
                  },
                  child: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      border: Border.all(color: const Color(0xFFECE7E1)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Icon(
                        _isFavorited
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: _isFavorited
                            ? AppColors.primary
                            : AppColors.textSecondary,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionMomentsButton() {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFF6B5F).withValues(alpha: 0.32),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: _postingUnavailable,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                const Icon(
                  Icons.camera_alt_rounded,
                  color: Colors.white,
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Text(
                        AppStrings.sendMoment,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        AppStrings.sendMomentSubtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.arrow_forward_ios_rounded,
                  color: Colors.white,
                  size: 14,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ==========================================
  // TAB 1: KỶ NIỆM (MEMORIES)
  // ==========================================
  Widget _buildMemoriesTab() {
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

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Bản xem trước · Nội dung khoảnh khắc mẫu'),
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
                      color: AppColors.textPrimary,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.coralLight,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      '3 kỷ niệm gần đây',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              ...memories.map((m) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 18),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: AppColors.border),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        height: 220,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            _buildSafeAssetImage(m['asset']!),
                            Positioned(
                              top: 12,
                              left: 12,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.65),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  m['tag']!,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          m['desc']!,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
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
          onRefresh: _refreshSocialSummary,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
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
                          color: Colors.white,
                          border: Border.all(color: AppColors.border),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.arrow_back_rounded,
                            color: AppColors.textPrimary,
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
                          color: AppColors.textPrimary,
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
                                  color: AppColors.primary,
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
                              color: AppColors.primary,
                              shape: const CircleBorder(),
                              child: IconButton(
                                key: const Key('edit_avatar_url'),
                                tooltip: 'Đổi ảnh đại diện',
                                onPressed: _editAvatar,
                                icon: const Icon(
                                  Icons.edit_outlined,
                                  color: Colors.white,
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
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _displayHandle,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      if (!_realSession)
                        const Text(
                          'Gom những ngày bình thường đáng nhớ.',
                          style: TextStyle(
                            fontSize: 13,
                            color: Color(0xFF58534C),
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
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.border),
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
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(
                      color: AppColors.primary,
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

                const Text('Bản xem trước · Bộ sưu tập mẫu'),
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
                        color: AppColors.textPrimary,
                      ),
                    ),
                    GestureDetector(
                      onTap: () =>
                          setState(() => _currentTab = HomeTab.memories),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          Text(
                            AppStrings.seeAll,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                          SizedBox(width: 4),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 14,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
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
                  isOutlined: true,
                  icon: Icons.switch_account_outlined,
                  onPressed: _isLoggingOut || _isDeletingAccount
                      ? null
                      : _switchAccount,
                ),
                const SizedBox(height: 12),
                CustomButton(
                  text: AppStrings.logout,
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
                  backgroundColor: AppColors.error,
                  textColor: AppColors.error,
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
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w500,
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildMemoryMiniCard(String asset, String tag) {
    return Container(
      width: 110,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
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

  Widget _buildSettingRow(
    IconData icon,
    String title,
    String? trailingText,
  ) => Card(
    child: ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: trailingText == null ? null : Text(trailingText),
      trailing: const Icon(Icons.chevron_right, color: AppColors.textSecondary),
    ),
  );
}
