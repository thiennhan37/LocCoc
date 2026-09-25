import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../../core/widgets/custom_text_field.dart';
import '../../../../core/widgets/social_button.dart';
import '../../data/models/login_request.dart';
import '../../domain/repositories/auth_repository.dart';

class LoginForm extends StatefulWidget {
  final AuthRepository authRepository;
  final VoidCallback onLoginSuccess;

  const LoginForm({
    super.key,
    required this.authRepository,
    required this.onLoginSuccess,
  });

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();

  final _passwordFocusNode = FocusNode();

  bool _rememberMe = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _isLoading = true;
    });

    final request = LoginRequest(
      identifier: _identifierController.text.trim(),
      password: _passwordController.text,
      rememberMe: _rememberMe,
    );

    final response = await widget.authRepository.login(request);

    if (!mounted) return;

    setState(() {
      _isLoading = false;
    });

    if (response.success && response.data != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(response.message),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      widget.onLoginSuccess();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(response.message),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Email/Phone input field
          CustomTextField(
            label: AppStrings.emailOrPhone,
            hint: AppStrings.emailOrPhoneHint,
            controller: _identifierController,
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.alternate_email_rounded,
            nextFocusNode: _passwordFocusNode,
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return AppStrings.requiredField;
              }
              return null;
            },
          ),
          const SizedBox(height: 16),

          // Password input field
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
          const SizedBox(height: 12),

          // Remember Me & Forgot Password
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  SizedBox(
                    height: 24,
                    width: 24,
                    child: Checkbox(
                      value: _rememberMe,
                      activeColor: AppColors.primary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6),
                      ),
                      onChanged: (value) {
                        setState(() {
                          _rememberMe = value ?? true;
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    AppStrings.rememberMe,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Chức năng khôi phục mật khẩu đang được xử lý...'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                child: const Text(
                  AppStrings.forgotPassword,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Submit Button
          CustomButton(
            text: AppStrings.loginButton,
            isLoading: _isLoading,
            onPressed: _handleLogin,
          ),
          const SizedBox(height: 24),

          // Divider
          Row(
            children: const [
              Expanded(child: Divider(color: AppColors.border)),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  AppStrings.orContinueWith,
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              Expanded(child: Divider(color: AppColors.border)),
            ],
          ),
          const SizedBox(height: 20),

          // Social Buttons
          Row(
            children: [
              SocialButton(
                label: AppStrings.google,
                icon: Image.network(
                  'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg',
                  width: 20,
                  height: 20,
                  errorBuilder: (_, __, ___) => const Icon(
                    Icons.g_mobiledata_rounded,
                    size: 24,
                    color: Colors.red,
                  ),
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Đăng nhập Google qua Auth Microservice'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              ),
              const SizedBox(width: 12),
              SocialButton(
                label: AppStrings.apple,
                icon: const Icon(
                  Icons.apple,
                  size: 22,
                  color: AppColors.textPrimary,
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Đăng nhập Apple qua Auth Microservice'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
