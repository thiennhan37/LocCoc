import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/screens/auth_screen.dart';
import 'features/auth/data/services/google_sign_in_service.dart';
import 'features/auth/domain/models/auth_session.dart';
import 'features/home/presentation/screens/home_screen.dart';
import 'features/users/data/user_api_client.dart';
import 'features/users/presentation/profile_gate.dart';
import 'features/users/presentation/profile_link_session.dart';
import 'features/users/presentation/username_profile_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LocCocApp());
}

class LocCocApp extends StatefulWidget {
  final ProfileLinkSession? linkSession;
  const LocCocApp({super.key, this.linkSession});
  @override
  State<LocCocApp> createState() => _LocCocAppState();
}

class _LocCocAppState extends State<LocCocApp> {
  late final links = widget.linkSession ?? ProfileLinkSession();
  @override
  void dispose() {
    if (widget.linkSession == null) links.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ProfileLinkScope(
      session: links,
      child: MaterialApp(
        title: 'LocCoc',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        onGenerateRoute: (settings) {
          final name = settings.name ?? '/';
          final username = profileUsernameFromLink(name);
          return MaterialPageRoute(
            settings: settings,
            builder: (_) {
              if (name == '/') {
                return AnimatedBuilder(
                  animation: links,
                  builder: (_, _) {
                    final api = links.api;
                    return api == null
                        ? const AuthScreen()
                        : HomeScreen(
                            session: api.session,
                            googleAuthService: links.auth,
                            profile: links.profile,
                            userApi: api,
                          );
                  },
                );
              }
              if (username != null) {
                return _ProfileLinkEntry(username: username, links: links);
              }
              return Scaffold(
                appBar: AppBar(title: const Text('Liên kết không hợp lệ')),
                body: const Center(child: Text('Không tìm thấy trang.')),
              );
            },
          );
        },
      ),
    );
  }
}

class _ProfileLinkEntry extends StatefulWidget {
  final String username;
  final ProfileLinkSession links;
  const _ProfileLinkEntry({required this.username, required this.links});
  @override
  State<_ProfileLinkEntry> createState() => _ProfileLinkEntryState();
}

class _ProfileLinkEntryState extends State<_ProfileLinkEntry> {
  AuthSession? signedIn;
  late final auth = widget.links.auth ?? GoogleAuthService();
  UserApiClient? api;
  @override
  Widget build(BuildContext context) {
    if (signedIn != null) {
      return ProfileGate(
        session: signedIn!,
        authService: auth,
        userApi: api,
        completedBuilder: (client, _) =>
            UsernameProfileScreen(username: widget.username, api: client),
      );
    }
    final current = widget.links.api;
    if (current != null) {
      return UsernameProfileScreen(username: widget.username, api: current);
    }
    return AuthScreen(
      googleAuthService: auth,
      onLoginSuccess: (session) {
        if (session.accessToken.startsWith('demo-')) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Hãy đăng nhập tài khoản thật để xem hồ sơ này.'),
            ),
          );
          return;
        }
        setState(() {
          signedIn = session;
          api = UserApiClient(
            auth: auth.apiClient,
            session: session,
            onSessionChanged: auth.updateSession,
          );
        });
      },
    );
  }
}
