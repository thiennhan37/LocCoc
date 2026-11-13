// ignore_for_file: deprecated_member_use
// FCM Admin SDK 13 targets registration tokens; FID migration is a separate API change.
import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'notification_api.dart';

const pushEnabled = bool.fromEnvironment('FCM_ENABLED');
FirebaseOptions get pushOptions => const FirebaseOptions(
  apiKey: String.fromEnvironment('FCM_API_KEY'),
  appId: String.fromEnvironment('FCM_APP_ID'),
  messagingSenderId: String.fromEnvironment('FCM_SENDER_ID'),
  projectId: String.fromEnvironment('FCM_PROJECT_ID'),
  iosBundleId: String.fromEnvironment(
    'FCM_IOS_BUNDLE_ID',
    defaultValue: 'com.example.mobileApp',
  ),
);
@pragma('vm:entry-point')
Future<void> backgroundPush(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: pushOptions);
  // The OS presents the notification payload; do not mark inbox items read here.
}

class PushNotifications {
  static RemoteMessage? pending;
  static bool ready = false;
  static Future<void> initialize() async {
    if (!pushEnabled ||
        kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      return;
    }
    try {
      await Firebase.initializeApp(options: pushOptions);
      FirebaseMessaging.onBackgroundMessage(backgroundPush);
      pending = await FirebaseMessaging.instance.getInitialMessage();
      ready = true;
    } catch (e) {
      debugPrint('Push setup unavailable (${e.runtimeType})');
    }
  }

  final NotificationApi api;
  final void Function(Map<String, dynamic>) onOpen;
  final VoidCallback onChanged;
  final List<StreamSubscription<dynamic>> subscriptions = [];
  String? installation;
  bool stopped = false;
  bool _detaching = false;
  Future<void>? _registration;
  PushNotifications(this.api, this.onOpen, this.onChanged);
  bool accepts(Map<String, dynamic> data) =>
      data['recipientId'] == api.user.session.user.id;
  Future<void> start() async {
    if (!ready) return;
    subscriptions.add(
      FirebaseMessaging.onMessage.listen((m) {
        if (!stopped && !_detaching && accepts(m.data)) onChanged();
      }),
    );
    subscriptions.add(
      FirebaseMessaging.onMessageOpenedApp.listen((m) {
        if (!stopped && !_detaching && accepts(m.data)) onOpen(m.data);
      }),
    );
    final initial = pending;
    if (initial != null && accepts(initial.data)) {
      pending = null;
      onOpen(initial.data);
    }
    final prefs = await SharedPreferences.getInstance();
    if (stopped) return;
    installation = prefs.getString('push_installation_id');
    if (installation == null) {
      final r = Random.secure();
      final b = List<int>.generate(16, (_) => r.nextInt(256));
      b[6] = (b[6] & 15) | 64;
      b[8] = (b[8] & 63) | 128;
      final h = b.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
      installation =
          '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
      await prefs.setString('push_installation_id', installation!);
    }
    final permission = await FirebaseMessaging.instance.requestPermission();
    if (stopped) return;
    if (permission.authorizationStatus == AuthorizationStatus.denied) return;
    // APNs token may not be ready at the first launch; retry on app resume.
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await FirebaseMessaging.instance.getAPNSToken() == null) {
      return;
    }
    if (stopped || _detaching) return;
    // The server Admin SDK targets registration tokens; retain its supported token API.
    subscriptions.add(
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        unawaited(register(token));
      }),
    );
    await register(await FirebaseMessaging.instance.getToken());
  }

  Future<void> register(String? token) async {
    if (stopped || _detaching || token == null || installation == null) return;
    final previous = _registration;
    final pending = () async {
      await previous;
      if (stopped || _detaching) return;
      await _registerToken(token);
    }();
    _registration = pending;
    try {
      await pending;
    } finally {
      if (identical(_registration, pending)) _registration = null;
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await api.request(
        'PUT',
        'devices/$installation',
        body: {
          'token': token,
          'platform': defaultTargetPlatform == TargetPlatform.iOS
              ? 'ios'
              : 'android',
        },
      );
    } catch (e) {
      debugPrint('Push registration pending (${e.runtimeType})');
    }
  }

  Future<void> sync() async {
    if (!ready || stopped) return;
    _detaching = false;
    try {
      await register(await FirebaseMessaging.instance.getToken());
    } catch (e) {
      debugPrint('Push token pending (${e.runtimeType})');
    }
  }

  Future<void> unregister({bool strict = false}) async {
    _detaching = true;
    await _registration;
    if (installation == null) return;
    try {
      await api.request('DELETE', 'devices/$installation');
    } catch (e) {
      _detaching = false;
      if (strict) rethrow;
      debugPrint('Push deregistration pending (${e.runtimeType})');
    }
  }

  void dispose() {
    stopped = true;
    for (final s in subscriptions) {
      unawaited(s.cancel());
    }
    subscriptions.clear();
  }
}
