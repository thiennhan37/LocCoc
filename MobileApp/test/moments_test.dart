import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/moments/data/moment_api.dart';
import 'package:mobile_app/features/moments/presentation/moments_screen.dart';
import 'user_social_test.dart' as f;

void main() {
  testWidgets('gallery fetches visible images lazily', (tester) async {
    var imageCalls = 0;
    final user = f.apiFor((r) async {
      if (r.url.path.endsWith('/image')) {
        imageCalls++;
        return http.Response.bytes(
          base64Decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=',
          ),
          200,
        );
      }
      return f.json({
        'items': List.generate(
          20,
          (i) => {
            'id': '11111111-1111-4111-8111-${i.toString().padLeft(12, '0')}',
            'state': 'active',
            'indexStatus': 'ready',
            'caption': 'Moment $i',
            'place': null,
          },
        ),
      });
    });
    await tester.pumpWidget(
      MaterialApp(home: MomentsScreen(api: MomentApi(user))),
    );
    await tester.pump();
    // Image codecs complete on the engine thread; allow them real time without
    // advancing the fake clock to a network timeout while a spinner animates.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    expect(imageCalls, greaterThan(0));
    expect(imageCalls, lessThan(10));
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('moment client sends only query and filters to the gateway', () async {
    final user = f.apiFor((r) async {
      expect(r.url.path, '/moments/search');
      final body = jsonDecode(r.body) as Map;
      expect(body['query'], 'biển');
      expect(body['place'], 'Đà Nẵng');
      expect(body.containsKey('ownerId'), isFalse);
      expect(body.containsKey('vector'), isFalse);
      expect(r.headers.containsKey('x-service-token'), isFalse);
      return f.json({'items': [], 'mode': 'hybrid'});
    });
    await MomentApi(user).search('  biển ', place: 'Đà Nẵng');
  });

  test('switching sessions rejects late private image bytes', () async {
    final pending = Completer<void>();
    final user = f.apiFor((r) async {
      await pending.future;
      return f.json({}, 200);
    });
    final image = user.momentImage('11111111-1111-4111-8111-111111111111');
    user.invalidate();
    pending.complete();
    await expectLater(image, throwsA(isA<SessionChangedException>()));
  });

  testWidgets('shows metadata-only fallback and empty state clearly', (
    tester,
  ) async {
    final user = f.apiFor(
      (r) async => f.json(
        r.method == 'POST'
            ? {
                'items': [],
                'mode': 'metadata_only',
                'semanticStatus': 'unavailable',
              }
            : {'items': [], 'nextCursor': null},
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: MomentsScreen(api: MomentApi(user))),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Chưa có khoảnh khắc. Hãy thêm ảnh đầu tiên.'),
      findsOneWidget,
    );
    await tester.enterText(find.byType(TextField).first, 'biển');
    await tester.tap(find.byTooltip('Tìm kiếm'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Đang tìm theo chú thích'), findsOneWidget);
    expect(find.text('Không tìm thấy khoảnh khắc phù hợp.'), findsOneWidget);
  });

  testWidgets('does not issue requests for an inactive tab', (tester) async {
    var calls = 0;
    final user = f.apiFor((r) async {
      calls++;
      return f.json({'items': []});
    });
    await tester.pumpWidget(
      MaterialApp(home: MomentsScreen(api: MomentApi(user), active: false)),
    );
    await tester.pumpAndSettle();
    expect(calls, 0);
  });
}
