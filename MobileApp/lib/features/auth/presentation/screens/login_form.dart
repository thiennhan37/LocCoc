import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../../core/widgets/custom_text_field.dart';
import '../../../home/presentation/screens/home_screen.dart';
import '../../data/services/auth_api_client.dart';
import '../../data/services/google_sign_in_service.dart';
import '../../domain/models/auth_result.dart';
import '../../domain/models/auth_session.dart';
import '../widgets/auth_divider.dart';
import '../widgets/google_sign_in_button.dart';

class LoginForm extends StatefulWidget {
  final GoogleAuthService? googleAuthService;
  final AuthApiClient? authApiClient;
  final ValueChanged<AuthSession>? onLoginSuccess;

  const LoginForm({
    super.key,
    this.googleAuthService,
    this.authApiClient,
    this.onLoginSuccess,
  });

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocusNode = FocusNode();

  bool _isLoading = false;
  bool _isGoogleLoading = false;

  late final GoogleAuthService _googleAuthService =
      widget.googleAuthService ?? GoogleAuthService();
  late final AuthApiClient _apiClient =
      widget.authApiClient ?? _googleAuthService.apiClient;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  void _onSuccess(AuthSession session, [String? message]) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppColors.success,
        content: Text(
          message ??
              '${AppStrings.googleLoginSuccess} (${session.user.email ?? session.user.id})',
        ),
      ),
    );
    if (widget.onLoginSuccess != null) {
      widget.onLoginSuccess!(session);
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            session: session,
            googleAuthService: _googleAuthService,
          ),
        ),
      );
    }
  }

  void _enterDemoSession([String? email]) {
    final effectiveEmail = (email != null && email.isNotEmpty)
        ? email
        : 'minhanh@loccoc.vn';
    final demoSession = AuthSession(
      authenticated: true,
      accessToken: 'demo-access-token-jwt-loccoc-preview',
      refreshToken: 'demo-refresh-token-preview',
      tokenType: 'Bearer',
      expiresIn: 3600,
      refreshExpiresIn: 86400,
      user: AuthUser(
        id: 'acc-demo-minhanh',
        email: effectiveEmail,
        role: 'user',
        status: 'active',
        emailVerifiedAt: '2026-10-27T08:00:00Z',
      ),
    );
    _onSuccess(demoSession, 'Chào mừng đến với LocCoc!');
  }

  Future<void> _submit() async {
    if (_isLoading || _isGoogleLoading) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _isLoading = true);
    final email = _identifierController.text.trim();
    final password = _passwordController.text;

    try {
      final result = await _apiClient.loginWithPassword(
        email: email,
        password: password,
      );
      if (!mounted) return;

      switch (result) {
        case AuthSuccess(:final session):
          _onSuccess(session, 'Đăng nhập thành công!');
        case AuthCancelled():
          break;
        case AuthFailure(:final message):
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: AppColors.error,
              content: Text(message),
              action: SnackBarAction(
                label: 'Vào Demo',
                textColor: Colors.white,
                onPressed: () => _enterDemoSession(email),
              ),
            ),
          );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          content: Text('Không thể kết nối máy chủ: ${e.toString()}'),
          action: SnackBarAction(
            label: 'Vào Demo',
            textColor: Colors.white,
            onPressed: () => _enterDemoSession(email),
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    if (_isLoading || _isGoogleLoading) return;
    setState(() => _isGoogleLoading = true);
    try {
      final result = await _googleAuthService.signInWithGoogle();
      if (!mounted) return;

      switch (result) {
        case AuthSuccess(:final session):
          _onSuccess(session);
        case AuthCancelled():
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text(AppStrings.googleLoginCancelled)),
          );
        case AuthFailure(:final message):
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(backgroundColor: AppColors.error, content: Text(message)),
          );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          content: Text('${AppStrings.googleLoginFailed}: ${e.toString()}'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isGoogleLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CustomTextField(
            label: AppStrings.emailOrPhone,
            hint: AppStrings.emailOrPhoneHint,
            controller: _identifierController,
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.alternate_email_rounded,
            nextFocusNode: _passwordFocusNode,
            validator: (value) => value == null || value.trim().isEmpty
                ? AppStrings.requiredField
                : null,
          ),
          const SizedBox(height: 16),
          CustomTextField(
            label: AppStrings.password,
            hint: AppStrings.passwordHint,
            controller: _passwordController,
            isPassword: true,
            prefixIcon: Icons.lock_outline_rounded,
            focusNode: _passwordFocusNode,
            textInputAction: TextInputAction.done,
            validator: (value) {
              if (value == null || value.isEmpty) {
                return AppStrings.requiredField;
              }
              if (value.length < 6) {
                return AppStrings.passwordTooShort;
              }
              return null;
            },
          ),
          const SizedBox(height: 24),
          CustomButton(
            text: AppStrings.loginButton,
            isLoading: _isLoading,
            onPressed: (_isLoading || _isGoogleLoading) ? null : _submit,
          ),
          const SizedBox(height: 24),
          const AuthDivider(),
          const SizedBox(height: 24),
          GoogleSignInButton(
            onPressed: (_isLoading || _isGoogleLoading)
                ? null
                : _handleGoogleSignIn,
            isLoading: _isGoogleLoading,
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton.icon(
              icon: const Icon(
                Icons.play_circle_outline_rounded,
                size: 16,
                color: AppColors.primary,
              ),
              label: const Text(
                'Khám phá ngay (Tài khoản thử nghiệm)',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
              onPressed: (_isLoading || _isGoogleLoading)
                  ? null
                  : () => _enterDemoSession(_identifierController.text.trim()),
            ),
          ),
        ],
      ),
    );
  }
}
