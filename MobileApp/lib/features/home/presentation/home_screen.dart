import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import '../application/camera_session.dart';
import '../../../core/navigation/app_route_observer.dart';
import '../../posts/presentation/photo_editor_screen.dart';

const _coral = Color(0xFFFF896D);
const _ink = Color(0xFF20211F);
const _cream = Color(0xFFF7F6F2);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.camera});
  final CameraSession? camera;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with WidgetsBindingObserver, RouteAware {
  late final CameraSession _camera;
  final List<Uint8List> _memories = [];
  int _tab = 0;
  bool _covered = false;
  bool _sheetOpen = false;

  bool get _shouldUseCamera => _tab == 0 && !_covered && !_sheetOpen;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null) appRouteObserver.subscribe(this, route);
  }

  @override
  void didPushNext() {
    _covered = true;
    unawaited(_camera.stop());
  }

  @override
  void didPopNext() {
    _covered = false;
    if (_shouldUseCamera) unawaited(_camera.start());
  }

  @override
  void initState() {
    super.initState();
    _camera = widget.camera ?? CameraSession();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_camera.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _shouldUseCamera) {
      unawaited(_camera.start());
    } else if (state != AppLifecycleState.resumed) {
      unawaited(_camera.stop());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    appRouteObserver.unsubscribe(this);
    if (widget.camera == null) {
      _camera.dispose();
    } else {
      unawaited(_camera.stop());
    }
    super.dispose();
  }

  void _select(int tab) {
    if (tab == _tab) return;
    setState(() => _tab = tab);
    unawaited(tab == 0 ? _camera.start() : _camera.stop());
  }

  Future<void> _showInfo(bool friends) async {
    _sheetOpen = true;
    await _camera.stop();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: _cream,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 12, 28, 36),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                friends ? Icons.people_outline : Icons.person_outline,
                color: _coral,
                size: 42,
              ),
              const SizedBox(height: 16),
              Text(
                friends ? 'Một vòng tròn nhỏ, thật thân.' : 'Góc nhỏ của bạn',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                friends
                    ? 'Danh sách và lời mời kết bạn sẽ xuất hiện khi tài khoản được kết nối.'
                    : 'Thông tin cá nhân sẽ xuất hiện sau khi chức năng đăng nhập hoàn thiện.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54, height: 1.6),
              ),
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _ink),
                onPressed: () => Navigator.pop(context),
                child: const Text('Đã hiểu'),
              ),
            ],
          ),
        ),
      ),
    );
    _sheetOpen = false;
    if (mounted &&
        _shouldUseCamera &&
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      unawaited(_camera.start());
    }
  }

  Future<void> _captureAndEdit() async {
    await _camera.capture();
    if (mounted && _camera.photo != null) await _editPhoto();
  }

  Future<void> _editPhoto() async {
    final photo = _camera.photo;
    if (photo == null) return;
    _sheetOpen = true;
    await _camera.stop();
    if (!mounted) return;
    final result = await Navigator.of(context).push<PublishedPhoto>(
      MaterialPageRoute(builder: (_) => PhotoEditorScreen(photo: photo)),
    );
    if (!mounted) return;
    _sheetOpen = false;
    _covered = false;
    if (_shouldUseCamera && WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      unawaited(_camera.start());
    }
    _camera.retake();
    if (result == null) return;
    setState(() {
      _memories.insert(0, result.bytes);
      if (_memories.length > 12) _memories.removeLast();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.fromLTRB(22, 0, 22, 100),
        duration: Duration(seconds: 2),
        content: Text('Đã đăng khoảnh khắc của bạn.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(
        colorScheme: const ColorScheme.light(
          primary: _ink,
          secondary: _coral,
          surface: _cream,
        ),
      ),
      child: Scaffold(
        backgroundColor: _cream,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                children: [
                  _header(),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(22, 8, 22, 24),
                      child: _tab == 0 ? _cameraPage() : _memoryPage(),
                    ),
                  ),
                  _navigation(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() => Padding(
    padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
    child: Row(
      children: [
        _roundButton(
          'Hồ sơ',
          Icons.person_outline_rounded,
          () => _showInfo(false),
        ),
        const Expanded(
          child: Column(
            children: [
              Text(
                'loccoc',
                style: TextStyle(
                  color: _ink,
                  fontSize: 29,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.5,
                ),
              ),
              Text(
                'GẦN NHAU HƠN MỖI NGÀY',
                style: TextStyle(
                  fontSize: 8,
                  letterSpacing: 2,
                  color: Colors.black45,
                ),
              ),
            ],
          ),
        ),
        _roundButton(
          'Bạn bè',
          Icons.people_outline_rounded,
          () => _showInfo(true),
        ),
      ],
    ),
  );

  Widget _cameraPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFAD8F), _coral],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'MỘT CHÚT ĐỜI THƯỜNG',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2,
                    ),
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Chuyện nhỏ thôi.\nThương nhiều hơn.',
                    style: TextStyle(
                      fontSize: 25,
                      height: 1.16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -.9,
                      color: _ink,
                    ),
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Bắt lấy một khoảnh khắc thật bạn.',
                    style: TextStyle(fontSize: 11, color: Color(0xFF643E31)),
                  ),
                ],
              ),
            ),
            Container(
              width: 58,
              height: 78,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white54),
                borderRadius: BorderRadius.circular(40),
              ),
              child: const Icon(
                Icons.favorite_rounded,
                color: Colors.white,
                size: 30,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 24),
      const Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        runSpacing: 8,
        children: [
          Text(
            'Ngay lúc này',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -.6,
            ),
          ),
          Text(
            'CHỈ MỘT KHOẢNH KHẮC',
            style: TextStyle(
              fontSize: 8,
              letterSpacing: 1,
              color: Colors.black54,
            ),
          ),
        ],
      ),
      const SizedBox(height: 14),
      ListenableBuilder(
        listenable: _camera,
        builder: (_, _) => Column(
          children: [
            _viewfinder(),
            if (_camera.message.isNotEmpty &&
                _camera.status == CameraStatus.ready)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_camera.message, textAlign: TextAlign.center),
              ),
            const SizedBox(height: 18),
            if (_camera.photo != null) ...[
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _camera.retake,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Chụp lại'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: _ink),
                      onPressed: _editPhoto,
                      icon: const Icon(Icons.edit_rounded),
                      label: const Text('Chỉnh và gửi'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Thêm màu và một lời nhắn trước khi gửi',
                style: TextStyle(fontSize: 11, color: Colors.black45),
              ),
            ] else ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _roundButton(
                    'Flash tự động',
                    _camera.flash
                        ? Icons.flash_auto_rounded
                        : Icons.flash_off_rounded,
                    _camera.ready ? _camera.toggleFlash : null,
                  ),
                  Semantics(
                    button: true,
                    label: 'Chụp ảnh',
                    child: SizedBox(
                      width: 82,
                      height: 82,
                      child: OutlinedButton(
                        key: const ValueKey('camera-shutter'),
                        onPressed: _camera.ready ? _captureAndEdit : null,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.all(6),
                          side: BorderSide(
                            color: _camera.ready ? _coral : Colors.black12,
                            width: 3,
                          ),
                          shape: const CircleBorder(),
                        ),
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _camera.ready ? _coral : Colors.black12,
                          ),
                          child: Center(
                            child: _camera.busy
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.camera_alt_outlined,
                                    color: Colors.white,
                                    size: 28,
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  _roundButton(
                    'Đổi camera',
                    Icons.cameraswitch_outlined,
                    _camera.ready && _camera.canFlip ? _camera.flip : null,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Không cần hoàn hảo. Chỉ cần là bạn.',
                style: TextStyle(color: Colors.black45, fontSize: 11),
              ),
            ],
          ],
        ),
      ),
    ],
  );

  Widget _viewfinder() => AspectRatio(
    aspectRatio: 1,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(36),
      child: ColoredBox(
        color: _ink,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (_camera.photo != null)
              Image.memory(_camera.photo!, fit: BoxFit.contain)
            else if (_camera.status == CameraStatus.ready)
              _camera.preview()
            else
              Padding(
                padding: const EdgeInsets.all(26),
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_camera.status == CameraStatus.loading)
                          const CircularProgressIndicator(color: _coral)
                        else ...[
                          const Icon(
                            Icons.camera_alt_outlined,
                            size: 40,
                            color: _coral,
                          ),
                          const SizedBox(height: 14),
                          Text(
                            _camera.status == CameraStatus.denied
                                ? 'Cho LocCoc nhìn thấy bạn nhé'
                                : 'Camera đang chờ bạn',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _camera.message,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white60,
                              fontSize: 12,
                              height: 1.5,
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextButton(
                            onPressed: _camera.start,
                            style: TextButton.styleFrom(
                              foregroundColor: _coral,
                            ),
                            child: const Text('Thử mở camera'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            Positioned(
              top: 18,
              left: 18,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: Colors.black45,
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Text(
                  _camera.photo != null
                      ? 'ẢNH VỪA CHỤP'
                      : 'KHOẢNH KHẮC CỦA BẠN',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 8,
                    letterSpacing: 1.3,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _memoryPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Những điều\nmuốn giữ lại.',
        style: TextStyle(
          fontSize: 36,
          height: 1.15,
          letterSpacing: -1.4,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 12),
      const Text(
        '12 ảnh vừa đăng trong phiên này. Ảnh gốc được lưu trên máy chủ.',
        style: TextStyle(color: Colors.black54, fontSize: 12, height: 1.5),
      ),
      const SizedBox(height: 24),
      if (_memories.isEmpty)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 50),
          decoration: BoxDecoration(
            color: const Color(0xFFFFE6DC),
            borderRadius: BorderRadius.circular(32),
          ),
          child: Column(
            children: [
              const Icon(Icons.photo_library_outlined, color: _coral, size: 46),
              const SizedBox(height: 20),
              const Text(
                'Một ngày bình thường,\nmột tấm ảnh đáng nhớ.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w600,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => _select(0),
                child: const Text('Chụp khoảnh khắc đầu tiên'),
              ),
            ],
          ),
        )
      else
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _memories.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
          ),
          itemBuilder: (_, index) => ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Image.memory(
              _memories[index],
              fit: BoxFit.cover,
              semanticLabel: 'Khoảnh khắc ${index + 1}',
            ),
          ),
        ),
    ],
  );

  Widget _navigation() => Padding(
    padding: const EdgeInsets.fromLTRB(22, 8, 22, 16),
    child: Row(
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: _ink,
              borderRadius: BorderRadius.circular(40),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              children: [
                _navItem('Chụp ảnh', Icons.camera_alt_outlined, 0),
                _navItem('Kỷ niệm', Icons.grid_view_rounded, 1),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        IconButton.filled(
          tooltip: 'Vòng tròn bạn bè',
          onPressed: () => _showInfo(true),
          style: IconButton.styleFrom(
            backgroundColor: _coral,
            foregroundColor: _ink,
            fixedSize: const Size(60, 60),
          ),
          icon: const Icon(Icons.people_outline_rounded),
        ),
      ],
    ),
  );

  Widget _navItem(String label, IconData icon, int tab) => Expanded(
    child: TextButton.icon(
      onPressed: () => _select(tab),
      style: TextButton.styleFrom(
        foregroundColor: _tab == tab ? _coral : Colors.white60,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
      ),
      icon: Icon(icon, size: 18),
      label: Text(label, style: const TextStyle(fontSize: 11)),
    ),
  );

  Widget _roundButton(String label, IconData icon, VoidCallback? onPressed) =>
      IconButton(
        tooltip: label,
        onPressed: onPressed,
        icon: Icon(icon, size: 23),
        style: IconButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: _ink,
          disabledForegroundColor: Colors.black26,
          minimumSize: const Size(48, 48),
          side: const BorderSide(color: Color(0xFFECEAE5)),
        ),
      );
}
