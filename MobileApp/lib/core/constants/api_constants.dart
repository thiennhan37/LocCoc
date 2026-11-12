class ApiConstants {
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080',
  );
  static const registerPath = '/auth/register';
  static const loginPath = '/auth/login';
  static const verifyOtpPath = '/auth/verify-otp';
  static const resendOtpPath = '/auth/resend-otp';
  static const refreshPath = '/auth/refresh';
  static const logoutPath = '/auth/logout';
  static const logoutAllPath = '/auth/logout-all';
  static const changePasswordPath = '/auth/change-password';
  static const postsPath = '/posts';
  static const photoPostsPath = '/posts/photos';
  static Uri get login => Uri.parse(baseUrl).resolve(loginPath);
}
