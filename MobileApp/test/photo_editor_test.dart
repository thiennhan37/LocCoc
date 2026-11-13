import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_api.dart';
import 'package:mobile_app/features/posts/data/post_api.dart';
import 'package:mobile_app/features/posts/presentation/photo_editor_screen.dart';

final sample = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAxSURBVFhH7c4hAQAACMAwItKI6OAJAGbi5mrRlf1Z7HEdAAAAAAAAAAAAAAAAAADAAPlINKZoOLjRAAAAAElFTkSuQmCC',
);

class FakePostApi extends PostApi {
  final owners = <String>[];
  final ids = <String>[];
  final captions = <String>[];
  final images = <Uint8List>[];
  @override
  Future<Map<String, dynamic>> publishPhoto({
    required String ownerId,
    required String requestId,
    required Uint8List png,
    String caption = '',
  }) async {
    owners.add(ownerId);
    ids.add(requestId);
    captions.add(caption);
    images.add(png);
    if (ids.length == 1) throw const ApiException('Mất mạng thử nghiệm');
    return {'id': requestId, 'mediaKey': '/posts/media/$requestId'};
  }
}

Future<void> loaded(WidgetTester tester) async {
  for (
    var i = 0;
    i < 50 && find.byKey(const ValueKey('edited-photo')).evaluate().isEmpty;
    i++
  ) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump();
  }
  expect(find.byKey(const ValueKey('edited-photo')), findsOneWidget);
}

void main() {
  testWidgets(
    'edited photo is retained on failure and retry reuses the same request',
    (tester) async {
      final api = FakePostApi();
      AuthApi.userId = '11111111-1111-4111-8111-111111111111';
      addTearDown(AuthApi.clearSession);
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      PublishedPhoto? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await Navigator.push<PublishedPhoto>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PhotoEditorScreen(
                      photo: sample,
                      api: api,
                      ownerId: '22222222-2222-4222-8222-222222222222',
                    ),
                  ),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pump();
      await loaded(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Đen trắng'));
      await tester.pump();
      await tester.tap(find.byTooltip('Thêm chữ'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('photo-caption')),
        'Xin chào',
      );
      await tester.tap(find.text('Xong'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('send-photo')));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const ValueKey('send-photo')));
        for (var i = 0; i < 100 && api.ids.isEmpty; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await tester.pumpAndSettle();
      expect(find.text('Mất mạng thử nghiệm'), findsOneWidget);
      expect(result, isNull);
      await tester.ensureVisible(find.text('Đen trắng'));
      await tester.tap(find.text('Đen trắng'));
      await tester.tap(find.byTooltip('Thêm chữ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xong'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('send-photo')));
      await tester.tap(find.byKey(const ValueKey('send-photo')));
      await tester.pumpAndSettle();
      expect(api.ids.length, 2);
      expect(api.owners, everyElement('22222222-2222-4222-8222-222222222222'));
      expect(api.ids[0], api.ids[1]);
      expect(api.images[0], api.images[1]);
      expect(api.captions, ['Xin chào', 'Xin chào']);
      expect(result?.postId, api.ids.last);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('compact editor prevents unauthenticated publishing', (
    tester,
  ) async {
    AuthApi.clearSession();
    final api = FakePostApi();
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: PhotoEditorScreen(photo: sample, api: api),
      ),
    );
    await loaded(tester);
    await tester.ensureVisible(find.byKey(const ValueKey('send-photo')));
    await tester.tap(find.byKey(const ValueKey('send-photo')));
    await tester.pump();
    expect(api.ids, isEmpty);
    expect(find.text('Hãy đăng nhập để gửi ảnh.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('editor visual preview', (tester) async {
    final fontPath = Platform.environment['LOCCOC_QA_FONT'];
    if (fontPath == null) return;
    await tester.runAsync(() async {
      final loader = FontLoader('Roboto')
        ..addFont(
          File(
            fontPath,
          ).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      await loader.load();
      final icons = FontLoader('MaterialIcons')
        ..addFont(
          File(
            'D:/Flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      await icons.load();
    });
    Uint8List? photo;
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawRect(
        const Rect.fromLTWH(0, 0, 1080, 1080),
        Paint()
          ..shader = ui.Gradient.linear(
            const Offset(0, 0),
            const Offset(1080, 1080),
            [const Color(0xFF78BDC2), const Color(0xFFF8DFB1)],
          ),
      );
      canvas.drawCircle(
        const Offset(760, 260),
        100,
        Paint()..color = const Color(0xFFFFE6AE),
      );
      final hills = Path()
        ..moveTo(0, 740)
        ..quadraticBezierTo(320, 340, 620, 760)
        ..quadraticBezierTo(900, 490, 1080, 660)
        ..lineTo(1080, 1080)
        ..lineTo(0, 1080)
        ..close();
      canvas.drawPath(hills, Paint()..color = const Color(0xFF568A73));
      final picture = recorder.endRecording();
      final image = await picture.toImage(1080, 1080);
      photo = (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
      image.dispose();
      picture.dispose();
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final key = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          home: PhotoEditorScreen(photo: photo!),
        ),
      ),
    );
    await loaded(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Thêm chữ'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('photo-caption')),
      'Một ngày thật dịu dàng',
    );
    await tester.tap(find.text('Xong'));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      final image =
          await (key.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 2);
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
      await File('build/photo-editor-preview.png').writeAsBytes(bytes);
      image.dispose();
    });
    expect(tester.takeException(), isNull);
  });
}
