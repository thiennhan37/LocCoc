import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/posts/presentation/view_dwell.dart';

void main() {
  testWidgets(
    'a rendered scroll interruption shorter than polling interval resets dwell',
    (tester) async {
      var calls = 0;
      final scroll = ScrollController();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              controller: scroll,
              child: Column(
                children: [
                  ViewDwell(
                    ready: true,
                    active: true,
                    onViewed: () async {
                      calls++;
                      return true;
                    },
                    child: const SizedBox(height: 200, width: 200),
                  ),
                  const SizedBox(height: 1200),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 900));
      scroll.jumpTo(250);
      await tester.pump(const Duration(milliseconds: 10));
      scroll.jumpTo(0);
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 500));
      expect(calls, 0);
      await tester.pump(const Duration(milliseconds: 700));
      expect(calls, 1);
      await tester.pumpWidget(const SizedBox());
      scroll.dispose();
    },
  );
  testWidgets(
    'requires continuous visible loaded foreground photo and reports once',
    (tester) async {
      var calls = 0;
      bool ready = false, active = true;
      late StateSetter update;
      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, set) {
              update = set;
              return Scaffold(
                body: SingleChildScrollView(
                  child: ViewDwell(
                    ready: ready,
                    active: active,
                    onViewed: () async {
                      calls++;
                      return true;
                    },
                    child: const SizedBox(height: 200, width: 200),
                  ),
                ),
              );
            },
          ),
        ),
      );
      await tester.pump(const Duration(seconds: 2));
      expect(calls, 0);
      update(() => ready = true);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));
      expect(calls, 0);
      update(() => active = false);
      await tester.pump();
      await tester.pump(const Duration(seconds: 2));
      expect(calls, 0);
      update(() => active = true);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));
      expect(calls, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 2));
      expect(calls, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 1400));
      expect(calls, 1);
      await tester.pump(const Duration(seconds: 3));
      expect(calls, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('offscreen and covered routes do not count', (tester) async {
    var calls = 0;
    final scroll = ScrollController();
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigator,
        home: Scaffold(
          body: SingleChildScrollView(
            controller: scroll,
            child: Column(
              children: [
                const SizedBox(height: 800),
                ViewDwell(
                  ready: true,
                  active: true,
                  onViewed: () async {
                    calls++;
                    return true;
                  },
                  child: const SizedBox(height: 200, width: 200),
                ),
                const SizedBox(height: 600),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(calls, 0);
    scroll.jumpTo(700);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Other')),
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));
    expect(calls, 0);
    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 1400));
    expect(calls, 1);
    await tester.pumpWidget(const SizedBox());
    scroll.dispose();
  });
}
