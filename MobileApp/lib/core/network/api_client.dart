import 'dart:async';
import 'api_response.dart';

/// Microservice API Client interface
/// Configured to communicate with LocCoc Microservices API Gateway
class ApiClient {
  final String baseUrl;
  final Map<String, String> defaultHeaders;

  ApiClient({
    this.baseUrl = 'https://api.loccoc.app/v1',
    this.defaultHeaders = const {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  /// Abstract POST method for Microservices endpoints
  Future<ApiResponse<Map<String, dynamic>>> post(
    String endpoint, {
    required Map<String, dynamic> body,
    Map<String, String>? headers,
  }) async {
    // In production, use http package or dio:
    // final response = await http.post(Uri.parse('$baseUrl$endpoint'), ...);
    
    // Abstracted for microservices contract compatibility
    return ApiResponse.success({
      'endpoint': endpoint,
      'processedAt': DateTime.now().toIso8601String(),
    });
  }
}
