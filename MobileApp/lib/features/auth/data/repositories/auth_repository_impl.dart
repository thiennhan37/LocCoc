import '../../../../core/network/api_response.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_data_source.dart';
import '../models/login_request.dart';
import '../models/register_request.dart';
import '../models/auth_response.dart';

/// Implementation of Auth Repository
class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource remoteDataSource;

  AuthRepositoryImpl({required this.remoteDataSource});

  @override
  Future<ApiResponse<AuthResponse>> login(LoginRequest request) {
    return remoteDataSource.login(request);
  }

  @override
  Future<ApiResponse<AuthResponse>> register(RegisterRequest request) {
    return remoteDataSource.register(request);
  }

  @override
  Future<ApiResponse<UserEntity>> getCurrentUser() async {
    // Fetch profile from microservice /v1/users/me
    throw UnimplementedError();
  }

  @override
  Future<void> logout() async {
    // Clear stored JWT tokens
  }
}
