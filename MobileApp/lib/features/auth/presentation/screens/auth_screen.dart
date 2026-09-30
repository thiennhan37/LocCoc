import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../widgets/auth_header.dart';
import 'login_form.dart';

class AuthScreen extends StatelessWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [AuthHeader(), SizedBox(height: 32), LoginForm()],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
