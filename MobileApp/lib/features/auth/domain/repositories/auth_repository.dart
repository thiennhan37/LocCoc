import '../../../../core/network/api_response.dart';
import '../entities/user_entity.dart';
import '../../data/models/login_request.dart';
import '../../data/models/register_request.dart';
import '../../data/models/auth_response.dart';

/// Abstract Auth Repository interface (Domain Layer)
abstract class AuthRepository {
  Future<ApiResponse<AuthResponse>> login(LoginRequest request);
  Future<ApiResponse<AuthResponse>> register(RegisterRequest request);
  Future<ApiResponse<UserEntity>> getCurrentUser();
  Future<void> logout();
}
