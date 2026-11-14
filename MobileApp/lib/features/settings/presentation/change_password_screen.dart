import 'package:flutter/material.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../../auth/domain/models/account_security.dart';
import '../../auth/domain/password_policy.dart';
import '../../users/data/user_api_client.dart';

class ChangePasswordScreen extends StatefulWidget {
  final UserApiClient account;
  const ChangePasswordScreen({super.key, required this.account});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final form = GlobalKey<FormState>();
  final current = TextEditingController(),
      next = TextEditingController(),
      confirm = TextEditingController();
  bool busy = false, uncertain = false, completed = false;
  String? error;
  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy ||
        uncertain ||
        completed ||
        !(form.currentState?.validate() ?? false)) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.account.changePassword(
        current.text,
        next.text,
      );
      if (!mounted ||
          widget.account.coordinator?.generation != result.generation) {
        return;
      }
      current.clear();
      next.clear();
      confirm.clear();
      setState(() {
        completed = true;
        error = result.notice;
      });
    } catch (e) {
      if (!mounted || !widget.account.isCurrent) return;
      setState(() {
        uncertain = e is PasswordChangeUncertainException;
        error = switch (e) {
          PasswordChangeUncertainException() =>
            'Chưa xác định được kết quả đổi mật khẩu. Đừng gửi lại yêu cầu này. Hãy đăng nhập lại để kiểm tra mật khẩu mới.',
          SessionProbeUnavailableException() =>
            'Chưa kiểm tra được trạng thái phiên. Hãy kiểm tra kết nối và thử lại.',
          AccountSecurityBusyException() =>
            'Một thao tác bảo mật khác đang chạy. Hãy chờ rồi thử lại.',
          AuthApiException(statusCode: 401) =>
            'Mật khẩu hiện tại chưa đúng. Nếu chỉ đăng nhập Google và chưa có mật khẩu, bạn chưa thể dùng thao tác này.',
          AuthApiException(statusCode: 409) =>
            'Mật khẩu chưa đáp ứng chính sách máy chủ. Hãy chọn mật khẩu ít phổ biến hơn, không trùng email.',
          AuthApiException(statusCode: 403) =>
            'Tài khoản hiện không được phép đổi mật khẩu.',
          AuthApiException(statusCode: 400 || 422) =>
            'Thông tin mật khẩu chưa hợp lệ. Hãy kiểm tra lại các trường.',
          _ => userError(e),
        };
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Đổi mật khẩu')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Đổi mật khẩu sẽ đăng xuất các phiên cũ trên mọi thiết bị. Thiết bị này tiếp tục bằng phiên mới nếu thao tác thành công.',
              ),
              const SizedBox(height: 12),
              const Text(
                'Nếu chỉ dùng Google và chưa từng có mật khẩu, hãy tiếp tục đăng nhập Google. Chức năng đặt mật khẩu đầu tiên chưa được hỗ trợ.',
              ),
              const SizedBox(height: 12),
              const Text(
                'Mật khẩu mới cần 10–128 ký tự, không trùng email hoặc tên trước @, không dùng mật khẩu phổ biến. Máy chủ có thể từ chối thêm các mật khẩu trong danh sách bảo vệ.',
              ),
              const SizedBox(height: 24),
              TextFormField(
                key: const Key('current_password'),
                controller: current,
                obscureText: true,
                enabled: !busy && !uncertain && !completed,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(
                  labelText: 'Mật khẩu hiện tại',
                ),
                validator: (v) => v == null || v.isEmpty || v.length > 128
                    ? 'Nhập mật khẩu hiện tại (1–128 ký tự).'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: const Key('new_password'),
                controller: next,
                obscureText: true,
                enabled: !busy && !uncertain && !completed,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'Mật khẩu mới'),
                validator: (v) => newPasswordError(
                  v ?? '',
                  widget.account.session.user.email,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: const Key('confirm_new_password'),
                controller: confirm,
                obscureText: true,
                enabled: !busy && !uncertain && !completed,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(
                  labelText: 'Nhập lại mật khẩu mới',
                ),
                validator: (v) => v != next.text || (v ?? '').isEmpty
                    ? 'Mật khẩu nhập lại chưa khớp.'
                    : null,
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(error!),
                ),
              FilledButton(
                key: const Key('submit_change_password'),
                onPressed: busy || uncertain || completed ? null : save,
                child: Text(busy ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu'),
              ),
              if (uncertain)
                OutlinedButton(
                  key: const Key('password_reauthenticate'),
                  onPressed: busy
                      ? null
                      : () async {
                          setState(() => busy = true);
                          try {
                            await widget.account.reauthenticate();
                          } catch (_) {
                          } finally {
                            if (mounted) setState(() => busy = false);
                          }
                        },
                  child: const Text('Đăng nhập lại'),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}
