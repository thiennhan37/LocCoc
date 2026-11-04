import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/constants/api_constants.dart';
import '../../domain/models/auth_session.dart';

class SavedAccount {
  final String id;
  final String email;
  final String? name;
  final String? username;
  final bool canContinue;
  const SavedAccount({
    required this.id,
    required this.email,
    this.name,
    this.username,
    required this.canContinue,
  });
}

/// A single encrypted, origin-scoped record. Mutations are serialized and never
/// cache an uncommitted state. Passwords and access tokens are never serialized.
class AccountVault {
  static final Map<String, AccountVault> _origins = {};
  static AccountVault forOrigin(String origin) =>
      _origins.putIfAbsent(origin, () => AccountVault(origin: origin));
  static AccountVault get shared =>
      forOrigin(Uri.parse(ApiConstants.baseUrl).origin);
  final Future<String?> Function(String) _read;
  final Future<void> Function(String, String) _write;
  final DateTime Function() _now;
  final bool supported;
  final String _key;
  final bool _nativeStorage;
  bool _installationChecked = false;
  Future<void>? _tail;
  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
    ),
  );

  AccountVault({
    Future<String?> Function(String)? read,
    Future<void> Function(String, String)? write,
    DateTime Function()? now,
    bool? supported,
    String? origin,
  }) : _nativeStorage = read == null,
       _read = read ?? ((key) => _storage.read(key: key)),
       _write =
           write ?? ((key, value) => _storage.write(key: key, value: value)),
       _now = now ?? DateTime.now,
       supported =
           supported ??
           (!kIsWeb &&
               [
                 TargetPlatform.android,
                 TargetPlatform.iOS,
               ].contains(defaultTargetPlatform)),
       _key =
           'loccoc.accounts.v1.${base64UrlEncode(utf8.encode(origin ?? ApiConstants.baseUrl))}';

  Future<T> _locked<T>(Future<T> Function() action) {
    final result = _tail == null ? action() : _tail!.then((_) => action());
    final tail = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    _tail = tail;
    tail.then((_) {
      if (identical(_tail, tail)) _tail = null;
    });
    return result;
  }

  Future<Map<String, dynamic>> _load() async {
    if (!supported) return {'version': 1, 'accounts': <String, dynamic>{}};
    if (_nativeStorage && !_installationChecked) {
      final preferences = await SharedPreferences.getInstance();
      // iOS Keychain can outlive uninstall. A new installation must not inherit
      // the previous installation's authenticated session.
      if (preferences.getBool('$_key.installed') != true) {
        await _storage.delete(key: _key);
        if (!await preferences.setBool('$_key.installed', true)) {
          throw StateError('Cannot initialize account storage');
        }
      }
      _installationChecked = true;
    }
    final raw = await _read(_key);
    if (raw == null) return {'version': 1, 'accounts': <String, dynamic>{}};
    final value = jsonDecode(raw) as Map<String, dynamic>;
    if (value['version'] != 1 || value['accounts'] is! Map<String, dynamic>) {
      throw const FormatException('Invalid account vault');
    }
    return value;
  }

  Future<void> _save(Map<String, dynamic> value) =>
      _write(_key, jsonEncode(value));
  bool _valid(Map<String, dynamic> row) =>
      row['refreshToken'] is String &&
      (row['refreshToken'] as String).isNotEmpty &&
      (DateTime.tryParse(row['expiresAt'] as String? ?? '')?.isAfter(_now()) ??
          false);

  Future<List<SavedAccount>> list() => _locked(() async {
    final data = await _load();
    return (data['accounts'] as Map<String, dynamic>).entries.map((e) {
      final row = e.value as Map<String, dynamic>;
      return SavedAccount(
        id: e.key,
        email: row['email'] as String,
        name: row['name'] as String?,
        username: row['username'] as String?,
        canContinue: _valid(row),
      );
    }).toList();
  });

  Future<String?> activeId() =>
      _locked(() async => (await _load())['active'] as String?);

  Future<void> rememberIdentity(AuthSession session) => _locked(() async {
    if (!supported || session.accessToken.startsWith('demo-')) return;
    final data = await _load();
    final rows = data['accounts'] as Map<String, dynamic>;
    final previous = rows[session.user.id] as Map<String, dynamic>? ?? {};
    rows[session.user.id] = {
      'retain': false,
      ...previous,
      'email': session.user.email ?? '',
      'user': session.user.toJson(),
    };
    await _save(data);
  });

  Future<void> remember(
    AuthSession session, {
    required bool remember,
    required bool retain,
    bool active = true,
  }) => _locked(() async {
    if (!supported || session.accessToken.startsWith('demo-')) return;
    final data = await _load();
    final rows = data['accounts'] as Map<String, dynamic>;
    if (!remember) {
      rows.remove(session.user.id);
      data['active'] = null;
    } else {
      if (!rows.containsKey(session.user.id) && rows.length >= 10) {
        throw StateError(
          'Chỉ lưu tối đa 10 tài khoản. Hãy xóa bớt tài khoản đã lưu.',
        );
      }
      final previous = rows[session.user.id] as Map<String, dynamic>? ?? {};
      rows[session.user.id] = {
        ...previous,
        'email': session.user.email ?? '',
        'user': session.user.toJson(),
        'retain': retain,
        'refreshToken': retain ? session.refreshToken : null,
        'expiresAt': retain
            ? _now()
                  .add(Duration(seconds: session.refreshExpiresIn))
                  .toUtc()
                  .toIso8601String()
            : null,
      };
      data['active'] = retain && active ? session.user.id : null;
    }
    await _save(data);
  });

  /// Erase before network rotation. A crash/lost response cannot replay a token
  /// which may already have been consumed by AuthService.
  Future<AuthSession?> consume(String id) => _locked(() async {
    final data = await _load();
    final row =
        (data['accounts'] as Map<String, dynamic>)[id] as Map<String, dynamic>?;
    if (row == null || !_valid(row)) return null;
    final session = AuthSession.fromJson({
      'authenticated': true,
      'user': row['user'],
      'refreshToken': row['refreshToken'],
    });
    row['refreshToken'] = null;
    await _save(data);
    return session;
  });

  Future<void> beginRotation(String id) => _locked(() async {
    if (!supported) return;
    final data = await _load();
    final row =
        (data['accounts'] as Map<String, dynamic>)[id] as Map<String, dynamic>?;
    if (row == null || row['retain'] != true) return;
    row['refreshToken'] = null;
    await _save(data);
  });

  Future<void> rotated(AuthSession session) => _locked(() async {
    if (!supported) return;
    final data = await _load();
    final row =
        (data['accounts'] as Map<String, dynamic>)[session.user.id]
            as Map<String, dynamic>?;
    if (row == null || row['retain'] != true) return;
    row['refreshToken'] = session.refreshToken;
    row['user'] = session.user.toJson();
    row['expiresAt'] = _now()
        .add(Duration(seconds: session.refreshExpiresIn))
        .toUtc()
        .toIso8601String();
    await _save(data);
  });

  Future<void> select(String? id) => _locked(() async {
    if (!supported) return;
    final data = await _load();
    data['active'] = id;
    await _save(data);
  });

  Future<void> profile(String id, Map<String, dynamic> profile) =>
      _locked(() async {
        if (!supported) return;
        final data = await _load();
        final row =
            (data['accounts'] as Map<String, dynamic>)[id]
                as Map<String, dynamic>?;
        if (row == null) return;
        row['name'] = profile['displayName'];
        row['username'] = profile['username'];
        await _save(data);
      });

  Future<void> clearCredential(String id, {bool forget = false}) =>
      _locked(() async {
        if (!supported) return;
        final data = await _load();
        final rows = data['accounts'] as Map<String, dynamic>;
        if (forget) {
          rows.remove(id);
        } else {
          final row = rows[id] as Map<String, dynamic>?;
          if (row != null) {
            row['refreshToken'] = null;
            row['retain'] = false;
            row['expiresAt'] = null;
          }
        }
        if (data['active'] == id) data['active'] = null;
        await _save(data);
      });
}
