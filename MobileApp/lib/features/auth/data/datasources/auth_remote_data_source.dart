import 'dart:async';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_response.dart';
import '../models/login_request.dart';
import '../models/register_request.dart';
import '../models/auth_response.dart';

/// Data source interface for Auth Microservice API interactions
abstract class AuthRemoteDataSource {
  Future<ApiResponse<AuthResponse>> login(LoginRequest request);
  Future<ApiResponse<AuthResponse>> register(RegisterRequest request);
}

/// Remote Data Source implementation interfacing with Microservices API
class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  final ApiClient apiClient;

  AuthRemoteDataSourceImpl({required this.apiClient});

  @override
  Future<ApiResponse<AuthResponse>> login(LoginRequest request) async {
    // Simulated remote call with network latency for preview & testing
    await Future.delayed(const Duration(seconds: 1, milliseconds: 500));

    // Simple validation logic simulating auth microservice response
    if (request.identifier.isEmpty || request.password.isEmpty) {
      return ApiResponse.error('Email/SĐT và mật khẩu không được để trống');
    }

    if (request.password.length < 6) {
      return ApiResponse.error('Mật khẩu không chính xác');
    }

    final mockJsonResponse = {
      'accessToken': 'jwt_access_token_loccoc_microservice_demo_123',
      'refreshToken': 'jwt_refresh_token_loccoc_microservice_demo_456',
      'user': {
        'id': 'usr_loccoc_001',
        'fullName': 'Người dùng LocCoc',
        'username': request.identifier.contains('@')
            ? request.identifier.split('@').first
            : 'loccoc_user',
        'email': request.identifier.contains('@')
            ? request.identifier
            : 'user@loccoc.app',
        'phone': '0987654321',
        'avatarUrl': 'https://i.pravatar.cc/300',
      }
    };

    return ApiResponse.success(
      AuthResponse.fromJson(mockJsonResponse),
      message: 'Đăng nhập thành công!',
    );
  }

  @override
  Future<ApiResponse<AuthResponse>> register(RegisterRequest request) async {
    // Simulated remote call to auth-service /v1/auth/register
    await Future.delayed(const Duration(seconds: 1, milliseconds: 500));

    final mockJsonResponse = {
      'accessToken': 'jwt_access_token_loccoc_microservice_demo_789',
      'refreshToken': 'jwt_refresh_token_loccoc_microservice_demo_101',
      'user': {
        'id': 'usr_loccoc_new_${DateTime.now().millisecondsSinceEpoch}',
        'fullName': request.fullName,
        'username': request.username,
        'email': request.email,
        'phone': request.phone,
        'avatarUrl': null,
      }
    };

    return ApiResponse.success(
      AuthResponse.fromJson(mockJsonResponse),
      message: 'Đăng ký tài khoản thành công!',
    );
  }
}
