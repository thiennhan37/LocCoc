import '../../users/data/user_api_client.dart';

class NotificationApi {
  final UserApiClient user;
  NotificationApi(this.user);
  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool allowRefresh = true,
  }) => user.request(
    method,
    path,
    area: 'notifications',
    body: body,
    allowRefresh: allowRefresh,
  );
  Future<Map<String, dynamic>> list([String? cursor]) => request(
    'GET',
    '?${Uri(queryParameters: {'limit': '20', 'cursor': ?cursor}).query}',
  );
  Future<Map<String, dynamic>> counts() => request('GET', 'counts');
  Future<Map<String, dynamic>> seen(String cursor) =>
      request('PATCH', 'seen', body: {'seenCursor': cursor});
  Future<Map<String, dynamic>> read(String id) =>
      request('PATCH', '${Uri.encodeComponent(id)}/read');
}
