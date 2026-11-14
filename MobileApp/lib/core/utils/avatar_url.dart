/// Avatar metadata is a URL only. No credentials, local files or inline images.
Uri? avatarUri(String? value, {bool allowHttp = false}) {
  if (value == null || value.length > 1024) return null;
  final text = value.trim();
  if (text.isEmpty || RegExp(r'\s|[\x00-\x1f\x7f]').hasMatch(text)) return null;
  try {
    final uri = Uri.tryParse(text);
    if (uri == null ||
        !uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        uri.hasFragment ||
        (uri.scheme != 'https' && !(allowHttp && uri.scheme == 'http')) ||
        uri.host.isEmpty ||
        uri.host.length > 253 ||
        (uri.hasPort && (uri.port < 1 || uri.port > 65535))) {
      return null;
    }
    final host = uri.host.toLowerCase();
    final dns = RegExp(
      r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$',
    );
    if (!dns.hasMatch(host)) return null;
    return uri;
  } catch (_) {
    return null;
  }
}
