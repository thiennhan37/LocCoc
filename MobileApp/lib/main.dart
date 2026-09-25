import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/screens/auth_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LocCocApp());
}

class LocCocApp extends StatelessWidget {
  const LocCocApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LocCoc',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AuthScreen(),
    );
  }
}
