import 'package:shared_preferences/shared_preferences.dart';

import '../models/asset_item.dart';

class LocalStorageService {
  static const _assetsKey = 'imageTo3d_assets';

  Future<List<AssetItem>> loadAssets() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_assetsKey);
    if (raw == null || raw.isEmpty) return const [];
    return AssetItem.decodeList(raw);
  }

  Future<void> saveAssets(List<AssetItem> assets) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_assetsKey, AssetItem.encodeList(assets));
  }
}
