import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Counts continuous visible time, never time spent under another route or tab.
class ViewDwell extends StatefulWidget {
  const ViewDwell({
    super.key,
    required this.child,
    required this.active,
    required this.ready,
    required this.onViewed,
  });
  final Widget child;
  final bool active, ready;
  final Future<bool> Function() onViewed;
  @override
  State<ViewDwell> createState() => _ViewDwellState();
}

class _ViewDwellState extends State<ViewDwell> with WidgetsBindingObserver {
  Timer? _timer, _dwell, _cooldown;
  ScrollPosition? _position;
  bool _scrollCheckQueued = false;
  bool _reported = false, _pending = false, _foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final state = WidgetsBinding.instance.lifecycleState;
    _foreground = state == null || state == AppLifecycleState.resumed;
    _timer = Timer.periodic(const Duration(milliseconds: 200), (_) => _check());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _resetDwell();
  }

  @override
  void didUpdateWidget(covariant ViewDwell old) {
    super.didUpdateWidget(old);
    if (!widget.active || !widget.ready) _resetDwell();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = Scrollable.maybeOf(context)?.position;
    if (!identical(next, _position)) {
      _position?.removeListener(_onScroll);
      _position = next;
      _position?.addListener(_onScroll);
    }
    // Listen to route visibility changes, including a briefly covering dialog.
    if (!(ModalRoute.isCurrentOf(context) ?? true)) _resetDwell();
  }

  void _onScroll() {
    if (_scrollCheckQueued) return;
    _scrollCheckQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollCheckQueued = false;
      if (mounted) _check();
    });
  }

  void _resetDwell() {
    _dwell?.cancel();
    _dwell = null;
  }

  bool _visible() {
    if (!mounted) return false;
    final box = context.findRenderObject();
    bool visible =
        widget.active &&
        widget.ready &&
        _foreground &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    if (visible && box is RenderBox && box.hasSize && box.attached) {
      final rect = box.localToGlobal(Offset.zero) & box.size;
      final Object? viewport = RenderAbstractViewport.maybeOf(box);
      var bounds = Offset.zero & MediaQuery.sizeOf(context);
      if (viewport is RenderBox && viewport.hasSize) {
        bounds = bounds.intersect(
          viewport.localToGlobal(Offset.zero) & viewport.size,
        );
      }
      final overlap = rect.intersect(bounds);
      visible =
          rect.width > 0 &&
          rect.height > 0 &&
          !overlap.isEmpty &&
          overlap.width * overlap.height >= rect.width * rect.height * .5;
    } else {
      visible = false;
    }
    return visible;
  }

  void _check() {
    if (!mounted || _reported) return;
    if (!_visible()) {
      _resetDwell();
      return;
    }
    if (_pending || _cooldown != null || _dwell != null) return;
    _dwell = Timer(const Duration(seconds: 1), () {
      _dwell = null;
      if (!_visible()) return;
      _pending = true;
      unawaited(_report());
    });
  }

  Future<void> _report() async {
    bool success = false;
    try {
      success = await widget.onViewed();
    } catch (_) {
      /* Retry after transient transport failure. */
    }
    if (!mounted) return;
    _pending = false;
    _reported = success;
    if (!success) {
      _cooldown = Timer(const Duration(seconds: 5), () => _cooldown = null);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _dwell?.cancel();
    _cooldown?.cancel();
    _position?.removeListener(_onScroll);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
