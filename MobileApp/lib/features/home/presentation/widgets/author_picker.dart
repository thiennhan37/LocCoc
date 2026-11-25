import 'package:flutter/material.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../users/data/user_api_client.dart';

class AuthorChoice {
  const AuthorChoice(this.id, this.name, [this.avatarUrl]);
  final String? id;
  final String name;
  final String? avatarUrl;
}

Future<AuthorChoice?> showAuthorPicker(
  BuildContext context, {
  required UserApiClient api,
  required String selfName,
  required String? selfAvatar,
}) => showDialog<AuthorChoice>(
  context: context,
  barrierColor: Colors.black54,
  builder: (_) =>
      _AuthorPicker(api: api, selfName: selfName, selfAvatar: selfAvatar),
);

class _AuthorPicker extends StatefulWidget {
  const _AuthorPicker({
    required this.api,
    required this.selfName,
    required this.selfAvatar,
  });
  final UserApiClient api;
  final String selfName;
  final String? selfAvatar;
  @override
  State<_AuthorPicker> createState() => _AuthorPickerState();
}

class _AuthorPickerState extends State<_AuthorPicker> {
  final _friends = <AuthorChoice>[];
  int _page = 0;
  bool _loading = false, _more = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await widget.api.list('friends', page: _page + 1);
      final rows = response['data'] as List;
      final choices = rows.map((raw) {
        final row = Map<String, dynamic>.from(raw as Map);
        final peer = row['peer'] is Map
            ? Map<String, dynamic>.from(row['peer'] as Map)
            : row;
        final name = peer['displayName'] as String?;
        return AuthorChoice(
          peer['id'] as String,
          name?.trim().isNotEmpty == true
              ? name!
              : peer['username'] as String? ?? 'Bạn bè',
          peer['avatarUrl'] as String?,
        );
      }).toList();
      if (!mounted || !widget.api.isCurrent) return;
      setState(() {
        final ids = _friends.map((f) => f.id).toSet();
        _friends.addAll(
          choices.where(
            (f) => f.id != widget.api.session.user.id && ids.add(f.id),
          ),
        );
        _page++;
        _more = response['hasMore'] == true;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Không tải được danh sách bạn bè.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _row(AuthorChoice choice, {bool all = false}) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
    leading: all
        ? const CircleAvatar(
            backgroundColor: Color(0xFF555555),
            child: Icon(Icons.people_rounded, color: Colors.white70),
          )
        : UserAvatar(
            avatarUrl: choice.avatarUrl,
            displayName: choice.name,
            size: 42,
          ),
    title: Text(
      choice.name,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 19,
        fontWeight: FontWeight.w700,
      ),
    ),
    trailing: const Icon(Icons.chevron_right_rounded, color: Colors.white54),
    onTap: () => Navigator.pop(context, choice),
  );

  @override
  Widget build(BuildContext context) => Dialog(
    alignment: Alignment.topCenter,
    insetPadding: const EdgeInsets.fromLTRB(28, 110, 28, 24),
    backgroundColor: const Color(0xFF383838),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
    clipBehavior: Clip.antiAlias,
    child: ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: 400,
        maxHeight: MediaQuery.sizeOf(context).height * .65,
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          _row(const AuthorChoice(null, 'Tất cả bạn bè'), all: true),
          for (final friend in _friends) ...[
            const Divider(height: 1, color: Colors.black26),
            _row(friend),
          ],
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_error != null) ...[
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
            TextButton(onPressed: _load, child: const Text('Thử lại')),
          ] else if (!_loading && _more)
            TextButton(onPressed: _load, child: const Text('Xem thêm')),
          const Divider(height: 1, color: Colors.black26),
          _row(
            AuthorChoice(widget.api.session.user.id, 'Bạn', widget.selfAvatar),
          ),
        ],
      ),
    ),
  );
}
