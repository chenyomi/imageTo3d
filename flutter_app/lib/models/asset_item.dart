import 'dart:convert';

class AssetItem {
  const AssetItem({
    required this.id,
    required this.name,
    required this.coverPath,
    required this.glbUrl,
    required this.createdAt,
    this.localGlbPath,
  });

  final String id;
  final String name;
  final String coverPath;
  final String glbUrl;
  final DateTime createdAt;
  final String? localGlbPath;

  AssetItem copyWith({
    String? id,
    String? name,
    String? coverPath,
    String? glbUrl,
    DateTime? createdAt,
    String? localGlbPath,
  }) {
    return AssetItem(
      id: id ?? this.id,
      name: name ?? this.name,
      coverPath: coverPath ?? this.coverPath,
      glbUrl: glbUrl ?? this.glbUrl,
      createdAt: createdAt ?? this.createdAt,
      localGlbPath: localGlbPath ?? this.localGlbPath,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'coverPath': coverPath,
      'glbUrl': glbUrl,
      'createdAt': createdAt.toIso8601String(),
      'localGlbPath': localGlbPath,
    };
  }

  factory AssetItem.fromJson(Map<String, dynamic> json) {
    return AssetItem(
      id: json['id'] as String,
      name: json['name'] as String,
      coverPath: (json['coverPath'] ?? '') as String,
      glbUrl: json['glbUrl'] as String,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      localGlbPath: json['localGlbPath'] as String?,
    );
  }

  static String encodeList(List<AssetItem> items) {
    return jsonEncode(items.map((item) => item.toJson()).toList());
  }

  static List<AssetItem> decodeList(String source) {
    final dynamic data = jsonDecode(source);
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((item) => AssetItem.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
}
