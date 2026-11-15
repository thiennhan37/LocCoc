import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';

class PickedProfileImage {
  final Uint8List bytes;
  final String contentType;
  const PickedProfileImage(this.bytes, this.contentType);
}

class ProfileImagePicker {
  final ImagePicker _picker;
  ProfileImagePicker({ImagePicker? picker}) : _picker = picker ?? ImagePicker();
  Future<PickedProfileImage?> pick(ImageSource source, String kind) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: kind == 'avatar' ? 2048 : 4096,
      maxHeight: kind == 'avatar' ? 2048 : 4096,
      imageQuality: 85,
      requestFullMetadata: false,
    );
    return file == null ? null : read(file, kind);
  }

  Future<PickedProfileImage?> recover(String kind) async {
    final response = await _picker.retrieveLostData();
    if (response.exception != null) throw response.exception!;
    final files = response.files;
    return files == null || files.isEmpty ? null : read(files.first, kind);
  }

  Future<PickedProfileImage> read(XFile file, String kind) async {
    final max = (kind == 'avatar' ? 5 : 10) * 1024 * 1024;
    if (await file.length() > max) {
      throw const FormatException('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.');
    }
    final bytes = await file.readAsBytes();
    if (bytes.length > max) throw const FormatException('Ảnh quá lớn.');
    final mime = mediaContentType(bytes);
    if (mime == null) {
      throw const FormatException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
    }
    return PickedProfileImage(bytes, mime);
  }
}

String? mediaContentType(List<int> bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 255 &&
      bytes[1] == 216 &&
      bytes[2] == 255) {
    return 'image/jpeg';
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length >= 8 &&
      List.generate(8, (i) => bytes[i] == png[i]).every((x) => x)) {
    return 'image/png';
  }
  if (bytes.length >= 12 &&
      String.fromCharCodes(bytes.take(4)) == 'RIFF' &&
      String.fromCharCodes(bytes.skip(8).take(4)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}
