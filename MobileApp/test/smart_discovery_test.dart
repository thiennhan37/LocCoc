import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_app/features/users/presentation/friends_screen.dart';
import 'package:mobile_app/features/users/presentation/discovery_privacy_screen.dart';
import 'package:mobile_app/features/users/presentation/mutual_friends.dart';
import 'package:mobile_app/features/users/presentation/username_profile_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_privacy_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'user_social_test.dart' as f;

void main() {
  testWidgets(
    'a read started during an in-flight block is discarded after acknowledgement',
    (tester) async {
      final block = Completer<http.Response>(),
          response = Completer<http.Response>();
      final api = f.apiFor(
        (r) => r.method == 'PUT' ? block.future : response.future,
      );
      final blocking = api.request('PUT', 'blocks/an');
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      block.complete(f.json({}, 204));
      await blocking;
      response.complete(
        f.json({
          'data': [f.peer('an')],
          'hasMore': false,
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsNothing);
    },
  );
  for (final action in ['send', 'dismiss']) {
    testWidgets(
      '$action preserves other suggestion cards without reloading preparing',
      (tester) async {
        var reads = 0;
        final api = f.apiFor((r) async {
          if (r.method == 'POST') {
            return f.json({'id': 'request'}, action == 'send' ? 201 : 204);
          }
          reads++;
          return f.json(
            reads == 1
                ? {
                    'data': [f.peer('an'), f.peer('binh')],
                    'hasMore': true,
                    'nextCursor': 'snapshot:2',
                    'state': 'ready',
                  }
                : {'data': [], 'hasMore': false, 'state': 'preparing'},
          );
        });
        await tester.pumpWidget(
          MaterialApp(home: FriendsScreen(api: api, initialTab: 5)),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.text(action == 'send' ? 'Kết bạn' : 'Ẩn gợi ý').first,
        );
        await tester.pumpAndSettle();
        expect(find.text('@an'), findsNothing);
        expect(find.text('@binh'), findsOneWidget);
        expect(find.text('Đang chuẩn bị gợi ý cho bạn.'), findsNothing);
        expect(reads, 1);
        expect(find.text('Xem thêm'), findsOneWidget);
      },
    );
  }
  testWidgets(
    'search validates after stripping @ and collapses repeated spaces',
    (tester) async {
      final queries = <String>[];
      final api = f.apiFor((r) async {
        queries.add(r.url.queryParameters['q']!);
        return f.json({'data': [], 'hasMore': false});
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      final field = find.byKey(const Key('friend-search'));
      await tester.enterText(field, '@a');
      await tester.pump(const Duration(milliseconds: 400));
      expect(queries, isEmpty);
      await tester.enterText(field, '  @ab  ');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      await tester.enterText(field, 'Nguyễn   Đặng');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(queries, ['ab', 'nguyễn đặng']);
    },
  );
  testWidgets(
    'available zero mutuals are hidden and positive mutuals open detail',
    (tester) async {
      final api = f.apiFor(
        (r) async => f.json({
          'state': 'available',
          'count': 1,
          'data': [f.peer('bridge')],
          'hasMore': false,
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MutualFriendsSummary(
              api: api,
              targetId: 'an',
              evidence: {'state': 'available', 'count': 0, 'data': []},
            ),
          ),
        ),
      );
      expect(find.textContaining('bạn chung'), findsNothing);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MutualFriendsSummary(
              api: api,
              targetId: 'an',
              evidence: {'state': 'available', 'count': 1, 'data': []},
            ),
          ),
        ),
      );
      await tester.tap(find.text('1 bạn chung'));
      await tester.pumpAndSettle();
      expect(find.byType(MutualFriendsScreen), findsOneWidget);
      expect(find.text('@bridge'), findsOneWidget);
    },
  );
  testWidgets(
    'Friends tab retains selected suggestions and loaded rows across bottom navigation',
    (tester) async {
      var recommendationReads = 0;
      final api = f.apiFor((r) async {
        if (r.url.path == '/users/recommendations') {
          recommendationReads++;
          return f.json({
            'data': [f.peer('binh')],
            'hasMore': false,
            'state': 'ready',
          });
        }
        return f.json({
          'data': [],
          'hasMore': false,
          'friendCount': 1,
          'unseenCount': 0,
          'unreadCount': 0,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bạn bè').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Gợi ý'));
      await tester.tap(find.text('Gợi ý'));
      await tester.pumpAndSettle();
      expect(find.text('@binh'), findsOneWidget);
      await tester.tap(find.text('Cá nhân').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bạn bè').last);
      await tester.pumpAndSettle();
      expect(find.text('@binh'), findsOneWidget);
      expect(recommendationReads, 1);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Gợi ý'))
            .selected,
        isTrue,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'returning from an unchanged profile preserves loaded search pages and cursor',
    (tester) async {
      var searches = 0;
      final api = f.apiFor((r) async {
        if (r.url.path.startsWith('/users/profiles/')) {
          return f.json(f.peer('an'));
        }
        searches++;
        return f.json({
          'data': [f.peer(searches == 1 ? 'an' : 'binh')],
          'hasMore': true,
          'nextCursor': 'snapshot:$searches',
        });
      });
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem thêm'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem hồ sơ').first);
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(searches, 2);
      expect(find.text('@an'), findsOneWidget);
      expect(find.text('@binh'), findsOneWidget);
      expect(find.text('Xem thêm'), findsOneWidget);
    },
  );

  testWidgets('Vietnamese search sends q and uses the returned cursor', (
    tester,
  ) async {
    final queries = <Map<String, String>>[];
    final api = f.apiFor((r) async {
      queries.add(r.url.queryParameters);
      return f.json({
        'data': [
          f.peer(
            r.url.queryParameters.containsKey('cursor') ? 'minh2' : 'minh1',
          ),
        ],
        'hasMore': !r.url.queryParameters.containsKey('cursor'),
        'nextCursor': 'snapshot:1',
        'degraded': true,
      });
    });
    await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
    await tester.enterText(
      find.byKey(const Key('friend-search')),
      'Nguyễn Đặng',
    );
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(queries.first['q'], 'nguyễn đặng');
    expect(queries.first.containsKey('username'), isFalse);
    expect(
      find.textContaining('Thông tin bạn chung tạm chưa khả dụng.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Xem thêm'));
    await tester.pumpAndSettle();
    expect(queries.last['cursor'], 'snapshot:1');
    expect(find.text('@minh2'), findsOneWidget);
  });
  testWidgets('cold start offers search, profile link and a real QR code', (
    tester,
  ) async {
    final api = f.apiFor(
      (r) async => r.url.path.endsWith('/me')
          ? f.json({'username': 'alice'})
          : f.json({'data': [], 'hasMore': false, 'state': 'cold_start'}),
    );
    await tester.pumpWidget(
      MaterialApp(home: FriendsScreen(api: api, initialTab: 5)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.text('Sao chép liên kết'), findsOneWidget);
    expect(
      find.textContaining('https://loccoc.bus-ticket.xyz/alice'),
      findsOneWidget,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Tìm bạn'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('friend-search')), findsOneWidget);
  });
  testWidgets(
    'maintenance is distinguishable from an empty recommendation list',
    (tester) async {
      final api = f.apiFor(
        (r) async =>
            f.json({'data': [], 'state': 'maintenance', 'hasMore': false}),
      );
      await tester.pumpWidget(
        MaterialApp(home: FriendsScreen(api: api, initialTab: 5)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hệ thống gợi ý đang tạm bảo trì.'), findsOneWidget);
      expect(find.text('Chưa có gợi ý phù hợp.'), findsNothing);
    },
  );
  testWidgets(
    'dismiss removes a recommendation after the server acknowledges it',
    (tester) async {
      var dismissed = false;
      final api = f.apiFor((r) async {
        if (r.method == 'POST') {
          expect(r.url.path, '/users/recommendations/an/dismiss');
          dismissed = true;
          return f.json({}, 204);
        }
        return f.json({
          'data': dismissed ? [] : [f.peer('an')],
          'state': 'ready',
          'hasMore': false,
        });
      });
      await tester.pumpWidget(
        MaterialApp(home: FriendsScreen(api: api, initialTab: 5)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ẩn gợi ý'));
      await tester.pumpAndSettle();
      expect(dismissed, isTrue);
      expect(find.text('@an'), findsNothing);
    },
  );
  testWidgets('privacy switches retain the saved value after a failed update', (
    tester,
  ) async {
    final api = f.apiFor((r) async {
      if (r.method == 'PATCH') {
        expect(jsonDecode(r.body), {'mutualVisibility': false});
        return f.json({'message': 'unavailable'}, 503);
      }
      return f.json({'recommendable': true, 'mutualVisibility': true});
    });
    await tester.pumpWidget(
      MaterialApp(home: DiscoveryPrivacyScreen(api: api)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('privacy_mutual')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<SwitchListTile>(find.byKey(const Key('privacy_mutual')))
          .value,
      isTrue,
    );
    expect(
      find.text('Không thể hoàn tất thao tác. Vui lòng thử lại.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'hidden and unavailable mutual evidence never render a zero count',
    (tester) async {
      final api = f.apiFor((r) async => f.json({}));
      for (final state in ['hidden', 'unavailable']) {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: MutualFriendsSummary(
                api: api,
                targetId: 'an',
                evidence: {'state': state, 'count': null, 'data': []},
              ),
            ),
          ),
        );
        expect(find.textContaining('bạn chung'), findsNothing);
      }
    },
  );
  testWidgets(
    'an in-flight response predating a block cannot reinsert a result',
    (tester) async {
      final response = Completer<http.Response>();
      final api = f.apiFor(
        (r) =>
            r.method == 'PUT' ? Future.value(f.json({}, 204)) : response.future,
      );
      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      await api.request('PUT', 'blocks/an');
      response.complete(
        f.json({
          'data': [f.peer('an')],
          'hasMore': false,
        }),
      );
      await tester.pumpAndSettle();
      expect(find.text('@an'), findsNothing);
    },
  );
  testWidgets(
    'mutual detail uses cursor mode and shows unavailable without a false zero',
    (tester) async {
      final api = f.apiFor((r) async {
        expect(r.url.queryParameters.containsKey('page'), isFalse);
        return f.json({
          'state': 'unavailable',
          'count': null,
          'data': [],
          'hasMore': false,
        });
      });
      await tester.pumpWidget(
        MaterialApp(
          home: MutualFriendsScreen(api: api, targetId: 'an'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Thông tin bạn chung tạm chưa khả dụng.'),
        findsOneWidget,
      );
      expect(find.text('0 bạn chung'), findsNothing);
    },
  );
  testWidgets('Home has a real Friends tab with friends and suggestions', (
    tester,
  ) async {
    final reads = <String>[];
    final api = f.apiFor((r) async {
      reads.add(r.url.path);
      return f.json({
        'data': [],
        'hasMore': false,
        'state': 'ready',
        'unseenCount': 0,
      });
    });
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          session: f.session,
          userApi: api,
          googleAuthService: GoogleAuthService(apiClient: api.auth),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bạn bè').last);
    await tester.pumpAndSettle();
    expect(reads, contains('/users/friends'));
    expect(find.widgetWithText(ChoiceChip, 'Tìm bạn'), findsNothing);
    expect(find.widgetWithText(ChoiceChip, 'Đã chặn'), findsNothing);
    expect(find.byKey(const Key('friends_privacy_button')), findsNothing);
    for (final label in const ['Lời mời đến', 'Đã gửi', 'Bạn bè', 'Gợi ý']) {
      expect(find.widgetWithText(ChoiceChip, label), findsOneWidget);
    }
    await tester.ensureVisible(find.text('Gợi ý'));
    await tester.tap(find.text('Gợi ý'));
    await tester.pumpAndSettle();
    expect(reads, contains('/users/recommendations'));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'Settings reaches discovery privacy toggles and blocked users list',
    (tester) async {
      var recommendable = true;
      var mutualVisibility = true;
      final patches = <Map<String, dynamic>>[];
      final api = f.apiFor((r) async {
        if (r.url.path == '/users/me/privacy' && r.method == 'GET') {
          return f.json({
            'recommendable': recommendable,
            'mutualVisibility': mutualVisibility,
          });
        }
        if (r.url.path == '/users/me/privacy' && r.method == 'PATCH') {
          final body = Map<String, dynamic>.from(jsonDecode(r.body) as Map);
          patches.add(body);
          if (body.containsKey('recommendable')) {
            recommendable = body['recommendable'] == true;
          }
          if (body.containsKey('mutualVisibility')) {
            mutualVisibility = body['mutualVisibility'] == true;
          }
          return f.json({
            'recommendable': recommendable,
            'mutualVisibility': mutualVisibility,
          });
        }
        if (r.url.path == '/users/blocks') {
          return f.json({
            'data': [f.peer('blocked_user')],
            'hasMore': false,
          });
        }
        return f.json({
          'data': [],
          'hasMore': false,
          'friendCount': 1,
          'unseenCount': 0,
          'unreadCount': 0,
        });
      });

      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: f.session,
            userApi: api,
            googleAuthService: GoogleAuthService(apiClient: api.auth),
            initialTab: 2,
            profile: const {'username': 'alice', 'displayName': 'Alice'},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('profile_settings')));
      await tester.tap(find.byKey(const Key('profile_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(SettingsPrivacyScreen), findsOneWidget);
      expect(
        find.byKey(const Key('discovery_privacy_settings')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('blocked_users_settings')), findsOneWidget);

      await tester.tap(find.byKey(const Key('discovery_privacy_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(DiscoveryPrivacyScreen), findsOneWidget);
      await tester.tap(find.byKey(const Key('privacy_recommendable')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('privacy_mutual')));
      await tester.pumpAndSettle();
      expect(patches, [
        {'recommendable': false},
        {'mutualVisibility': false},
      ]);
      expect(
        tester
            .widget<SwitchListTile>(
              find.byKey(const Key('privacy_recommendable')),
            )
            .value,
        isFalse,
      );
      expect(
        tester
            .widget<SwitchListTile>(find.byKey(const Key('privacy_mutual')))
            .value,
        isFalse,
      );

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('blocked_users_settings')));
      await tester.pumpAndSettle();
      expect(find.byType(FriendsScreen), findsOneWidget);
      expect(find.text('Đã chặn'), findsOneWidget);
      expect(find.byType(ChoiceChip), findsNothing);
      for (final label in const [
        'Tìm bạn',
        'Lời mời đến',
        'Đã gửi',
        'Bạn bè',
        'Gợi ý',
      ]) {
        expect(find.text(label), findsNothing);
      }
      expect(find.byKey(const Key('friends_privacy_button')), findsNothing);
      expect(find.text('@blocked_user'), findsOneWidget);
      expect(find.text('Bỏ chặn'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'FriendsScreen requires confirmation to block and unblock users',
    (tester) async {
      final blocks = <String>{};
      final unblocks = <String>{};
      final api = f.apiFor((r) async {
        if (r.method == 'PUT' && r.url.path == '/users/blocks/an') {
          blocks.add('an');
          return f.json({}, 204);
        }
        if (r.method == 'DELETE' &&
            r.url.path == '/users/blocks/blocked_user') {
          unblocks.add('blocked_user');
          return f.json({}, 204);
        }
        if (r.url.path == '/users/blocks') {
          return f.json({
            'data': unblocks.contains('blocked_user')
                ? []
                : [f.peer('blocked_user')],
            'hasMore': false,
          });
        }
        return f.json({
          'data': [f.peer('an'), f.peer('binh')],
          'hasMore': false,
        });
      });

      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chặn'));
      await tester.pumpAndSettle();
      expect(find.text('Chặn người dùng?'), findsOneWidget);
      await tester.tap(find.text('Quay lại'));
      await tester.pumpAndSettle();
      expect(blocks, isEmpty);

      await tester.tap(find.byType(PopupMenuButton<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chặn'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(blocks, ['an']);
      expect(find.text('@an'), findsNothing);
      expect(find.text('@binh'), findsOneWidget);

      await tester.tap(find.text('Đã chặn'));
      await tester.pumpAndSettle();
      expect(find.text('@blocked_user'), findsOneWidget);
      await tester.tap(find.text('Bỏ chặn'));
      await tester.pumpAndSettle();
      expect(find.text('Bỏ chặn người dùng?'), findsOneWidget);
      await tester.tap(find.text('Quay lại'));
      await tester.pumpAndSettle();
      expect(unblocks, isEmpty);

      await tester.tap(find.text('Bỏ chặn'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(unblocks, ['blocked_user']);
      expect(find.text('@blocked_user'), findsNothing);
    },
  );

  testWidgets(
    'FriendsScreen privacy shortcut reloads suggestions after change and rejects double-@ query locally',
    (tester) async {
      var recLoads = 0;
      var searchCalls = 0;
      final api = f.apiFor((r) async {
        if (r.url.path == '/users/recommendations') {
          recLoads++;
          return f.json({
            'data': [f.peer('binh')],
            'hasMore': false,
            'state': 'ready',
          });
        }
        if (r.url.path == '/users/me/privacy') {
          return f.json({
            'recommendable': r.method == 'GET',
            'mutualVisibility': true,
          });
        }
        if (r.url.path == '/users/search') {
          searchCalls++;
        }
        return f.json({'data': [], 'hasMore': false});
      });

      await tester.pumpWidget(
        MaterialApp(home: FriendsScreen(api: api, initialTab: 5)),
      );
      await tester.pumpAndSettle();
      expect(recLoads, 1);

      await tester.tap(find.byKey(const Key('friends_privacy_button')));
      await tester.pumpAndSettle();
      expect(find.byType(DiscoveryPrivacyScreen), findsOneWidget);
      await tester.tap(find.byKey(const Key('privacy_recommendable')));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(recLoads, 2);

      await tester.tap(find.text('Tìm bạn'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('friend-search')), '@@ab');
      await tester.pump(const Duration(milliseconds: 400));
      expect(searchCalls, 0);
      expect(find.textContaining('tối đa một dấu @ ở đầu'), findsOneWidget);
      expect(find.text('Thử lại'), findsNothing);
    },
  );

  testWidgets(
    'UsernameProfileScreen supports unfriend and blocking back into FriendsScreen',
    (tester) async {
      var anBlocked = false;
      var anFriends = true;
      final api = f.apiFor((r) async {
        if (r.method == 'DELETE' && r.url.path == '/users/friends/an') {
          anFriends = false;
          return f.json({}, 204);
        }
        if (r.method == 'PUT' && r.url.path == '/users/blocks/an') {
          anBlocked = true;
          anFriends = false;
          return f.json({}, 204);
        }
        if (r.url.path == '/users/profiles/by-username/an') {
          if (anBlocked) return f.json({'message': 'User not found'}, 404);
          return f.json(f.peer('an', status: anFriends ? 'FRIENDS' : 'NONE'));
        }
        return f.json({
          'data': [
            f.peer('an', status: anFriends ? 'FRIENDS' : 'NONE'),
            f.peer('binh'),
          ],
          'hasMore': false,
        });
      });

      await tester.pumpWidget(MaterialApp(home: FriendsScreen(api: api)));
      await tester.enterText(find.byKey(const Key('friend-search')), 'an');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Xem hồ sơ').first);
      await tester.pumpAndSettle();
      expect(find.byType(UsernameProfileScreen), findsOneWidget);

      await tester.tap(find.byKey(const Key('profile_more_actions')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_unfriend_action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(anFriends, isFalse);
      expect(find.text('Kết bạn'), findsOneWidget);

      await tester.tap(find.byKey(const Key('profile_more_actions')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('profile_block_action')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(anBlocked, isTrue);
      expect(find.byType(UsernameProfileScreen), findsNothing);
      expect(find.text('@an'), findsNothing);
      expect(find.text('@binh'), findsOneWidget);
      expect(find.text('Đã chặn người dùng.'), findsOneWidget);
    },
  );
}
