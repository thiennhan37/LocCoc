import 'dart:convert';

/// Untrusted display data only: never use claims to authorize or validate a session.
Map<String, dynamic>? inspectJwt(String token) {
  if (token.isEmpty || token.length > 16384 || token.startsWith('demo-')) {
    return null;
  }
  try {
    final parts = token.split('.');
    if (parts.length != 3 ||
        parts.any((part) => part.isEmpty) ||
        parts[1].length > 8192 ||
        !parts.every((part) => RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(part))) {
      return null;
    }
    final bytes = base64Url.decode(base64Url.normalize(parts[1]));
    if (bytes.length > 6144) return null;
    final decoded = jsonDecode(utf8.decode(bytes));
    return decoded is Map<String, dynamic> && decoded.length <= 100
        ? _safeClaims(decoded, 0) as Map<String, dynamic>
        : null;
  } catch (_) {
    return null;
  }
}

Object? _safeClaims(Object? value, int depth) {
  if (depth > 6) return '[giới hạn độ sâu]';
  if (value is String) {
    return value.length > 512 ? '${value.substring(0, 512)}…' : value;
  }
  if (value is List) {
    return value.take(100).map((v) => _safeClaims(v, depth + 1)).toList();
  }
  if (value is Map<String, dynamic>) {
    return value.map(
      (key, item) => MapEntry(
        key,
        RegExp(
              r'token|password|secret|credential|authorization',
              caseSensitive: false,
            ).hasMatch(key)
            ? '[đã che]'
            : _safeClaims(item, depth + 1),
      ),
    );
  }
  return value;
}
