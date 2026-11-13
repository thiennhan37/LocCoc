import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/core/constants/app_strings.dart';
import 'package:mobile_app/features/auth/data/services/auth_api_client.dart';
import 'package:mobile_app/features/auth/data/services/google_sign_in_service.dart';
import 'package:mobile_app/features/auth/domain/models/auth_session.dart';
import 'package:mobile_app/features/auth/presentation/screens/auth_screen.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/features/users/data/user_api_client.dart';
import 'package:mobile_app/features/users/presentation/profile_link_session.dart';

class FakeGoogleSignInAdapter implements GoogleSignInAdapter {
  int signOutCalls = 0;
  @override
  Future<GoogleSignInAccountData?> signIn({String? nonce}) async => null;
  @override
  Future<void> signOut() async {
    signOutCalls++;
  }
}

const testSession = AuthSession(
  authenticated: true,
  user: AuthUser(
    id: 'user-uuid-1234',
    email: 'tester@loccoc.vn',
    role: 'user',
    status: 'active',
  ),
  accessToken: 'valid-access-token',
  refreshToken: 'valid-refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshExpiresIn: 3600,
);

void main() {
  group('UserApiClient.deleteAccount()', () {
    test('sends DELETE to /users/me with bearer authorization', () async {
      var called = false;
      final client = UserApiClient(
        auth: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.method == 'DELETE' && request.url.path == '/users/me') {
              expect(
                request.headers['Authorization'],
                'Bearer ${testSession.accessToken}',
              );
              called = true;
              return http.Response('', 200);
            }
            return http.Response('Not Found', 404);
          }),
        ),
        session: testSession,
      );

      await client.deleteAccount();
      expect(called, isTrue);
    });

    test('refreshes token on 401 and retries DELETE /users/me successfully', () async {
      var deleteAttempts = 0;
      var refreshCalled = false;
      final tokensRefreshed = <String>[];

      final client = UserApiClient(
        auth: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.url.path == '/users/me' && request.method == 'DELETE') {
              deleteAttempts++;
              if (deleteAttempts == 1) {
                expect(request.headers['Authorization'], 'Bearer valid-access-token');
                return http.Response(jsonEncode({'statusCode': 401, 'message': 'Unauthorized'}), 401);
              }
              expect(request.headers['Authorization'], 'Bearer new-access-token');
              return http.Response('', 200);
            }
            if (request.url.path == '/auth/refresh' && request.method == 'POST') {
              refreshCalled = true;
              final body = jsonDecode(request.body) as Map<String, dynamic>;
              expect(body['refreshToken'], 'valid-refresh-token');
              return http.Response(
                jsonEncode({
                  'accessToken': 'new-access-token',
                  'refreshToken': 'new-refresh-token',
                }),
                200,
              );
            }
            return http.Response('Not Found', 404);
          }),
        ),
        session: testSession,
        onSessionChanged: (s) => tokensRefreshed.add(s.accessToken),
      );

      await client.deleteAccount();
      expect(deleteAttempts, 2);
      expect(refreshCalled, isTrue);
      expect(tokensRefreshed, ['new-access-token']);
      expect(client.session.accessToken, 'new-access-token');
    });

    test('throws AuthApiException when DELETE /users/me fails', () async {
      final client = UserApiClient(
        auth: AuthApiClient(
          httpClient: MockClient((request) async {
            return http.Response(
              jsonEncode({'statusCode': 500, 'message': 'Internal Server Error'}),
              500,
            );
          }),
        ),
        session: testSession,
      );

      expect(() => client.deleteAccount(), throwsA(isA<AuthApiException>()));
    });
  });

  group('HomeScreen Account Deletion UI Flow', () {
    testWidgets('cancelling confirmation dialog does not call API and keeps session intact', (
      tester,
    ) async {
      var deleteCalls = 0;
      final fakeAdapter = FakeGoogleSignInAdapter();
      final authService = GoogleAuthService(
        signInAdapter: fakeAdapter,
        apiClient: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.method == 'DELETE') deleteCalls++;
            return http.Response('', 200);
          }),
        ),
      );
      authService.updateSession(testSession);

      final userApi = UserApiClient(
        auth: authService.apiClient,
        session: testSession,
      );

      final linkSession = ProfileLinkSession()
        ..attach(userApi, authService, {'username': 'tester'});

      await tester.pumpWidget(
        ProfileLinkScope(
          session: linkSession,
          child: MaterialApp(
            home: HomeScreen(
              session: testSession,
              googleAuthService: authService,
              userApi: userApi,
              initialTab: 2, // Start directly on Profile Tab
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify Delete Account button is visible
      final deleteBtn = find.byKey(const Key('delete_account_button'));
      expect(deleteBtn, findsOneWidget);
      await tester.ensureVisible(deleteBtn);

      // Tap Delete Account button
      await tester.tap(deleteBtn);
      await tester.pumpAndSettle();

      // Verify dialog is shown
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text(AppStrings.deleteAccountTitle),
        ),
        findsOneWidget,
      );
      expect(find.text(AppStrings.deleteAccountConfirm), findsOneWidget);

      // Tap Cancel
      await tester.tap(find.byKey(const Key('cancel_delete_account_button')));
      await tester.pumpAndSettle();

      // Dialog is gone, no DELETE call was made
      expect(find.byType(AlertDialog), findsNothing);
      expect(deleteCalls, 0);

      // User remains on HomeScreen and sessions are still attached
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(linkSession.api, isNotNull);
      expect(authService.session, isNotNull);
    });

    testWidgets('confirming deletion calls DELETE /users/me, clears sessions, and navigates to AuthScreen', (
      tester,
    ) async {
      var deleteCalls = 0;
      final fakeAdapter = FakeGoogleSignInAdapter();
      final authService = GoogleAuthService(
        signInAdapter: fakeAdapter,
        apiClient: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.method == 'DELETE' && request.url.path == '/users/me') {
              deleteCalls++;
              expect(request.headers['Authorization'], 'Bearer ${testSession.accessToken}');
              return http.Response('', 200);
            }
            return http.Response('Not Found', 404);
          }),
        ),
      );
      authService.updateSession(testSession);

      final userApi = UserApiClient(
        auth: authService.apiClient,
        session: testSession,
      );

      final linkSession = ProfileLinkSession()
        ..attach(userApi, authService, {'username': 'tester'});

      await tester.pumpWidget(
        ProfileLinkScope(
          session: linkSession,
          child: MaterialApp(
            home: HomeScreen(
              session: testSession,
              googleAuthService: authService,
              userApi: userApi,
              initialTab: 2,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Delete button
      final deleteBtn = find.byKey(const Key('delete_account_button'));
      await tester.ensureVisible(deleteBtn);
      await tester.tap(deleteBtn);
      await tester.pumpAndSettle();

      // Confirm deletion in dialog
      await tester.tap(find.byKey(const Key('confirm_delete_account_button')));
      await tester.pumpAndSettle();

      // Verify API was called
      expect(deleteCalls, 1);

      // Verify ProfileLinkSession was cleared
      expect(linkSession.api, isNull);
      expect(linkSession.auth, isNull);
      expect(linkSession.profile, isNull);

      // Verify GoogleAuthService was cleared and adapter signOut called
      expect(authService.session, isNull);
      expect(fakeAdapter.signOutCalls, 1);

      // Verify navigation stack reset to AuthScreen
      expect(find.byType(AuthScreen), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      expect(tester.state<NavigatorState>(find.byType(Navigator)).canPop(), isFalse);

      // Verify success snackbar
      expect(find.text(AppStrings.deleteAccountSuccess), findsOneWidget);
    });

    testWidgets('prevents duplicate submissions while delete request is in progress', (
      tester,
    ) async {
      final completer = Completer<http.Response>();
      var deleteCalls = 0;
      final fakeAdapter = FakeGoogleSignInAdapter();
      final authService = GoogleAuthService(
        signInAdapter: fakeAdapter,
        apiClient: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.method == 'DELETE' && request.url.path == '/users/me') {
              deleteCalls++;
              return completer.future;
            }
            return http.Response('Not Found', 404);
          }),
        ),
      );
      authService.updateSession(testSession);

      final userApi = UserApiClient(
        auth: authService.apiClient,
        session: testSession,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: HomeScreen(
            session: testSession,
            googleAuthService: authService,
            userApi: userApi,
            initialTab: 2,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Open confirmation dialog and confirm
      final deleteBtn = find.byKey(const Key('delete_account_button'));
      await tester.ensureVisible(deleteBtn);
      await tester.tap(deleteBtn);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_delete_account_button')));
      await tester.pump(); // Advance frame to start delete

      // The button should now be in loading state
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(deleteCalls, 1);

      // Try tapping the button again while in loading state
      await tester.tap(find.byKey(const Key('delete_account_button')));
      await tester.pump();
      expect(deleteCalls, 1); // No second call!

      // Complete the request
      completer.complete(http.Response('', 200));
      await tester.pumpAndSettle();

      expect(find.byType(AuthScreen), findsOneWidget);
      expect(deleteCalls, 1);
    });

    testWidgets('displays error and keeps session intact when delete API fails', (
      tester,
    ) async {
      var deleteCalls = 0;
      final fakeAdapter = FakeGoogleSignInAdapter();
      final authService = GoogleAuthService(
        signInAdapter: fakeAdapter,
        apiClient: AuthApiClient(
          httpClient: MockClient((request) async {
            if (request.method == 'DELETE') {
              deleteCalls++;
              return http.Response(
                jsonEncode({'statusCode': 500, 'message': 'Internal Server Error'}),
                500,
                headers: {'content-type': 'application/json'},
              );
            }
            return http.Response('Not Found', 404);
          }),
        ),
      );
      authService.updateSession(testSession);

      final userApi = UserApiClient(
        auth: authService.apiClient,
        session: testSession,
      );

      final linkSession = ProfileLinkSession()
        ..attach(userApi, authService, {'username': 'tester'});

      await tester.pumpWidget(
        ProfileLinkScope(
          session: linkSession,
          child: MaterialApp(
            home: HomeScreen(
              session: testSession,
              googleAuthService: authService,
              userApi: userApi,
              initialTab: 2,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Delete and confirm
      final deleteBtn = find.byKey(const Key('delete_account_button'));
      await tester.ensureVisible(deleteBtn);
      await tester.tap(deleteBtn);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm_delete_account_button')));
      await tester.pumpAndSettle();

      // Verify API was called
      expect(deleteCalls, 1);

      // Verify error message is shown
      expect(find.text('Không thể hoàn tất thao tác. Vui lòng thử lại.'), findsOneWidget);

      // Verify user remains on HomeScreen
      expect(find.byType(HomeScreen), findsOneWidget);

      // Verify session was NOT cleared
      expect(linkSession.api, isNotNull);
      expect(authService.session, isNotNull);
      expect(fakeAdapter.signOutCalls, 0);

      // Verify button is restored from loading and can be clicked again
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byKey(const Key('delete_account_button')), findsOneWidget);
    });
  });
}
