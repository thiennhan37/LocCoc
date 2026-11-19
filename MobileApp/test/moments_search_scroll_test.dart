import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/features/moments/data/moment_api.dart';
import 'package:mobile_app/features/moments/presentation/moments_screen.dart';
import 'user_social_test.dart' as f;

Map<String, dynamic> page() => {
  'items': List.generate(
    40,
    (i) => {
      'id': '11111111-1111-4111-8111-${i.toString().padLeft(12, '0')}',
      'caption': 'Result $i',
      'state': 'draft',
      'indexStatus': 'ready',
    },
  ),
  'nextCursor': null,
};

void main() {
  testWidgets(
    'new search scrolls to first result and preserves original query and caret',
    (tester) async {
      String? sentQuery;
      final user = f.apiFor((r) async {
      if (r.method == 'POST') {
          sentQuery = (jsonDecode(r.body) as Map)['query'] as String;
      }
        return f.json(page());
      });
      await tester.pumpWidget(
        MaterialApp(home: MomentsScreen(api: MomentApi(user))),
      );
      await tester.pumpAndSettle();
      final results = find.byKey(const Key('moment_search_results'));
      final controller = tester.widget<ListView>(results).controller!;
      await tester.drag(results, const Offset(0, -700));
      await tester.pumpAndSettle();
      expect(controller.offset, greaterThan(0));
      final input = find.byType(TextField).first;
      await tester.enterText(input, 'người');
      tester.widget<TextField>(input).controller!.selection =
          const TextSelection.collapsed(offset: 2);
      await tester.tap(find.byTooltip('Tìm kiếm'));
      await tester.pumpAndSettle();
      expect(sentQuery, 'người');
      expect(controller.offset, 0);
      expect(find.text('Result 0').hitTestable(), findsOneWidget);
      expect(tester.widget<TextField>(input).controller!.text, 'người');
      expect(
        tester.widget<TextField>(input).controller!.selection.baseOffset,
        2,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'a stale search response cannot reset the current scroll position',
    (tester) async {
      final older = Completer<http.Response>();
      final newer = Completer<http.Response>();
      final user = f.apiFor((r) async {
        if (r.method != 'POST') return f.json(page());
        return (jsonDecode(r.body) as Map)['query'] == 'người'
            ? older.future
            : newer.future;
      });
      await tester.pumpWidget(
        MaterialApp(home: MomentsScreen(api: MomentApi(user))),
      );
      await tester.pumpAndSettle();
      final input = find.byType(TextField).first;
      await tester.enterText(input, 'người');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      await tester.enterText(input, 'xe đạp');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      newer.complete(f.json(page()));
      await tester.pumpAndSettle();
      final results = find.byKey(const Key('moment_search_results'));
      final controller = tester.widget<ListView>(results).controller!;
      await tester.drag(results, const Offset(0, -700));
      await tester.pumpAndSettle();
      final offset = controller.offset;
      expect(offset, greaterThan(0));
      older.complete(f.json(page()));
      await tester.pumpAndSettle();
      expect(controller.offset, offset);
      expect(tester.widget<TextField>(input).controller!.text, 'xe đạp');
      await tester.pumpWidget(const SizedBox());
    },
  );
}
