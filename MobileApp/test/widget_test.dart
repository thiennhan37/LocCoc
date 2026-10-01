import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('shows only the basic login form', (tester) async {
    await tester.pumpWidget(const LocCocApp());

    expect(find.text('Email hoặc Số điện thoại'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.text('Đăng ký'), findsNothing);
    expect(find.byType(TextFormField), findsNWidgets(2));
  });

  testWidgets('valid input never creates a fake login session', (tester) async {
    await tester.pumpWidget(const LocCocApp());
    await tester.enterText(
      find.byType(TextFormField).first,
      'user@example.com',
    );
    await tester.enterText(find.byType(TextFormField).last, 'password123');
    await tester.tap(find.text('Đăng nhập'));
    await tester.pump();

    expect(
      find.text('Đăng nhập chưa khả dụng. Vui lòng thử lại sau.'),
      findsOneWidget,
    );
  });
}
