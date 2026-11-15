String notificationActorLabel(Map<String, dynamic>? actor) {
  final name = actor?['displayName'];
  if (name is String && name.trim().isNotEmpty) return name.trim();
  final username = actor?['username'];
  if (username is String && username.trim().isNotEmpty) {
    return '@${username.trim().replaceFirst(RegExp(r'^@'), '')}';
  }
  return 'Một người dùng';
}

String localNotificationTime(Object? timestamp) {
  if (timestamp is! String || timestamp.length > 100) {
    return 'Chưa rõ thời gian';
  }
  final date = DateTime.tryParse(timestamp)?.toLocal();
  if (date == null) return 'Chưa rõ thời gian';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(date.hour)}:${two(date.minute)} · ${two(date.day)}/${two(date.month)}/${date.year}';
}
