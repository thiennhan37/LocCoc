import 'dart:typed_data';
import '../../users/data/user_api_client.dart';

const momentsEnabled = bool.fromEnvironment(
  'MOMENTS_ENABLED',
  defaultValue: true,
);

class MomentApi {
  final UserApiClient user;
  MomentApi(this.user);
  bool get isCurrent => user.isCurrent;
  Future<Map<String, dynamic>> list({String? cursor}) => user.request(
    'GET',
    cursor == null
        ? '?limit=20'
        : '?limit=20&cursor=${Uri.encodeQueryComponent(cursor)}',
    area: 'moments',
  );
  Future<Map<String, dynamic>> search(
    String query, {
    String? place,
    DateTime? from,
    DateTime? to,
  }) => user.request(
    'POST',
    'search',
    area: 'moments',
    body: {
      'query': query.trim(),
      'limit': 50,
      if (place != null && place.trim().isNotEmpty) 'place': place.trim(),
      if (from != null) 'dateFrom': from.toUtc().toIso8601String(),
      if (to != null) 'dateTo': to.toUtc().toIso8601String(),
    },
  );
  Future<Map<String, dynamic>> create(
    String caption,
    String place,
    DateTime capturedAt,
  ) => user.request(
    'POST',
    '',
    area: 'moments',
    body: {
      'caption': caption.trim(),
      'place': place.trim(),
      'capturedAt': capturedAt.toUtc().toIso8601String(),
    },
  );
  Future<Map<String, dynamic>> upload(
    String id,
    Uint8List bytes,
    String mime,
  ) => user.uploadMoment(id, bytes, mime);
  Future<Uint8List> image(String id) => user.momentImage(id);
  Future<Map<String, dynamic>> get(String id) =>
      user.request('GET', id, area: 'moments');
  Future<void> remove(String id) async {
    await user.request('DELETE', id, area: 'moments');
  }

  Future<void> retry(String id) async {
    await user.request('POST', '$id/retry-index', area: 'moments');
  }
}
