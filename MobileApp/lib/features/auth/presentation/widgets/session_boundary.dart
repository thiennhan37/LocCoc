import 'dart:async';
import 'package:flutter/material.dart';
import '../../data/services/google_sign_in_service.dart';
import '../../../users/data/user_api_client.dart';
import '../../../users/presentation/profile_link_session.dart';
import '../../../users/presentation/profile_gate.dart';
import '../screens/auth_screen.dart';

/// One shared terminal-session route for Home, onboarding and linked profiles.
class SessionBoundary extends StatefulWidget {
  final GoogleAuthService auth;
  final UserApiClient api;
  final VoidCallback? onEnding;
  final Widget child;
  const SessionBoundary({
    super.key,
    required this.auth,
    required this.api,
    required this.child,
    this.onEnding,
  });
  @override
  State<SessionBoundary> createState() => _SessionBoundaryState();
}

class _SessionBoundaryState extends State<SessionBoundary> {
  late final int generation;
  bool scheduled = false;
  @override
  void initState() {
    super.initState();
    generation = widget.auth.generation;
    widget.auth.sessionEnded.addListener(_ended);
    widget.auth.sessionReplaced.addListener(_replaced);
  }

  void _replaced() {
    final event = widget.auth.sessionReplaced.value;
    if (scheduled || event == null || event.previousGeneration != generation) {
      return;
    }
    scheduled = true;
    widget.api.invalidate();
    widget.onEnding?.call();
    scheduleMicrotask(() {
      if (!mounted || !widget.auth.claimSessionReplacement()) return;
      ProfileLinkScope.maybeOf(context)?.clear();
      final messenger = ScaffoldMessenger.maybeOf(context);
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => ProfileGate(
            session: event.session,
            authService: widget.auth,
            allowMetadataCacheFailure: !event.retentionConfirmed,
          ),
        ),
        (_) => false,
      );
      messenger?.showSnackBar(SnackBar(content: Text(event.notice)));
    });
  }

  void _ended() {
    if (scheduled || widget.auth.sessionEnded.value != generation + 1) return;
    scheduled = true;
    // Stop account work before returning to the event loop/navigation.
    widget.api.invalidate();
    widget.onEnding?.call();
    scheduleMicrotask(() {
      if (!mounted || !widget.auth.claimSessionEnd()) return;
      ProfileLinkScope.maybeOf(context)?.clear();
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) =>
              AuthScreen(googleAuthService: widget.auth, autoRestore: false),
        ),
        (_) => false,
      );
    });
  }

  @override
  void dispose() {
    widget.auth.sessionEnded.removeListener(_ended);
    widget.auth.sessionReplaced.removeListener(_replaced);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
