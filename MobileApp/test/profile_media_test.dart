import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/core/widgets/user_cover.dart';
import 'package:mobile_app/features/users/data/profile_image_picker.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/users/presentation/profile_media_screen.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:http/http.dart' as http;
import 'user_social_test.dart' as f;
import 'remembered_accounts_test.dart' as accounts;

final png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=',
);

class FakePicker extends ProfileImagePicker {
  PickedProfileImage? result = PickedProfileImage(png, 'image/png');
  Object? failure;
  Completer<PickedProfileImage?>? barrier;
  ImageSource? source;
  @override
  Future<PickedProfileImage?> pick(ImageSource source, String kind) async {
    this.source = source;
    if (failure != null) throw failure!;
    return barrier == null ? result : await barrier!.future;
  }

  @override
  Future<PickedProfileImage?> recover(String kind) async => result;
}

void main() {
  Future<void> show(
    WidgetTester tester,
    UserApiClient api,
    FakePicker picker, {
    String kind = 'avatar',
    String? current,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: ProfileMediaScreen(
          api: api,
          kind: kind,
          picker: picker,
          profile: {
            'username': 'alice',
            'displayName': 'Alice',
            'avatarUrl': kind == 'avatar' ? current : null,
            'coverUrl': kind == 'cover' ? current : null,
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  for (final kind in ['avatar', 'cover']) {
    testWidgets(
      'picks previews and uploads $kind as binary without displayName',
      (tester) async {
        var uploads = 0;
        final api = f.apiFor((r) async {
          expect(r.method, 'PUT');
          expect(r.url.path, '/users/me/media/$kind');
          expect(r.headers['Content-Type'], 'image/png');
          expect(r.headers['Authorization'], 'Bearer old-access');
          expect(r.bodyBytes, png);
          uploads++;
          return f.json({
            'username': 'alice',
            '${kind}Url': 'https://media.test/new.webp',
          });
        });
        final picker = FakePicker();
        await show(tester, api, picker, kind: kind);
        await tap(tester, 'pick_gallery');
        expect(picker.source, ImageSource.gallery);
        expect(find.byType(Image), findsWidgets);
        expect(uploads, 0);
        await tap(tester, 'save_media');
        expect(uploads, 1);
      },
    );
    testWidgets('removes current $kind without invoking a rename', (
      tester,
    ) async {
      var removals = 0;
      final api = f.apiFor((r) async {
        expect(r.method, 'DELETE');
        expect(r.url.path, '/users/me/media/$kind');
        expect(r.body, isEmpty);
        removals++;
        return f.json({'username': 'alice', '${kind}Url': null});
      });
      await show(
        tester,
        api,
        FakePicker(),
        kind: kind,
        current: 'https://media.test/old.webp',
      );
      await tap(tester, 'remove_media');
      expect(removals, 1);
    });
    testWidgets('$kind picker fits 360px at 200 percent text', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = f.apiFor((_) async => f.json({}));
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: ProfileMediaScreen(
            api: api,
            kind: kind,
            profile: const {},
            picker: FakePicker(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tap(tester, 'pick_gallery');
      await tester.ensureVisible(find.byKey(const Key('save_media')));
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('cancellation leaves the current image and never uploads', (
    tester,
  ) async {
    var calls = 0;
    final api = f.apiFor((_) async {
      calls++;
      return f.json({});
    });
    final picker = FakePicker()..result = null;
    await show(tester, api, picker);
    await tap(tester, 'pick_gallery');
    expect(calls, 0);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('save_media')))
          .onPressed,
      isNull,
    );
  });
  testWidgets('camera permission denial and invalid file are readable', (
    tester,
  ) async {
    final picker = FakePicker()
      ..failure = PlatformException(code: 'camera_access_denied');
    final api = f.apiFor((_) async => f.json({}));
    await show(tester, api, picker);
    await tap(tester, 'pick_camera');
    expect(find.textContaining('kiểm tra quyền'), findsOneWidget);
    picker.failure = const FormatException(
      'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.',
    );
    await tap(tester, 'pick_gallery');
    expect(find.textContaining('Chỉ hỗ trợ ảnh'), findsOneWidget);
  });
  testWidgets('network or server failure retains preview and enables retry', (
    tester,
  ) async {
    final api = f.apiFor(
      (_) async => f.json({'code': 'MEDIA_UNAVAILABLE'}, 503),
    );
    await show(tester, api, FakePicker());
    await tap(tester, 'pick_gallery');
    await tap(tester, 'save_media');
    expect(find.textContaining('Chưa thể lưu ảnh'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('save_media')))
          .onPressed,
      isNotNull,
    );
  });
  testWidgets(
    'busy guard blocks double upload and stale completion cannot leave the screen',
    (tester) async {
      final pending = Completer<void>();
      var calls = 0;
      final api = f.apiFor((_) async {
        calls++;
        await pending.future;
        return f.json({'avatarUrl': 'https://media.test/a.webp'});
      });
      await show(tester, api, FakePicker());
      await tap(tester, 'pick_gallery');
      await tester.ensureVisible(find.byKey(const Key('save_media')));
      await tester.tap(find.byKey(const Key('save_media')));
      await tester.pump();
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('save_media')))
            .onPressed,
        isNull,
      );
      expect(calls, 1);
      api.invalidate();
      pending.complete();
      await tester.pumpAndSettle();
      expect(find.byType(ProfileMediaScreen), findsOneWidget);
    },
  );
  testWidgets('switching session while the picker is open discards its image', (
    tester,
  ) async {
    final picker = FakePicker()..barrier = Completer<PickedProfileImage?>();
    final api = f.apiFor((_) async => f.json({}));
    await show(tester, api, picker);
    await tester.tap(find.byKey(const Key('pick_gallery')));
    await tester.pump();
    api.invalidate();
    picker.barrier!.complete(PickedProfileImage(png, 'image/png'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('save_media')))
          .onPressed,
      isNull,
    );
  });
  testWidgets(
    'lost image recovery only previews and requires explicit upload',
    (tester) async {
      var calls = 0;
      final api = f.apiFor((_) async {
        calls++;
        return f.json({});
      });
      await show(tester, api, FakePicker());
      await tester.tap(find.text('Khôi phục ảnh sau khi ứng dụng bị đóng'));
      await tester.pumpAndSettle();
      expect(calls, 0);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('save_media')))
            .onPressed,
        isNotNull,
      );
    },
  );
  test(
    'picker rejects unsupported signatures and oversize before displaying',
    () async {
      final picker = ProfileImagePicker();
      await expectLater(
        picker.read(
          XFile.fromData(Uint8List.fromList(utf8.encode('<svg/>'))),
          'avatar',
        ),
        throwsFormatException,
      );
      await expectLater(
        picker.read(XFile.fromData(Uint8List(5 * 1024 * 1024 + 1)), 'avatar'),
        throwsFormatException,
      );
      expect(
        (await picker.read(XFile.fromData(png), 'avatar')).contentType,
        'image/png',
      );
    },
  );
  testWidgets(
    'cover decoding is bounded and carries no application auth headers',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: UserCover(coverUrl: 'https://media.test/cover.webp'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final image = tester.widget<Image>(find.byType(Image));
      final resized = image.image as ResizeImage;
      expect(resized.width, lessThanOrEqualTo(2048));
      expect((resized.imageProvider as NetworkImage).headers, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('own and peer profiles render API cover URLs', (tester) async {
    final api = f.apiFor(
      (_) async => f.json({
        'username': 'alice',
        'id': 'peer',
        'displayName': 'Alice',
        'relationshipStatus': 'NONE',
        'coverUrl': 'https://media.test/peer.webp',
        'friendCount': 0,
        'unseenCount': 0,
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: f.session,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
          initialTab: 2,
          profile: const {
            'username': 'alice',
            'coverUrl': 'https://media.test/own.webp',
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<UserCover>(find.byType(UserCover)).coverUrl,
      'https://media.test/own.webp',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: UsernameProfileScreen(username: 'alice', api: api),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<UserCover>(find.byType(UserCover)).coverUrl,
      'https://media.test/peer.webp',
    );
  });
  test(
    'saved accounts remain backward compatible and store cover URL metadata only',
    () async {
      final vault = accounts.MemoryVault().open();
      await vault.rememberIdentity(accounts.session('a'));
      await vault.profile('a', {'coverUrl': 'https://media.test/a.webp'});
      expect((await vault.list()).single.coverUrl, 'https://media.test/a.webp');
      await vault.profile('a', {'coverUrl': 'data:private'});
      expect((await vault.list()).single.coverUrl, isNull);
    },
  );
  test(
    'binary upload refreshes only after a definitive 401 and preserves bytes',
    () async {
      var uploads = 0;
      final api = f.apiFor((r) async {
        if (r.url.path == '/auth/refresh') {
          return f.json({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
            'expiresIn': 900,
            'refreshExpiresIn': 3600,
          });
        }
        if (r.url.path == '/users/me') return f.json({'username': 'alice'});
        uploads++;
        expect(r.bodyBytes, png);
        if (uploads == 1) return f.json({}, 401);
        expect(r.headers['Authorization'], 'Bearer new-access');
        return f.json({'avatarUrl': 'https://media.test/a.webp'});
      });
      expect(
        (await api.uploadMedia('avatar', png, 'image/png'))['avatarUrl'],
        'https://media.test/a.webp',
      );
      expect(uploads, 2);
    },
  );
  test('transport failures never automatically replay an upload', () async {
    var uploads = 0;
    final api = f.apiFor((r) async {
      uploads++;
      throw http.ClientException('connection lost');
    });
    await expectLater(
      api.uploadMedia('cover', png, 'image/png'),
      throwsA(isA<http.ClientException>()),
    );
    expect(uploads, 1);
  });
  test('Spring numeric error codes keep the upload HTTP status', () async {
    final api = f.apiFor(
      (_) async =>
          f.json({'code': 1102, 'message': 'Request body too large'}, 413),
    );
    try {
      await api.uploadMedia('avatar', png, 'image/png');
      fail('must reject');
    } catch (e) {
      expect(userError(e), contains('Ảnh quá lớn'));
    }
  });
}
