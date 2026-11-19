import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/data/post_api.dart';
import 'package:mobile_app/features/posts/presentation/ai_preview_screen.dart';
import 'package:mobile_app/core/network/api_client.dart';
import 'user_social_test.dart' as fixtures;
import 'photo_editor_test.dart' show sample;

class PreviewApi extends PostApi {
  int calls = 0;
  final pending = Completer<Uint8List>();
  @override
  Future<Uint8List> enhancePhoto({
    required String requestId,
    required Uint8List png,
    required String filterId,
  }) {
    calls++;
    return pending.future;
  }
}

void main() {
  test('preview uses authenticated post route and does not publish', () async {
    var calls = 0;
    final session = fixtures.apiFor((r) async {
      if (r.url.path == '/users/me') {
        return fixtures.json({'id': fixtures.session.user.id});
      }
      calls++;
      expect(r.url.path, '/posts/photos/enhance');
      expect(r.headers['authorization'], 'Bearer old-access');
      expect(jsonDecode(r.body)['filterId'], 'subject_sticker');
      return fixtures.json({
        'imageBase64': base64Encode(sample),
        'mimeType': 'image/png',
      });
    });
    final result = await PostApi(
      session: session,
    ).enhancePhoto(requestId: 'id', png: sample, filterId: 'subject_sticker');
    expect(result, sample);
    expect(calls, 1);
  });
  test(
    'refreshes expired session with unpaid preflight before one AI request',
    () async {
      var identityCalls = 0;
      var aiCalls = 0;
      var refreshes = 0;
      final session = fixtures.apiFor((r) async {
        if (r.url.path == '/auth/refresh') {
          refreshes++;
          return fixtures.json({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
            'tokenType': 'Bearer',
            'expiresIn': 900,
            'refreshExpiresIn': 3600,
          });
        }
        if (r.url.path == '/users/me') {
          identityCalls++;
          if (r.headers['authorization'] == 'Bearer old-access') {
            return fixtures.json({}, 401);
          }
          return fixtures.json({'id': fixtures.session.user.id});
        }
        expect(r.url.path, '/posts/photos/enhance');
        expect(r.headers['authorization'], 'Bearer new-access');
        aiCalls++;
        return fixtures.json({
          'imageBase64': base64Encode(sample),
          'mimeType': 'image/png',
        });
      });
      await PostApi(
        session: session,
      ).enhancePhoto(requestId: 'id', png: sample, filterId: 'subject_sticker');
      expect(identityCalls, 2);
      expect(refreshes, 1);
      expect(aiCalls, 1);
    },
  );
  test('anonymous preview is rejected locally', () async {
    await expectLater(
      PostApi().enhancePhoto(
        requestId: 'id',
        png: sample,
        filterId: 'subject_sticker',
      ),
      throwsA(isA<ApiException>()),
    );
  });
  testWidgets(
    'generation is explicit, single-flight and acceptance returns image',
    (tester) async {
      final api = PreviewApi();
      Uint8List? accepted;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  accepted = await Navigator.push<Uint8List>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AiPreviewScreen(source: sample, api: api),
                    ),
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(api.calls, 0);
      await tester.ensureVisible(find.byKey(const ValueKey('generate-ai')));
      await tester.tap(find.byKey(const ValueKey('generate-ai')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('generate-ai')));
      await tester.pump();
      expect(api.calls, 1);
      api.pending.complete(sample);
      for (
        var i = 0;
        i < 50 && find.text('Dùng ảnh này').evaluate().isEmpty;
        i++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(accepted, isNull);
      await tester.ensureVisible(find.text('Dùng ảnh này'));
      await tester.tap(find.text('Dùng ảnh này'));
      await tester.pumpAndSettle();
      expect(accepted, sample);
    },
  );
  testWidgets('cancel ignores late result', (tester) async {
    final api = PreviewApi();
    await tester.pumpWidget(
      MaterialApp(
        home: AiPreviewScreen(source: sample, api: api),
      ),
    );
    await tester.ensureVisible(find.byKey(const ValueKey('generate-ai')));
    await tester.tap(find.byKey(const ValueKey('generate-ai')));
    await tester.pump();
    expect(api.calls, 1);
    await tester.pumpWidget(const MaterialApp(home: Text('Left')));
    api.pending.complete(sample);
    await tester.pumpAndSettle();
    expect(find.text('Left'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
