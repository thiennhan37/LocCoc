import 'dart:async';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../../../core/widgets/custom_text_field.dart';
import '../../data/services/auth_api_client.dart';
import '../../domain/password_policy.dart';
import 'verify_email_screen.dart';

class RegistrationScreen extends StatefulWidget {
  final AuthApiClient api;
  final String initialEmail;
  const RegistrationScreen({
    super.key,
    required this.api,
    this.initialEmail = '',
  });
  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await widget.api.registerWithEmail(
        email: _email.text,
        password: _password.text,
      );
      if (!mounted) return;
      _password.clear();
      _confirmation.clear();
      final verified = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) =>
              VerifyEmailScreen(api: widget.api, challenge: challenge),
        ),
      );
      if (!mounted) return;
      if (verified == true) Navigator.of(context).pop(challenge.email);
    } on AuthApiException catch (error) {
      if (!mounted) return;
      setState(
        () => _error = switch (error.statusCode) {
          400 ||
          422 => 'Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra lại.',
          409 =>
            'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Hãy chọn mật khẩu khác.',
          429 =>
            'Bạn yêu cầu quá nhanh. Vui lòng thử lại sau ${error.retryAfter?.inSeconds ?? 60} giây.',
          _ => 'Chưa thể gửi yêu cầu đăng ký. Vui lòng thử lại.',
        },
      );
    } on TimeoutException {
      if (mounted) {
        setState(
          () => _error = 'Kết nối hết thời gian chờ. Vui lòng thử đăng ký lại.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Chưa thể kết nối máy chủ. Kiểm tra mạng và thử lại.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Đăng ký tài khoản')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _form,
              child: AbsorbPointer(
                absorbing: _busy,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Tạo tài khoản LocCoc',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Đăng ký bằng email của bạn. Chúng tôi sẽ gửi mã OTP để xác thực.',
                    ),
                    const SizedBox(height: 24),
                    CustomTextField(
                      label: 'Email',
                      hint: 'Nhập email của bạn',
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      prefixIcon: Icons.alternate_email_rounded,
                      validator: (value) =>
                          RegExp(
                            r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                          ).hasMatch(value?.trim() ?? '')
                          ? null
                          : 'Vui lòng nhập email hợp lệ.',
                    ),
                    const SizedBox(height: 16),
                    CustomTextField(
                      label: 'Mật khẩu',
                      hint: 'Từ 6 đến 128 ký tự',
                      controller: _password,
                      isPassword: true,
                      prefixIcon: Icons.lock_outline_rounded,
                      validator: (value) => newPasswordError(
                        value ?? '',
                        _email.text,
                        minimumLength: 6,
                      )?.replaceFirst('Mật khẩu mới', 'Mật khẩu'),
                    ),
                    const SizedBox(height: 16),
                    CustomTextField(
                      label: 'Xác nhận mật khẩu',
                      hint: 'Nhập lại mật khẩu',
                      controller: _confirmation,
                      isPassword: true,
                      textInputAction: TextInputAction.done,
                      validator: (value) =>
                          value == _password.text &&
                              (value?.isNotEmpty ?? false)
                          ? null
                          : 'Mật khẩu xác nhận chưa khớp.',
                    ),
                    const SizedBox(height: 16),
                    if (_error != null) ...[
                      Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    CustomButton(
                      text: 'Tạo tài khoản',
                      isLoading: _busy,
                      onPressed: _busy ? null : _register,
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: const Text('Đã có tài khoản? Đăng nhập'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
