import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/asset_item.dart';
import '../models/generation_task.dart';
import '../services/gradio_service.dart';
import '../services/local_storage_service.dart';

class AppController extends ChangeNotifier {
  AppController();

  final LocalStorageService _storage = LocalStorageService();
  final GradioService _gradio = GradioService();
  final http.Client _client = http.Client();

  List<AssetItem> assets = const [];
  GenerationTask generationTask = GenerationTask.idle();

  Future<void> initialize() async {
    assets = await _storage.loadAssets();
    notifyListeners();
  }

  Future<String> _copyImageToAppDir(String sourcePath) async {
    final directory = await getApplicationDocumentsDirectory();
    final imagesDir = Directory('${directory.path}/images');
    if (!await imagesDir.exists()) {
      await imagesDir.create(recursive: true);
    }

    final sourceFile = File(sourcePath);
    final extension = sourceFile.path.split('.').last;
    final targetPath =
        '${imagesDir.path}/${DateTime.now().millisecondsSinceEpoch}.$extension';
    final copied = await sourceFile.copy(targetPath);
    return copied.path;
  }

  Future<void> _persistAssets() async {
    await _storage.saveAssets(assets);
  }

  Future<void> _deleteFileIfExists(String? path) async {
    if (path == null || path.isEmpty) return;
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }

  void _updateTask(GenerationTask task) {
    generationTask = task;
    notifyListeners();
  }

  void clearTaskError() {
    _updateTask(
      generationTask.copyWith(
        status: GenerationStatus.idle,
        error: '',
        progressText: '',
      ),
    );
  }

  Future<AssetItem> generateAsset({
    required String imagePath,
    required int resolution,
    required int seed,
  }) async {
    final taskId = DateTime.now().millisecondsSinceEpoch.toString();
    _updateTask(
      generationTask.copyWith(
        id: taskId,
        status: GenerationStatus.running,
        progressText: '准备中...',
        error: '',
        imagePath: imagePath,
        resultAssetId: '',
      ),
    );

    try {
      final glbUrl = await _gradio.generateModel(
        imagePath,
        resolution: resolution,
        seed: seed,
        onProgress: (text) {
          _updateTask(
            generationTask.copyWith(
              id: taskId,
              status: GenerationStatus.running,
              progressText: text,
            ),
          );
        },
      );
      final coverPath = await _copyImageToAppDir(imagePath);

      final asset = AssetItem(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        name:
            '模型_${DateTime.now().hour.toString().padLeft(2, '0')}:${DateTime.now().minute.toString().padLeft(2, '0')}:${DateTime.now().second.toString().padLeft(2, '0')}',
        coverPath: coverPath,
        glbUrl: glbUrl,
        createdAt: DateTime.now(),
      );

      assets = [asset, ...assets];
      await _persistAssets();
      _updateTask(
        generationTask.copyWith(
          id: taskId,
          status: GenerationStatus.success,
          progressText: '',
          error: '',
          imagePath: imagePath,
          resultAssetId: asset.id,
        ),
      );
      notifyListeners();
      return asset;
    } catch (error) {
      _updateTask(
        generationTask.copyWith(
          id: taskId,
          status: GenerationStatus.error,
          progressText: '',
          error: error is Exception
              ? error.toString().replaceFirst('Exception: ', '')
              : '生成失败，请重试',
        ),
      );
      rethrow;
    }
  }

  Future<void> removeAsset(String assetId) async {
    final removed = assets.where((item) => item.id == assetId).firstOrNull;
    await _deleteFileIfExists(removed?.localGlbPath);
    await _deleteFileIfExists(removed?.coverPath);

    assets = assets.where((item) => item.id != assetId).toList();
    await _persistAssets();
    notifyListeners();
  }

  Future<String> downloadAsset(AssetItem asset) async {
    if (asset.localGlbPath case final localPath?) {
      final localFile = File(localPath);
      if (await localFile.exists()) return localPath;
    }

    final directory = await getApplicationDocumentsDirectory();
    final modelsDir = Directory('${directory.path}/models');
    if (!await modelsDir.exists()) {
      await modelsDir.create(recursive: true);
    }

    final response = await _client.get(Uri.parse(asset.glbUrl));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('下载失败 (${response.statusCode})');
    }

    final targetPath = '${modelsDir.path}/${asset.id}.glb';
    final file = File(targetPath);
    await file.writeAsBytes(response.bodyBytes, flush: true);

    assets = assets
        .map(
          (item) => item.id == asset.id
              ? item.copyWith(localGlbPath: targetPath)
              : item,
        )
        .toList();
    await _persistAssets();
    notifyListeners();
    return targetPath;
  }

  @override
  void dispose() {
    _client.close();
    _gradio.dispose();
    super.dispose();
  }
}

extension _FirstOrNullExtension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
