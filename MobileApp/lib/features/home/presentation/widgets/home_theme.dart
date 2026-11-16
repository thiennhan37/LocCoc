import 'package:flutter/material.dart';

/// Palette scoped to the signed-in home tabs.
class HomeColors {
  static const background = Colors.black;
  static const surface = Color(0xFF1C1C1E);
  static const card = surface;
  static const border = Color(0xFF404044);
  static const textPrimary = Color(0xFFF5F5F5);
  static const textSecondary = Color(0xFFBDBDC3);
  static const primary = Color(0xFFFF9B8F);
  static const coralLight = Color(0xFF332521);
  static const coralBorder = Color(0xFF81564F);
  static const primarySoft = coralLight;
  static const error = Color(0xFFFFB4AB);

  static ThemeData get theme => ThemeData.dark(useMaterial3: true).copyWith(
    scaffoldBackgroundColor: background,
    colorScheme: const ColorScheme.dark(
      primary: primary,
      onPrimary: Color(0xFF35100B),
      surface: surface,
      onSurface: textPrimary,
      onSurfaceVariant: textSecondary,
      outline: border,
      error: error,
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: surface,
      labelStyle: TextStyle(color: textSecondary),
      hintStyle: TextStyle(color: textSecondary),
    ),
  );
}
