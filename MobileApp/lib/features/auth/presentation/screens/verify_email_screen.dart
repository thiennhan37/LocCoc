import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/widgets/custom_button.dart';
import '../../data/services/auth_api_client.dart';
import '../../domain/models/registration_challenge.dart';

class VerifyEmailScreen extends StatefulWidget {
  final AuthApiClient api;
  final RegistrationChallenge challenge;
  final DateTime Function()? now;
  const VerifyEmailScreen({
    super.key,
    required this.api,
    required this.challenge,
    this.now,
  });
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  final _form = GlobalKey<FormState>();
  final _otp = TextEditingController();
  Timer? _timer;
  late DateTime _nextResendAt;
  bool _busy = false;
  String? _error;
  String? _notice;
  DateTime get _now => widget.now?.call() ?? DateTime.now();
  int get _seconds =>
      ((_nextResendAt.difference(_now).inMilliseconds / 1000).ceil()).clamp(
        0,
        3600,
      );

  @override
  void initState() {
    super.initState();
    _nextResendAt = _now.add(widget.challenge.retryAfter);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _otp.dispose();
    super.dispose();
  }

  void _failure(Object error) {
    if (!mounted) return;
    setState(() {
      if (error is AuthApiException && error.statusCode == 429) {
        final wait = error.retryAfter ?? const Duration(seconds: 60);
        _nextResendAt = _now.add(wait);
        _error =
            'Bạn thao tác quá nhanh. Vui lòng thử lại sau ${wait.inSeconds} giây.';
      } else if (error is AuthApiException && error.statusCode == 400) {
        _error =
            'Yêu cầu xác thực không hợp lệ. Hãy quay lại đăng ký nếu yêu cầu đã hết hạn.';
      } else {
        _error = 'Chưa thể kết nối để xác thực. Kiểm tra mạng và thử lại.';
      }
    });
  }

  Future<void> _verify() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final verified = await widget.api.verifyRegistrationOtp(
        widget.challenge,
        _otp.text,
      );
      if (!mounted) return;
      if (verified) {
        Navigator.of(context).pop(true);
      } else {
        setState(
          () => _error =
              'Mã OTP không đúng, đã hết hạn hoặc đã được sử dụng. Kiểm tra mã yêu cầu hoặc gửi lại mã.',
        );
      }
    } catch (error) {
      _failure(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    if (_busy || _seconds > 0) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final wait = await widget.api.resendRegistrationOtp(widget.challenge);
      if (!mounted) return;
      _otp.clear();
      setState(() {
        _nextResendAt = _now.add(wait);
        _notice =
            'Đã yêu cầu mã mới. Nếu đăng ký còn hiệu lực, email sẽ sớm được gửi. Mã cũ sẽ không còn dùng được.';
      });
    } catch (error) {
      _failure(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Xác thực email')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.mark_email_unread_outlined,
                    size: 64,
                    color: AppColors.primary,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Kiểm tra hộp thư của bạn',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Nếu email chưa có tài khoản, mã OTP gồm 6 chữ số sẽ được gửi đến ${widget.challenge.email}. Kiểm tra cả thư mục Spam.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Mã yêu cầu: ${widget.challenge.registrationId.substring(0, 8)} · OTP có hiệu lực ${widget.challenge.expiresIn.inMinutes} phút.',
                  ),
                  const SizedBox(height: 24),
                  TextFormField(
                    key: const Key('registration_otp'),
                    controller: _otp,
                    enabled: !_busy,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    decoration: const InputDecoration(
                      labelText: 'Mã OTP',
                      hintText: 'Nhập 6 chữ số',
                    ),
                    onFieldSubmitted: (_) => _verify(),
                    validator: (value) =>
                        RegExp(r'^\d{6}$').hasMatch(value ?? '')
                        ? null
                        : 'Nhập đủ 6 chữ số OTP.',
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
                  if (_notice != null) ...[
                    Text(_notice!),
                    const SizedBox(height: 16),
                  ],
                  CustomButton(
                    text: 'Xác thực OTP',
                    isLoading: _busy,
                    onPressed: _busy ? null : _verify,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy || _seconds > 0 ? null : _resend,
                    child: Text(
                      _seconds > 0
                          ? 'Gửi lại mã sau ${_seconds}s'
                          : 'Gửi lại mã OTP',
                    ),
                  ),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).pop(false),
                    child: const Text('Đổi email hoặc đăng ký lại'),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Đã có tài khoản? Quay lại màn hình đăng nhập.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
