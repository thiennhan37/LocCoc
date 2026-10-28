import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../data/services/auth_api_client.dart';
import '../../data/services/google_sign_in_service.dart';
import '../../domain/models/auth_session.dart';
import '../widgets/auth_header.dart';
import 'login_form.dart';

class AuthScreen extends StatelessWidget {
  final GoogleAuthService? googleAuthService;
  final AuthApiClient? authApiClient;
  final ValueChanged<AuthSession>? onLoginSuccess;

  const AuthScreen({
    super.key,
    this.googleAuthService,
    this.authApiClient,
    this.onLoginSuccess,
  });

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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AuthHeader(),
                  const SizedBox(height: 32),
                  LoginForm(
                    googleAuthService: googleAuthService,
                    authApiClient: authApiClient,
                    onLoginSuccess: onLoginSuccess,
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
