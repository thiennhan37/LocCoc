import 'package:flutter/material.dart';
import '../../auth/data/services/google_sign_in_service.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../../auth/presentation/screens/auth_screen.dart';
import '../../auth/presentation/widgets/logout_session_dialog.dart';
import '../../auth/domain/models/auth_session.dart';
import '../../home/presentation/screens/home_screen.dart';
import '../data/user_api_client.dart';
import 'profile_link_session.dart';

class ProfileGate extends StatefulWidget {
  final AuthSession session;
  final GoogleAuthService authService;
  final UserApiClient? userApi;
  final Widget Function(UserApiClient api, Map<String, dynamic> profile)?
  completedBuilder;
  const ProfileGate({
    super.key,
    required this.session,
    required this.authService,
    this.userApi,
    this.completedBuilder,
  });
  @override
  State<ProfileGate> createState() => _ProfileGateState();
}

class _ProfileGateState extends State<ProfileGate> {
  late final api =
      widget.userApi ??
      UserApiClient(
        auth: widget.authService.apiClient,
        session: widget.session,
        onSessionChanged: widget.authService.updateSession,
        refreshSession: widget.authService.refreshSession,
      );
  final username = TextEditingController();
  final displayName = TextEditingController();
  final form = GlobalKey<FormState>();
  Map<String, dynamic>? profile;
  String? error;
  bool loading = true;
  bool saving = false;
  bool leaving = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    username.dispose();
    displayName.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final p = await api.me();
      if (!p.containsKey('username') || p['id'] != widget.session.user.id) {
        throw const FormatException('Invalid profile');
      }
      await widget.authService.vault.profile(api.session.user.id, p);
      if (!mounted) return;
      setState(() {
        profile = p;
        displayName.text = p['displayName'] as String? ?? '';
      });
      if (p['username'] != null) {
        ProfileLinkScope.maybeOf(context)?.attach(api, widget.authService, p);
      }
    } catch (e) {
      if (mounted) setState(() => error = userError(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    if (saving || !(form.currentState?.validate() ?? false)) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await api.claim(username.text, displayName.text);
      await load();
    } catch (e) {
      if (e is AuthApiException && e.code == 'USERNAME_ALREADY_SET') {
        await load();
      } else if (mounted) {
        setState(() => error = userError(e));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!loading && profile?['username'] != null) {
      if (widget.completedBuilder != null) {
        return widget.completedBuilder!(api, profile!);
      }
      return HomeScreen(
        session: api.session,
        googleAuthService: widget.authService,
        profile: profile,
        userApi: api,
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hoàn tất hồ sơ'),
        actions: [
          IconButton(
            tooltip: 'Đăng xuất',
            icon: const Icon(Icons.logout_rounded),
            onPressed: saving || leaving
                ? null
                : () async {
                    setState(() => leaving = true);
                    try {
                      final retain = await chooseLogoutRetention(
                        context,
                        widget.authService,
                        api.session,
                      );
                      if (retain == null || !mounted) return;
                      if (retain) {
                        await widget.authService.leaveRetainingSession(
                          api.session,
                        );
                      } else {
                        await widget.authService.signOut(session: api.session);
                      }
                      if (context.mounted) {
                        ProfileLinkScope.maybeOf(context)?.clear();
                        Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(
                            builder: (_) => AuthScreen(
                              googleAuthService: widget.authService,
                              autoRestore: false,
                            ),
                          ),
                          (_) => false,
                        );
                      }
                    } catch (e) {
                      if (mounted) setState(() => error = userError(e));
                    } finally {
                      if (mounted) setState(() => leaving = false);
                    }
                  },
          ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: loading
                ? const CircularProgressIndicator()
                : profile == null
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(error ?? 'Không thể tải hồ sơ.'),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: load,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  )
                : Form(
                    key: form,
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        const Text(
                          'Chọn username của bạn',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Username chỉ được đặt một lần. Chữ hoa sẽ được chuyển thành chữ thường.',
                        ),
                        const SizedBox(height: 24),
                        TextFormField(
                          key: const Key('username'),
                          controller: username,
                          decoration: const InputDecoration(
                            labelText: 'Username',
                            helperText: '2–30 ký tự: a–z, 0–9, _',
                          ),
                          autocorrect: false,
                          validator: (v) =>
                              RegExp(
                                r'^[a-z0-9_]{2,30}$',
                              ).hasMatch((v ?? '').trim().toLowerCase())
                              ? null
                              : 'Username cần 2–30 ký tự a–z, 0–9 hoặc _.',
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: displayName,
                          maxLength: 255,
                          decoration: const InputDecoration(
                            labelText: 'Tên hiển thị',
                          ),
                        ),
                        if (error != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: saving ? null : save,
                          child: Text(saving ? 'Đang lưu…' : 'Lưu username'),
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
