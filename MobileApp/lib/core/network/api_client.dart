import 'dart:async';
import 'dart:convert';
import 'dart:io';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final int? code;
  const ApiException(this.message, {this.statusCode, this.code});
}

class ApiClient {
  Future<Map<String, dynamic>> request(
    String method,
    Uri uri, {
    Map<String, dynamic>? body,
    String? token,
  }) async {
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10);
    try {
      return await _send(
        client,
        method,
        uri,
        body,
        token,
      ).timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw const ApiException('Kết nối quá lâu. Vui lòng thử lại.');
    } on SocketException {
      throw const ApiException(
        'Không kết nối được máy chủ. Kiểm tra mạng và gateway.',
      );
    } on FormatException {
      throw const ApiException('Phản hồi máy chủ không hợp lệ.');
    } on HttpException {
      throw const ApiException('Kết nối máy chủ bị gián đoạn.');
    } finally {
      client.close(force: true);
    }
  }

  Future<Map<String, dynamic>> _send(
    HttpClient client,
    String method,
    Uri uri,
    Map<String, dynamic>? body,
    String? token,
  ) async {
    final request = await client.openUrl(method, uri);
    request.followRedirects = false;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (token != null) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    }
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
    }
    final response = await request.close();
    final raw = await utf8.decoder.bind(response).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      Map<String, dynamic> error = {};
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) error = decoded;
      } on FormatException {
        /* Error proxies may return HTML. */
      }
      final status = response.statusCode;
      final message = switch (status) {
        401 => 'Thông tin xác thực không hợp lệ hoặc phiên đã hết hạn.',
        403 => 'Bạn không có quyền thực hiện thao tác này.',
        404 => 'Không tìm thấy dữ liệu.',
        429 => 'Thao tác quá nhiều lần. Vui lòng đợi rồi thử lại.',
        >= 500 => 'Máy chủ đang gặp lỗi. Vui lòng thử lại sau.',
        _ => 'Yêu cầu không hợp lệ. Vui lòng kiểm tra dữ liệu.',
      };
      throw ApiException(
        message,
        statusCode: status,
        code: error['code'] is int ? error['code'] as int : null,
      );
    }
    if (response.statusCode == 204) return {};
    final data = jsonDecode(raw);
    if (data is! Map<String, dynamic>) throw const FormatException();
    return data;
  }
}
