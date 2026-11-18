/// Known AuthService rules only. Deployment-specific breached lists stay server-owned.
String? newPasswordError(
  String password,
  String? email, {
  int minimumLength = 10,
}) {
  if (password.length < minimumLength || password.length > 128) {
    return 'Mật khẩu mới cần từ $minimumLength đến 128 ký tự.';
  }
  final normalized = password.trim().toLowerCase();
  const common = [
    'password',
    'password1',
    'qwerty',
    'qwerty123',
    '111111',
    'letmein',
    'welcome',
    'iloveyou',
  ];
  const prefixes = [
    'password',
    'qwerty',
    'letmein',
    'welcome',
    'monkey',
    'dragon',
    'football',
  ];
  if (common.contains(normalized) ||
      prefixes.any(
        (p) => normalized.startsWith(p) && normalized.length <= p.length + 8,
      )) {
    return 'Mật khẩu này quá phổ biến. Hãy chọn mật khẩu khác.';
  }
  if (email != null) {
    final address = email.trim().toLowerCase(),
        local = email.trim().toLowerCase().split('@').first;
    if (normalized == address || (local.length >= 3 && normalized == local)) {
      return 'Mật khẩu không được trùng email hoặc phần tên trước @.';
    }
  }
  return null;
}
