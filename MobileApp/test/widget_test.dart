import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('shows only the basic login form', (tester) async {
    await tester.pumpWidget(const LocCocApp());

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.text('Đăng ký'), findsNothing);
    expect(find.byType(TextFormField), findsNWidgets(2));
  });

  testWidgets('empty input does not submit login', (tester) async {
    await tester.pumpWidget(const LocCocApp());
    await tester.tap(find.text('Đăng nhập'));
    await tester.pump();
    expect(find.text('Trường này không được để trống'), findsNWidgets(2));
  });
}
