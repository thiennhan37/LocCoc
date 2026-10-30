import 'package:flutter/material.dart';
import '../../auth/data/services/google_sign_in_service.dart';
import '../data/user_api_client.dart';

class ProfileLinkSession extends ChangeNotifier {
  UserApiClient? api;
  GoogleAuthService? auth;
  Map<String, dynamic>? profile;

  void attach(
    UserApiClient client,
    GoogleAuthService service,
    Map<String, dynamic> user,
  ) {
    api = client;
    auth = service;
    profile = user;
    notifyListeners();
  }

  void clear() {
    api = null;
    auth = null;
    profile = null;
    notifyListeners();
  }
}

class ProfileLinkScope extends InheritedWidget {
  final ProfileLinkSession session;
  const ProfileLinkScope({
    super.key,
    required this.session,
    required super.child,
  });
  static ProfileLinkSession? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ProfileLinkScope>()?.session;
  @override
  bool updateShouldNotify(ProfileLinkScope oldWidget) =>
      session != oldWidget.session;
}

const appLinkHost = String.fromEnvironment(
  'APP_LINK_HOST',
  defaultValue: 'loccoc.bus-ticket.xyz',
);

String? profileUsernameFromLink(String value) {
  if (value.contains('%')) return null;
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.hasQuery ||
      uri.hasFragment ||
      uri.userInfo.isNotEmpty) {
    return null;
  }
  if (uri.hasScheme &&
      (uri.scheme != 'https' ||
          uri.host != appLinkHost ||
          (uri.hasPort && uri.port != 443))) {
    return null;
  }
  if (!uri.hasScheme && uri.hasAuthority) return null;
  final path = uri.path;
  if (!RegExp(r'^/[a-zA-Z0-9_]{2,30}$').hasMatch(path)) return null;
  return path.substring(1).toLowerCase();
}
