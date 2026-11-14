import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/theme/app_theme.dart';
import 'package:mobile_app/features/chat/presentation/chat_screens.dart';
import 'package:mobile_app/features/chat/presentation/chat_controller.dart';
import 'package:mobile_app/features/chat/domain/chat_models.dart';
import 'chat_controller_test.dart' as fixtures;

void main() {
  testWidgets(
    'incoming messages preserve position when reading older history',
    (tester) async {
      final api = fixtures.FakeChatApi();
      final socket = fixtures.FakeRealtime();
      ChatMessage row(int sequence) => ChatMessage.fromJson({
        ...fixtures
            .message('$sequence', client: 'c$sequence', sender: 'peer')
            .toJson(),
        'text': 'Tin nhắn thứ $sequence',
      });
      api.onHistory = (_) async =>
          ChatMessagePage(List.generate(35, (i) => row(i + 1)), false);
      final c = ChatController(api: api, socket: socket);
      await tester.pumpWidget(
        MaterialApp(
          home: ChatDetailScreen(controller: c, conversationId: 'conversation'),
        ),
      );
      await tester.pumpAndSettle();
      final listScrollable = find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first;
      final position = tester.state<ScrollableState>(listScrollable).position;
      position.jumpTo(400);
      await tester.pumpAndSettle();
      socket.emit('message:new', {'message': row(36).toJson()});
      await tester.pumpAndSettle();
      expect(position.pixels, greaterThan(400));
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
  testWidgets(
    'inbox navigates to detail and sends a multiline Vietnamese message',
    (tester) async {
      final api = fixtures.FakeChatApi();
      final socket = fixtures.FakeRealtime();
      final c = ChatController(
        api: api,
        socket: socket,
        idGenerator: () => 'client-1',
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          home: ChatInboxScreen(controller: c),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Tin nhắn'), findsOneWidget);
      await tester.tap(find.text('Bạn'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-composer')), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('chat-composer')),
        'Xin chào 👋\nHẹn gặp bạn',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(find.text('Xin chào 👋'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('chat-composer')))
            .controller!
            .text,
        isEmpty,
      );
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Tin nhắn'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
  testWidgets('failed bubble offers retry and keeps client identity', (
    tester,
  ) async {
    final api = fixtures.FakeChatApi();
    final socket = fixtures.FakeRealtime();
    api.onSend = (id, text) async => throw Exception('offline');
    final c = ChatController(
      api: api,
      socket: socket,
      idGenerator: () => 'client-1',
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: ChatDetailScreen(controller: c, conversationId: 'conversation'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('chat-composer')),
      'Xin chào 👋',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pumpAndSettle();
    expect(find.text('Chưa xác nhận · Thử lại'), findsOneWidget);
    api.onSend = (id, text) async => fixtures.message('1', client: id);
    await tester.tap(find.text('Chưa xác nhận · Thử lại'));
    await tester.pumpAndSettle();
    expect(api.sent, ['client-1', 'client-1']);
    expect(find.text('Chưa xác nhận · Thử lại'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    c.dispose();
  });
  testWidgets('composer rejects overlong Unicode while preserving draft', (
    tester,
  ) async {
    final api = fixtures.FakeChatApi();
    final c = ChatController(api: api, socket: fixtures.FakeRealtime());
    await tester.pumpWidget(
      MaterialApp(
        home: ChatDetailScreen(controller: c, conversationId: 'conversation'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('chat-composer')), '😀' * 2001);
    await tester.pump();
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pumpAndSettle();
    expect(api.sent, isEmpty);
    expect(c.draft('conversation').runes.length, 2001);
    await tester.pumpWidget(const SizedBox());
    c.dispose();
  });
  testWidgets(
    'unavailable friendship disables composer and preserves history',
    (tester) async {
      final api = fixtures.FakeChatApi()
        ..current = fixtures.conversation(allowed: false);
      final c = ChatController(api: api, socket: fixtures.FakeRealtime());
      await tester.pumpWidget(
        MaterialApp(
          home: ChatDetailScreen(controller: c, conversationId: 'conversation'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('chat-composer')))
            .enabled,
        isFalse,
      );
      expect(
        find.text('Hiện không thể tiếp tục hội thoại này.'),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
}
