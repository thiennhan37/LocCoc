import 'package:flutter/material.dart';
import '../../data/auth_api.dart';

import '../../../../core/constants/app_strings.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../../core/widgets/custom_text_field.dart';

class LoginForm extends StatefulWidget {
  const LoginForm({super.key});

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _api = AuthApi();
  bool _isLoading = false;
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocusNode = FocusNode();

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isLoading) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _isLoading = true);
    try {
      await _api.login(_identifierController.text, _passwordController.text);
      if (!mounted) return;
      _passwordController.clear();
      Navigator.of(context).pushReplacementNamed('/home');
    } catch (error) {
      if (!mounted) return;
      final message = error is AuthException
          ? error.message
          : 'Đăng nhập thất bại. Vui lòng thử lại.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _isLoading = false);
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
            label: 'Email',
            hint: 'Nhập email',
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
            onPressed: _submit,
            isLoading: _isLoading,
          ),
        ],
      ),
    );
  }
}
