import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/chat/data/chat_api.dart';
import 'package:mobile_app/features/chat/presentation/chat_controller.dart';
import 'package:mobile_app/features/chat/presentation/chat_screens.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'chat_controller_test.dart' show FakeRealtime;
import 'user_social_test.dart' as fixtures;

void main() {
  testWidgets(
    'post message opens author conversation and sends only after user submission with JWT',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var opened = 0, sent = 0, reactions = 0;
      final conversation = {
        'id': 'conversation',
        'peer': {
          'id': 'author',
          'username': 'author',
          'displayName': 'Chủ bài',
        },
        'canInteract': true,
        'lastMessage': null,
        'unreadCount': 0,
        'lastReadSequence': '0',
        'peerLastReadSequence': '0',
        'updatedAt': '2026-11-16T00:00:00Z',
      };
      final users = fixtures.apiFor((request) async {
        final path = request.url.path;
        if (path.startsWith('/chat/')) {
          expect(request.headers['Authorization'], 'Bearer old-access');
        }
        if (path == '/chat/conversations/direct') {
          opened++;
          expect(jsonDecode(request.body), {'peerId': 'author'});
          return fixtures.json({'conversation': conversation});
        }
        if (path == '/chat/conversations/conversation') {
          return fixtures.json({'conversation': conversation});
        }
        if (path.endsWith('/messages')) {
          if (request.method == 'GET') {
            return fixtures.json({'data': [], 'hasMore': false});
          }
          sent++;
          final body = jsonDecode(request.body) as Map;
          expect(body['text'], 'Ảnh đẹp quá');
          expect(body['postId'], sent == 1 ? 'post' : isNull);
          expect(body['clientMessageId'], matches(RegExp(r'^[0-9a-f-]{36}$')));
          return fixtures.json({
            'message': {
              'id': 'message-$sent',
              'conversationId': 'conversation',
              'senderId': fixtures.session.user.id,
              'clientMessageId': body['clientMessageId'],
              'sequence': '$sent',
              'postAttachment': sent == 1
                  ? {
                      'postId': 'post',
                      'mediaKey':
                          '/posts/media/11111111-1111-4111-8111-111111111111',
                    }
                  : null,
              'text': body['text'],
              'createdAt': '2026-11-16T00:00:00Z',
            },
          });
        }
        if (path.endsWith('/read')) {
          return fixtures.json({'lastReadSequence': '1', 'unreadCount': 0});
        }
        if (path == '/posts/feed') {
          return fixtures.json({
            'data': [
              {
                'id': 'post',
                'ownerId': 'author',
                'authorName': 'Chủ bài',
                'mediaKey': '/posts/media/11111111-1111-4111-8111-111111111111',
                'mediaType': 1,
                'caption': null,
                'createdAt': '2026-11-16T00:00:00Z',
                'mine': false,
                'seen': false,
              },
            ],
            'nextCursor': null,
          });
        }
        if (path.endsWith('/reaction') && request.method == 'PUT') {
          reactions++;
          expect(jsonDecode(request.body), {'emoji': '😂'});
          return fixtures.json({
            'counts': {'😂': 1},
            'myReaction': '😂',
          });
        }
        if (path.endsWith('/reactions')) {
          return fixtures.json({'counts': {}, 'myReaction': null});
        }
        return fixtures.json({
          'friendCount': 1,
          'unseenCount': 0,
          'unreadCount': 0,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: fixtures.session,
            userApi: users,
            profile: const {'displayName': 'Me'},
            googleAuthService: GoogleAuthService(apiClient: users.auth),
            chatControllerFactory: () =>
                ChatController(api: ChatApi(users), socket: FakeRealtime()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lịch sử'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Thêm cảm xúc'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('😂 0'));
      await tester.pumpAndSettle();
      expect(reactions, 1);
      await tester.tap(find.byKey(const ValueKey('message-author')));
      await tester.pumpAndSettle();
      expect(find.byType(ChatDetailScreen), findsOneWidget);
      expect(opened, 1);
      expect(sent, 0);
      expect(find.byKey(const Key('chat-post-preview')), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('chat-composer')),
        'Ảnh đẹp quá',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(sent, 1);
      expect(find.byKey(const Key('chat-post-preview')), findsNothing);
      expect(find.byKey(const Key('chat-post-image')), findsOneWidget);
      expect(find.text('Ảnh đẹp quá'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('chat-composer')),
        'Ảnh đẹp quá',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-send')));
      await tester.pumpAndSettle();
      expect(sent, 2);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
