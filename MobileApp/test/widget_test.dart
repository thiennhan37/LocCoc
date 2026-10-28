import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/home/presentation/screens/home_screen.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('shows the login form and social auth options', (tester) async {
    await tester.pumpWidget(const LocCocApp());

    expect(find.text('Email hoặc Số điện thoại'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.text('Đăng ký'), findsNothing);
    expect(find.text('HOẶC'), findsOneWidget);
    expect(find.text('Đăng nhập với Google'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
  });

  testWidgets('validates input fields correctly', (tester) async {
    await tester.pumpWidget(const LocCocApp());

    // Tap login with empty fields
    await tester.tap(find.text('Đăng nhập'));
    await tester.pump();

    // Both email and password fields report required
    expect(find.text('Trường này không được để trống'), findsNWidgets(2));

    // Enter email but short password
    await tester.enterText(
      find.byType(TextFormField).first,
      'test@loccoc.vn',
    );
    await tester.enterText(find.byType(TextFormField).last, '123');
    await tester.tap(find.text('Đăng nhập'));
    await tester.pump();

    expect(find.text('Mật khẩu phải có ít nhất 6 ký tự'), findsOneWidget);
  });

  testWidgets('logging in via explore button displays the LocCoc home screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const LocCocApp());

    final demoButton = find.text('Khám phá ngay (Tài khoản thử nghiệm)');
    expect(demoButton, findsOneWidget);
    await tester.ensureVisible(demoButton);
    await tester.tap(demoButton);
    await tester.pumpAndSettle();

    // Verify: Navigated to HomeScreen and displays Home Page elements
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('LocCoc'), findsOneWidget);
    expect(find.text('Một chút hôm nay.'), findsOneWidget);
    expect(find.text('Những điều nhỏ xíu, gửi người thân yêu.'), findsOneWidget);
    expect(find.text('Mời bạn'), findsOneWidget);
    expect(find.text('Gửi một khoảnh khắc'), findsOneWidget);
    expect(find.text('Trang chủ'), findsOneWidget);
    expect(find.text('Kỷ niệm'), findsOneWidget);
    expect(find.text('Cá nhân'), findsOneWidget);
  });

  testWidgets(
    'submitting login form attempts authentication and provides demo fallback',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(const LocCocApp());

      await tester.enterText(
        find.byType(TextFormField).first,
        'user@example.com',
      );
      await tester.enterText(find.byType(TextFormField).last, 'password123');
      await tester.tap(find.text('Đăng nhập'));
      await tester.pumpAndSettle();

      // In test environment without live backend, it shows error snackbar with demo action
      expect(find.text('Vào Demo'), findsOneWidget);

      // Tapping Vào Demo navigates to HomeScreen
      await tester.tap(find.text('Vào Demo'));
      await tester.pumpAndSettle();

      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.text('Một chút hôm nay.'), findsOneWidget);
    },
  );
}
