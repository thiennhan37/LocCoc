/// Generic API Response wrapper for microservices communication
class ApiResponse<T> {
  final bool success;
  final String message;
  final T? data;
  final int? statusCode;

  ApiResponse({
    required this.success,
    required this.message,
    this.data,
    this.statusCode,
  });

  factory ApiResponse.success(T data, {String message = 'Success', int statusCode = 200}) {
    return ApiResponse(
      success: true,
      message: message,
      data: data,
      statusCode: statusCode,
    );
  }

  factory ApiResponse.error(String message, {int statusCode = 400}) {
    return ApiResponse(
      success: false,
      message: message,
      data: null,
      statusCode: statusCode,
    );
  }
}
