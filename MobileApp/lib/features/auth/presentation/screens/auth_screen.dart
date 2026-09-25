import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/network/api_client.dart';
import '../../data/datasources/auth_remote_data_source.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';
import '../widgets/auth_header.dart';
import '../widgets/auth_toggle.dart';
import 'login_form.dart';
import 'register_form.dart';

class AuthScreen extends StatefulWidget {
  final AuthRepository? authRepository;

  const AuthScreen({
    super.key,
    this.authRepository,
  });

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  late final AuthRepository _authRepository;
  bool _isLogin = true;

  @override
  void initState() {
    super.initState();
    // Default repository wired to microservice API client if not injected
    _authRepository = widget.authRepository ??
        AuthRepositoryImpl(
          remoteDataSource: AuthRemoteDataSourceImpl(
            apiClient: ApiClient(),
          ),
        );
  }

  void _onAuthSuccess() {
    // Show success dialog or navigate to LocCoc Feed Screen
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(28.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                color: AppColors.primarySoft,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_circle_rounded,
                color: AppColors.primary,
                size: 36,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Chào mừng bạn đến với LocCoc!',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Tài khoản của bạn đã được xác thực qua Auth Microservice. Bắt đầu chia sẻ khoảnh khắc với bạn bè ngay hôm nay!',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Bắt đầu ngay',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),

              // LocCoc Brand Header
              const AuthHeader(),

              const SizedBox(height: 28),

              // Login / Register Segmented Switcher
              AuthToggle(
                isLogin: _isLogin,
                onToggle: (isLoginSelected) {
                  setState(() {
                    _isLogin = isLoginSelected;
                  });
                },
              ),

              const SizedBox(height: 24),

              // Animated Transition between Login & Register Forms
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                transitionBuilder: (Widget child, Animation<double> animation) {
                  return FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.0, 0.05),
                        end: Offset.zero,
                      ).animate(animation),
                      child: child,
                    ),
                  );
                },
                child: _isLogin
                    ? LoginForm(
                        key: const ValueKey('login_form'),
                        authRepository: _authRepository,
                        onLoginSuccess: _onAuthSuccess,
                      )
                    : RegisterForm(
                        key: const ValueKey('register_form'),
                        authRepository: _authRepository,
                        onRegisterSuccess: _onAuthSuccess,
                      ),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
