/// Add to the set immediately: duplicates within one incoming page count too.
List<Map<String, dynamic>> mergeUniqueRows(
  List<Map<String, dynamic>> previous,
  Iterable<Map<String, dynamic>> incoming,
) {
  final result = <Map<String, dynamic>>[];
  final ids = <String>{};
  for (final item in [...previous, ...incoming]) {
    final id = item['id'];
    if (id is String && id.isNotEmpty && ids.add(id)) result.add(item);
  }
  return result;
}
