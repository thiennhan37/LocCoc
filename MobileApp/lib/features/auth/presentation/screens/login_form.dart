import 'package:flutter/material.dart';

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

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // TODO(IAM): Connect this form only after the identity API contract exists.
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text(AppStrings.loginUnavailable)));
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
          CustomButton(text: AppStrings.loginButton, onPressed: _submit),
        ],
      ),
    );
  }
}
