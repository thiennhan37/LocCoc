import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../../core/widgets/custom_text_field.dart';
import '../../data/models/register_request.dart';
import '../../domain/repositories/auth_repository.dart';

class RegisterForm extends StatefulWidget {
  final AuthRepository authRepository;
  final VoidCallback onRegisterSuccess;

  const RegisterForm({
    super.key,
    required this.authRepository,
    required this.onRegisterSuccess,
  });

  @override
  State<RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<RegisterForm> {
  final _formKey = GlobalKey<FormState>();

  final _fullNameController = TextEditingController();
  final _usernameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  final _usernameFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _phoneFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _confirmPasswordFocus = FocusNode();

  bool _agreeToTerms = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _fullNameController.dispose();
    _usernameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();

    _usernameFocus.dispose();
    _emailFocus.dispose();
    _phoneFocus.dispose();
    _passwordFocus.dispose();
    _confirmPasswordFocus.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (!_agreeToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Vui lòng đồng ý với điều khoản dịch vụ để tiếp tục'),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    final request = RegisterRequest(
      fullName: _fullNameController.text.trim(),
      username: _usernameController.text.trim(),
      email: _emailController.text.trim(),
      phone: _phoneController.text.trim(),
      password: _passwordController.text,
    );

    final response = await widget.authRepository.register(request);

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
      widget.onRegisterSuccess();
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
          // Full Name
          CustomTextField(
            label: AppStrings.fullName,
            hint: AppStrings.fullNameHint,
            controller: _fullNameController,
            prefixIcon: Icons.person_outline_rounded,
            nextFocusNode: _usernameFocus,
            validator: (val) {
              if (val == null || val.trim().isEmpty) return AppStrings.requiredField;
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Username
          CustomTextField(
            label: AppStrings.username,
            hint: AppStrings.usernameHint,
            controller: _usernameController,
            focusNode: _usernameFocus,
            nextFocusNode: _emailFocus,
            prefixIcon: Icons.alternate_email_rounded,
            validator: (val) {
              if (val == null || val.trim().isEmpty) return AppStrings.requiredField;
              if (val.trim().length < 3) return 'Username tối thiểu 3 ký tự';
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Email
          CustomTextField(
            label: AppStrings.email,
            hint: AppStrings.emailHint,
            controller: _emailController,
            focusNode: _emailFocus,
            nextFocusNode: _phoneFocus,
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.mail_outline_rounded,
            validator: (val) {
              if (val == null || val.trim().isEmpty) return AppStrings.requiredField;
              final emailRegExp = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
              if (!emailRegExp.hasMatch(val.trim())) return AppStrings.invalidEmail;
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Phone
          CustomTextField(
            label: AppStrings.phone,
            hint: AppStrings.phoneHint,
            controller: _phoneController,
            focusNode: _phoneFocus,
            nextFocusNode: _passwordFocus,
            keyboardType: TextInputType.phone,
            prefixIcon: Icons.phone_outlined,
            validator: (val) {
              if (val == null || val.trim().isEmpty) return AppStrings.requiredField;
              if (val.trim().length < 9) return AppStrings.invalidPhone;
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Password
          CustomTextField(
            label: AppStrings.password,
            hint: AppStrings.passwordHint,
            controller: _passwordController,
            focusNode: _passwordFocus,
            nextFocusNode: _confirmPasswordFocus,
            isPassword: true,
            prefixIcon: Icons.lock_outline_rounded,
            validator: (val) {
              if (val == null || val.isEmpty) return AppStrings.requiredField;
              if (val.length < 6) return AppStrings.passwordTooShort;
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Confirm Password
          CustomTextField(
            label: AppStrings.confirmPassword,
            hint: AppStrings.passwordHint,
            controller: _confirmPasswordController,
            focusNode: _confirmPasswordFocus,
            textInputAction: TextInputAction.done,
            isPassword: true,
            prefixIcon: Icons.lock_reset_rounded,
            validator: (val) {
              if (val == null || val.isEmpty) return AppStrings.requiredField;
              if (val != _passwordController.text) {
                return AppStrings.passwordsDoNotMatch;
              }
              return null;
            },
          ),
          const SizedBox(height: 14),

          // Terms Checkbox
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 24,
                width: 24,
                child: Checkbox(
                  value: _agreeToTerms,
                  activeColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                  onChanged: (value) {
                    setState(() {
                      _agreeToTerms = value ?? true;
                    });
                  },
                ),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  AppStrings.termsAgreement,
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Register Submit Button
          CustomButton(
            text: AppStrings.registerButton,
            isLoading: _isLoading,
            onPressed: _handleRegister,
          ),
        ],
      ),
    );
  }
}
