import 'package:flutter/foundation.dart';

// A release/profile build cannot enable these capabilities with a Dart define.
const developerToolsEnabled =
    kDebugMode && bool.fromEnvironment('LOCCOC_DEV_TOOLS');
