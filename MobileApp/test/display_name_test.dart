import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/presentation/edit_profile_screen.dart';
import 'user_social_test.dart' as fixtures;

const profile = {
  'username': 'alice',
  'displayName': 'Alice',
  'nextDisplayNameChangeAt': '2026-12-10T12:00:00.000Z',
};

void main() {
  testWidgets(
    'unchanged name can be saved during cooldown and is sent as PATCH',
    (tester) async {
      final patches = <Map<String, dynamic>>[];
      final api = fixtures.apiFor((r) async {
        if (r.method == 'PATCH') {
          patches.add(jsonDecode(r.body) as Map<String, dynamic>);
        }
        return fixtures.json(profile);
      });
      await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.textContaining('10/12/2026'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('edit_display_name')),
        ' Alice ',
      );
      await tester.ensureVisible(find.byKey(const Key('save_display_name')));
      await tester.tap(find.byKey(const Key('save_display_name')));
      await tester.pumpAndSettle();
      expect(patches, [
        {'displayName': 'Alice'},
      ]);
    },
  );

  testWidgets(
    'cooldown conflict preserves input and shows the server next date',
    (tester) async {
      final api = fixtures.apiFor(
        (r) async => r.method == 'PATCH'
            ? fixtures.json({
                'code': 'DISPLAY_NAME_CHANGE_TOO_SOON',
                'nextDisplayNameChangeAt': '2026-12-15T12:00:00Z',
              }, 409)
            : fixtures.json(profile),
      );
      await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: api)));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('edit_display_name')),
        'Tên mới',
      );
      await tester.ensureVisible(find.byKey(const Key('save_display_name')));
      await tester.tap(find.byKey(const Key('save_display_name')));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Bạn chỉ được đổi tên mỗi 30 ngày'),
        findsOneWidget,
      );
      expect(find.textContaining('15/12/2026'), findsOneWidget);
      expect(find.text('Tên mới'), findsOneWidget);
    },
  );

  testWidgets('blank name is rejected before sending a profile update', (
    tester,
  ) async {
    var patches = 0;
    final api = fixtures.apiFor((r) async {
      if (r.method == 'PATCH') patches++;
      return fixtures.json(profile);
    });
    await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('edit_display_name')), '  ');
    await tester.ensureVisible(find.byKey(const Key('save_display_name')));
    await tester.tap(find.byKey(const Key('save_display_name')));
    await tester.pumpAndSettle();
    expect(find.text('Vui lòng nhập tên hiển thị.'), findsOneWidget);
    expect(patches, 0);
  });

  testWidgets('save is disabled after failed profile load and retry recovers', (
    tester,
  ) async {
    var failing = true;
    final api = fixtures.apiFor(
      (r) async => failing ? fixtures.json({}, 503) : fixtures.json(profile),
    );
    await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: api)));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('save_display_name')))
          .onPressed,
      isNull,
    );
    failing = false;
    await tester.ensureVisible(find.text('Tải lại hồ sơ'));
    await tester.tap(find.text('Tải lại hồ sơ'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('save_display_name')))
          .onPressed,
      isNotNull,
    );
    expect(find.text('Alice'), findsOneWidget);
  });

  testWidgets('repeated save taps send one request while saving', (
    tester,
  ) async {
    var patches = 0;
    final response = Completer<http.Response>();
    final api = fixtures.apiFor((r) async {
      if (r.method == 'PATCH') {
        patches++;
        return response.future;
      }
      return fixtures.json(profile);
    });
    await tester.pumpWidget(MaterialApp(home: EditProfileScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('save_display_name')));
    await tester.tap(find.byKey(const Key('save_display_name')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('save_display_name')));
    await tester.tap(find.byKey(const Key('save_display_name')));
    await tester.pump();
    expect(patches, 1);
    response.complete(fixtures.json(profile));
    await tester.pumpAndSettle();
  });

  testWidgets(
    'profile edit opens from home and updates the displayed name after save',
    (tester) async {
      var name = 'Alice';
      final api = fixtures.apiFor((r) async {
        if (r.url.path.endsWith('social-summary')) {
          return fixtures.json({'friendCount': 0});
        }
        if (r.url.path == '/users/me') {
          if (r.method == 'PATCH') {
            name = jsonDecode(r.body)['displayName'] as String;
          }
          return fixtures.json({...profile, 'displayName': name});
        }
        return fixtures.json({'unseenCount': 0, 'unreadCount': 0});
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: api,
            profile: profile,
            initialTab: 2,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Chỉnh sửa hồ sơ'));
      await tester.tap(find.text('Chỉnh sửa hồ sơ'));
      await tester.pumpAndSettle();
      expect(find.byType(EditProfileScreen), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('edit_display_name')),
        'Tên đã lưu',
      );
      await tester.ensureVisible(find.byKey(const Key('save_display_name')));
      await tester.tap(find.byKey(const Key('save_display_name')));
      await tester.pumpAndSettle();
      expect(find.byType(EditProfileScreen), findsNothing);
      expect(find.text('Tên đã lưu'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
