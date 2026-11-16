import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../auth/data/services/auth_api_client.dart';
import '../../users/data/profile_image_picker.dart';
import '../data/moment_api.dart';

class MomentsScreen extends StatefulWidget {
  final MomentApi api;
  final bool active;
  const MomentsScreen({super.key, required this.api, this.active = true});
  @override
  State<MomentsScreen> createState() => _MomentsScreenState();
}

class _MomentsScreenState extends State<MomentsScreen> {
  final query = TextEditingController();
  final place = TextEditingController();
  List<Map<String, dynamic>> items = [];
  final images = <String, Future<Uint8List>>{};
  String appliedQuery = '';
  String? cursor;
  String? error;
  bool busy = false;
  bool degraded = false;
  bool loaded = false;
  Map<String, dynamic> appliedFilters = {};
  int epoch = 0;
  DateTimeRange? dates;
  Timer? poll;
  bool get current => mounted && widget.api.isCurrent;

  @override
  void initState() {
    super.initState();
    if (widget.active) unawaited(load());
  }

  @override
  void didUpdateWidget(covariant MomentsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.active) {
      poll?.cancel();
      epoch++;
      busy = false;
    }
    if (widget.active && !oldWidget.active) unawaited(load());
  }

  Future<void> load({
    bool search = false,
    bool more = false,
    bool silent = false,
  }) async {
    if (!current || !widget.active) return;
    if (search) appliedQuery = query.text.trim();
    final revision = ++epoch;
    poll?.cancel();
    if (!silent) {
      setState(() {
        busy = true;
        error = null;
      });
    }
    try {
      final result = appliedQuery.isEmpty
          ? await widget.api.list(cursor: more ? cursor : null)
          : await widget.api.search(
              appliedQuery,
              place: place.text,
              from: dates?.start,
              to: dates == null
                  ? null
                  : DateTime(
                      dates!.end.year,
                      dates!.end.month,
                      dates!.end.day,
                      23,
                      59,
                      59,
                      999,
                    ),
            );
      if (!current || revision != epoch) return;
      final next = (result['items'] as List).cast<Map<String, dynamic>>();
      setState(() {
        items = more ? [...items, ...next] : next;
        cursor = result['nextCursor'] as String?;
        degraded = result['mode'] == 'metadata_only';
        appliedFilters =
            (result['appliedFilters'] as Map<String, dynamic>?) ?? {};
        busy = false;
        loaded = true;
        error = null;
        images.removeWhere((id, _) => !items.any((x) => x['id'] == id));
      });
      if (items.any(
        (m) => m['indexStatus'] == 'pending' && m['state'] == 'active',
      )) {
        schedulePoll();
      }
    } catch (e) {
      if (current && revision == epoch) {
        setState(() {
          error = momentError(e);
          busy = false;
        });
      }
    }
  }

  void schedulePoll() {
    poll?.cancel();
    if (!current ||
        !widget.active ||
        !items.any(
          (m) => m['indexStatus'] == 'pending' && m['state'] == 'active',
        )) {
      return;
    }
    poll = Timer(const Duration(seconds: 5), () => unawaited(refreshPending()));
  }

  Future<void> refreshPending() async {
    final revision = epoch;
    final pending = items
        .where((m) => m['indexStatus'] == 'pending' && m['state'] == 'active')
        .take(3)
        .map((m) => m['id'] as String)
        .toList();
    for (final id in pending) {
      if (!current || !widget.active || revision != epoch) return;
      try {
        final next = await widget.api.get(id);
        if (!current || revision != epoch) return;
        setState(
          () => items = items.map((m) => m['id'] == id ? next : m).toList(),
        );
      } catch (e) {
        if (!current || revision != epoch) return;
        if (e is AuthApiException && e.statusCode == 404) {
          setState(() => items.removeWhere((m) => m['id'] == id));
          images.remove(id);
        }
      }
    }
    if (current && revision == epoch) schedulePoll();
  }

  Future<Uint8List> imageFor(String id) {
    final cached = images[id];
    if (cached != null) return cached;
    while (images.length >= 30) {
      images.remove(images.keys.first);
    }
    return images[id] = widget.api.image(id);
  }

  Future<void> chooseDates() async {
    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      initialDateRange: dates,
    );
    if (current && selected != null) setState(() => dates = selected);
  }

  Future<void> add() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MomentUploadScreen(api: widget.api),
      ),
    );
    if (current) {
      appliedQuery = '';
      query.clear();
      await load();
    }
  }

  Future<void> remove(Map<String, dynamic> moment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa khoảnh khắc?'),
        content: const Text(
          'Ảnh sẽ không còn xuất hiện trong thư viện hoặc kết quả tìm kiếm.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (confirmed != true || !current) return;
    try {
      await widget.api.remove(moment['id'] as String);
      if (current) {
        images.remove(moment['id']);
        await load();
      }
    } catch (e) {
      if (current) setState(() => error = momentError(e));
    }
  }

  @override
  void dispose() {
    epoch++;
    poll?.cancel();
    images.clear();
    query.dispose();
    place.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.isCurrent) return const SizedBox.shrink();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khoảnh khắc của tôi'),
        actions: [
          IconButton(
            onPressed: busy ? null : add,
            tooltip: 'Thêm ảnh',
            icon: const Icon(Icons.add_photo_alternate_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                TextField(
                  controller: query,
                  maxLength: 500,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => load(search: true),
                  decoration: InputDecoration(
                    labelText: 'Tìm khoảnh khắc',
                    hintText: 'Ví dụ: hoàng hôn bên bờ biển',
                    suffixIcon: IconButton(
                      tooltip: 'Tìm kiếm',
                      onPressed: busy ? null : () => load(search: true),
                      icon: const Icon(Icons.search),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: place,
                        maxLength: 120,
                        decoration: const InputDecoration(
                          labelText: 'Địa điểm (tùy chọn)',
                          counterText: '',
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Lọc ngày chụp',
                      onPressed: chooseDates,
                      icon: const Icon(Icons.date_range),
                    ),
                  ],
                ),
                if (dates != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: InputChip(
                      label: Text(
                        '${dates!.start.day}/${dates!.start.month}/${dates!.start.year} – ${dates!.end.day}/${dates!.end.month}/${dates!.end.year}',
                      ),
                      onDeleted: () => setState(() => dates = null),
                    ),
                  ),
                if (degraded)
                  const Padding(
                    padding: EdgeInsets.all(8),
                    child: Text(
                      'Tìm kiếm hình ảnh tạm gián đoạn. Đang tìm theo chú thích, thẻ và địa điểm.',
                    ),
                  ),
                if (appliedFilters['dateFrom'] != null ||
                    appliedFilters['dateTo'] != null)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      'Khoảng ngày đang áp dụng: ${filterDate(appliedFilters['dateFrom'])} – ${filterDate(appliedFilters['dateTo'])}',
                    ),
                  ),
                if (error != null)
                  Row(
                    children: [
                      Expanded(child: Text(error!)),
                      TextButton(
                        onPressed: () => load(),
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          if (busy) const LinearProgressIndicator(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => load(),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: items.isEmpty
                    ? (loaded ? 1 : 0)
                    : items.length + (cursor == null ? 0 : 1),
                itemBuilder: (context, index) {
                  if (items.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        appliedQuery.isEmpty
                            ? 'Chưa có khoảnh khắc. Hãy thêm ảnh đầu tiên.'
                            : 'Không tìm thấy khoảnh khắc phù hợp.',
                      ),
                    );
                  }
                  if (index < items.length) return _card(items[index]);
                  return TextButton(
                    onPressed: busy ? null : () => load(more: true),
                    child: const Text('Xem thêm'),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(Map<String, dynamic> m) {
    final id = m['id'] as String;
    return Card(
      key: ValueKey(id),
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (m['state'] == 'active')
            FutureBuilder<Uint8List>(
              future: imageFor(id),
              builder: (context, snap) {
                if (snap.hasData && widget.api.isCurrent) {
                  return Image.memory(
                    snap.data!,
                    height: 220,
                    fit: BoxFit.contain,
                    gaplessPlayback: false,
                  );
                }
                if (snap.hasError) {
                  return TextButton(
                    onPressed: () => setState(() => images.remove(id)),
                    child: const Text('Tải lại ảnh'),
                  );
                }
                return const SizedBox(
                  height: 150,
                  child: Center(child: CircularProgressIndicator()),
                );
              },
            ),
          ListTile(
            title: Text(
              (m['caption'] as String?)?.isNotEmpty == true
                  ? m['caption'] as String
                  : 'Khoảnh khắc',
            ),
            subtitle: Text(
              '${m['place'] ?? ''}\n${m['state'] == 'draft'
                  ? 'Bản nháp · Chưa tải ảnh'
                  : m['indexStatus'] == 'ready'
                  ? 'Sẵn sàng tìm kiếm thông minh'
                  : m['indexStatus'] == 'failed'
                  ? 'Chưa lập chỉ mục · Ảnh đã được lưu'
                  : 'Đã lưu ảnh · Đang lập chỉ mục'}',
            ),
            trailing: IconButton(
              tooltip: 'Xóa khoảnh khắc',
              onPressed: () => remove(m),
              icon: const Icon(Icons.delete_outline),
            ),
          ),
          if (m['indexStatus'] == 'failed')
            TextButton(
              onPressed: () async {
                try {
                  await widget.api.retry(id);
                  if (current) await load();
                } catch (e) {
                  if (current) setState(() => error = momentError(e));
                }
              },
              child: const Text('Thử lập chỉ mục lại'),
            ),
        ],
      ),
    );
  }
}

class MomentUploadScreen extends StatefulWidget {
  final MomentApi api;
  final ProfileImagePicker? picker;
  const MomentUploadScreen({super.key, required this.api, this.picker});
  @override
  State<MomentUploadScreen> createState() => _MomentUploadScreenState();
}

class _MomentUploadScreenState extends State<MomentUploadScreen> {
  final caption = TextEditingController();
  final place = TextEditingController();
  late final picker = widget.picker ?? ProfileImagePicker();
  PickedProfileImage? selected;
  DateTime capturedAt = DateTime.now();
  String? draftId;
  bool busy = false;
  bool uncertainCreate = false;
  String? error;
  bool get current => mounted && widget.api.isCurrent;
  Future<void> choose(ImageSource source) async {
    setState(() => busy = true);
    try {
      final image = await picker.pick(source, 'moment');
      if (current) setState(() => selected = image);
    } catch (_) {
      if (current) {
        setState(
          () => error = 'Chưa thể mở ảnh. Hãy kiểm tra quyền camera/thư viện.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save() async {
    if (selected == null || busy || !current || uncertainCreate) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      draftId ??=
          (await widget.api.create(caption.text, place.text, capturedAt))['id']
              as String;
      if (!current) return;
      await widget.api.upload(draftId!, selected!.bytes, selected!.contentType);
      if (mounted && widget.api.isCurrent) Navigator.of(context).pop();
    } catch (e) {
      if (current) {
        setState(() {
          uncertainCreate =
              draftId == null &&
              (e is! AuthApiException || e.statusCode >= 500);
          error = uncertainCreate
              ? 'Kết nối bị gián đoạn. Quay lại thư viện để kiểm tra bản nháp trước khi đăng lại.'
              : momentError(e);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    caption.dispose();
    place.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Thêm khoảnh khắc')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (selected != null)
            Image.memory(selected!.bytes, height: 220, fit: BoxFit.contain),
          Wrap(
            spacing: 12,
            children: [
              OutlinedButton.icon(
                onPressed: busy || draftId != null
                    ? null
                    : () => choose(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Chọn ảnh'),
              ),
              OutlinedButton.icon(
                onPressed: busy || draftId != null
                    ? null
                    : () => choose(ImageSource.camera),
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('Chụp ảnh'),
              ),
            ],
          ),
          TextField(
            controller: caption,
            maxLength: 1000,
            enabled: !busy && draftId == null,
            decoration: const InputDecoration(labelText: 'Chú thích'),
          ),
          TextField(
            controller: place,
            maxLength: 120,
            enabled: !busy && draftId == null,
            decoration: const InputDecoration(labelText: 'Địa điểm'),
          ),
          TextButton(
            onPressed: busy || draftId != null
                ? null
                : () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: capturedAt,
                      firstDate: DateTime(1900),
                      lastDate: DateTime.now(),
                    );
                    if (current && date != null) {
                      setState(() => capturedAt = date);
                    }
                  },
            child: Text(
              'Ngày chụp: ${capturedAt.day}/${capturedAt.month}/${capturedAt.year}',
            ),
          ),
          const Text(
            'Khi tìm kiếm thông minh được bật, ảnh đã xử lý và câu tìm kiếm được gửi tới Google Gemini.',
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(error!),
            ),
          FilledButton(
            onPressed: selected == null || busy || uncertainCreate
                ? null
                : save,
            child: Text(
              busy
                  ? 'Đang lưu ảnh…'
                  : draftId == null
                  ? 'Lưu khoảnh khắc'
                  : 'Thử tải ảnh lại',
            ),
          ),
        ],
      ),
    ),
  );
}

String momentError(Object e) {
  if (e is AuthApiException) {
    if (e.statusCode == 413) return 'Ảnh vượt quá giới hạn 10 MiB.';
    if (e.statusCode == 429) {
      return 'Đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.';
    }
    if (e.statusCode == 503) {
      return 'Tính năng tạm thời chưa sẵn sàng. Vui lòng thử lại sau.';
    }
    if (e.statusCode == 400 || e.statusCode == 415) {
      return 'Ảnh hoặc bộ lọc không hợp lệ. Hỗ trợ JPEG, PNG và WebP tĩnh.';
    }
  }
  return 'Chưa thể hoàn tất yêu cầu. Kiểm tra kết nối và thử lại.';
}

String filterDate(dynamic value) {
  if (value is! String) return 'không giới hạn';
  final date = DateTime.tryParse(value)?.toLocal();
  return date == null
      ? 'không giới hạn'
      : '${date.day}/${date.month}/${date.year}';
}
