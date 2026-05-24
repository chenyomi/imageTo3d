import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class GradioService {
  static const gistId = 'a6b2b577692bd350a543628ed2a1f9e5';
  static const fallbackGradioUrl = 'https://tencentarc-pixal3d-server.hf.space';
  static const gradioApiPrefix = '/gradio_api';

  final http.Client _client = http.Client();
  List<String>? _cachedInstances;
  int _instanceCursor = 0;
  final Map<String, bool> _validEndpointCache = <String, bool>{};

  String _trimSlash(String url) => url.replaceFirst(RegExp(r'/+$'), '');

  String _formatOfficialProgress(
    Map<String, dynamic>? queue,
    Map<String, dynamic>? progress,
  ) {
    final stage = progress?['stage'] as String?;
    final step = progress?['step'] as num?;
    final total = progress?['total'] as num?;
    if (stage != null && stage.isNotEmpty) {
      if (step != null && total != null && total > 0) {
        return '$stage (${step.toInt()}/${total.toInt()})';
      }
      return stage;
    }

    final position = queue?['position'] as num?;
    if (position != null && position > 0) {
      return '排队中，前方还有 ${position.toInt()} 个请求';
    }

    final gpuBusy = queue?['gpu_busy'] as bool?;
    if (gpuBusy == true) {
      return 'GPU 执行中，请稍候...';
    }

    return '';
  }

  Future<void> _pollOfficialProgress(
    String baseUrl,
    String sessionId,
    void Function(String) onProgress,
    bool Function() shouldStop,
  ) async {
    var lastText = '';
    while (!shouldStop()) {
      try {
        final responses = await Future.wait<http.Response?>([
          _safeGet(
            Uri.parse('$baseUrl/queue?session_id=$sessionId'),
            headers: {'cache-control': 'no-store'},
          ),
          _safeGet(
            Uri.parse('$baseUrl/progress?session_id=$sessionId'),
            headers: {'cache-control': 'no-store'},
          ),
        ]);

        final queueResponse = responses[0];
        final progressResponse = responses[1];
        final queue = queueResponse != null &&
                queueResponse.statusCode >= 200 &&
                queueResponse.statusCode < 300
            ? Map<String, dynamic>.from(
                jsonDecode(queueResponse.body) as Map,
              )
            : null;
        final progress = progressResponse != null &&
                progressResponse.statusCode >= 200 &&
                progressResponse.statusCode < 300
            ? Map<String, dynamic>.from(
                jsonDecode(progressResponse.body) as Map,
              )
            : null;

        final text = _formatOfficialProgress(queue, progress);
        if (text.isNotEmpty && text != lastText) {
          lastText = text;
          onProgress(text);
        }
      } catch (_) {
        // Ignore polling errors and keep SSE result as source of truth.
      }

      if (shouldStop()) break;
      await Future<void>.delayed(const Duration(milliseconds: 1200));
    }
  }

  Future<http.Response?> _safeGet(
    Uri uri, {
    Map<String, String>? headers,
  }) async {
    try {
      return await _client.get(uri, headers: headers);
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> _requestJson(String url) async {
    final response = await _client.get(Uri.parse(url));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('请求实例列表失败 (${response.statusCode})');
    }
    final dynamic data = jsonDecode(response.body);
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> _ensureInstancesLoaded() async {
    if (_cachedInstances == null) {
      try {
        final gistRaw =
            'https://gist.githubusercontent.com/chenyomi/$gistId/raw/gradio-urls.json';
        final data = await _requestJson(gistRaw);
        _cachedInstances = (data['instances'] as List<dynamic>? ?? const [])
            .map(
              (item) => _trimSlash(
                (item as Map<String, dynamic>)['url'] as String? ?? '',
              ),
            )
            .where((item) => item.isNotEmpty)
            .toList();
      } catch (_) {
        _cachedInstances = <String>[];
      }
    }
  }

  Future<bool> _hasWorkingApi(String baseUrl) async {
    final normalizedUrl = _trimSlash(baseUrl);
    final cached = _validEndpointCache[normalizedUrl];
    if (cached != null) return cached;

    try {
      final response = await _client.get(
        Uri.parse('$normalizedUrl$gradioApiPrefix/info'),
        headers: {'cache-control': 'no-store'},
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        _validEndpointCache[normalizedUrl] = false;
        return false;
      }

      final dynamic data = jsonDecode(response.body);
      final namedEndpoints = Map<String, dynamic>.from(
        (data as Map<String, dynamic>)['named_endpoints'] as Map? ??
            const <String, dynamic>{},
      );
      final usable = ['/preprocess', '/generate_3d', '/extract_glb_api']
          .every(namedEndpoints.containsKey);
      _validEndpointCache[normalizedUrl] = usable;
      debugPrint('[GradioService] API check $normalizedUrl => $usable');
      return usable;
    } catch (_) {
      _validEndpointCache[normalizedUrl] = false;
      debugPrint('[GradioService] API check failed: $normalizedUrl');
      return false;
    }
  }

  Future<List<String>> _resolveCandidateUrls() async {
    final fallback = _trimSlash(fallbackGradioUrl);
    await _ensureInstancesLoaded();

    final ordered = <String>[];
    final instances = _cachedInstances ?? const <String>[];
    if (instances.isNotEmpty) {
      for (var offset = 0; offset < instances.length; offset += 1) {
        ordered.add(instances[(_instanceCursor + offset) % instances.length]);
      }
    }
    if (!ordered.contains(fallback)) {
      ordered.add(fallback);
    }

    final candidates = <String>[];
    for (final candidate in ordered) {
      if (await _hasWorkingApi(candidate)) {
        candidates.add(candidate);
      }
    }

    debugPrint('[GradioService] Candidate instances: ${candidates.join(', ')}');

    return candidates.isNotEmpty ? candidates : <String>[fallback];
  }

  Future<bool> _isGlbUrlReachable(String url) async {
    try {
      final request = http.Request('GET', Uri.parse(url))
        ..headers['range'] = 'bytes=0-0'
        ..headers['cache-control'] = 'no-store';
      final response = await _client.send(request);
      await response.stream.drain<void>();
      debugPrint('[GradioService] GLB reachability $url => ${response.statusCode}');
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      debugPrint('[GradioService] GLB reachability failed: $url');
      return false;
    }
  }

  Future<String> _generateModelOnInstance(
    String baseUrl,
    String imagePath, {
    required int resolution,
    required int seed,
    required void Function(String) onProgress,
  }) async {
    final actualSeed = seed >= 0 ? seed : Random().nextInt(100000);
    final sessionId = DateTime.now().millisecondsSinceEpoch.toString();
    debugPrint('[GradioService] Generate on instance: $baseUrl');

    onProgress('正在上传图片...');
    final uploadedPath = await _uploadImage(baseUrl, imagePath);

    onProgress('预处理中...');
    final preprocessedResult = await _gradioCall(baseUrl, 'preprocess', [
      {'path': uploadedPath},
    ]);
    final preprocessed = (preprocessedResult as List).first;

    onProgress('生成 3D 中，请稍候...');
    final stateResult = await _gradioCall(baseUrl, 'generate_3d', [
      preprocessed,
      actualSeed,
      resolution,
      7.5,
      0.7,
      8,
      5.0,
      7.5,
      0.5,
      8,
      3.0,
      1.0,
      0.0,
      8,
      3.0,
      -1,
      sessionId,
    ], sessionId: sessionId, onProgress: onProgress);

    final dynamic stateObj = (stateResult as List).first;
    final statePath = stateObj is String
        ? stateObj
        : (stateObj['state_path'] ?? stateObj['path'] ?? stateObj['url'])
              as String?;
    if (statePath == null || statePath.isEmpty) {
      throw Exception('未获取到 3D 状态路径');
    }

    onProgress('提取 GLB 文件...');
    final glbResult = await _gradioCall(baseUrl, 'extract_glb_api', [
      statePath,
      250000,
      1024,
      sessionId,
    ], sessionId: sessionId, onProgress: onProgress);
    final dynamic glbData = (glbResult as List).first;
    final glbPath = (glbData['url'] ?? glbData['path']) as String?;
    if (glbPath == null || glbPath.isEmpty) {
      throw Exception('未获取到 GLB 文件');
    }

    final glbUrl = glbPath.startsWith('http') ? glbPath : '$baseUrl$glbPath';
    debugPrint('[GradioService] Extracted GLB URL: $glbUrl');
    if (!await _isGlbUrlReachable(glbUrl)) {
      throw Exception('导出的 GLB 文件不可访问');
    }

    return glbUrl;
  }

  Future<String> resolveGradioUrl() async {
    final candidates = await _resolveCandidateUrls();
    final picked = candidates.first;
    _instanceCursor += 1;
    return picked;
  }

  Future<dynamic> _uploadImage(String baseUrl, String imagePath) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl$gradioApiPrefix/upload'),
    )..files.add(await http.MultipartFile.fromPath('files', imagePath));
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('图片上传失败 (${response.statusCode})');
    }
    final dynamic parsed = jsonDecode(response.body);
    if (parsed is List && parsed.isNotEmpty) return parsed.first;
    throw Exception('上传结果解析失败');
  }

  Future<dynamic> _gradioCall(
    String baseUrl,
    String apiName,
    List<dynamic> data,
    {
    String? sessionId,
    void Function(String)? onProgress,
  }
  ) async {
    final startResponse = await _client.post(
      Uri.parse('$baseUrl$gradioApiPrefix/call/$apiName'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'data': data}),
    );
    if (startResponse.statusCode < 200 || startResponse.statusCode >= 300) {
      throw Exception('$apiName 请求失败 (${startResponse.statusCode})');
    }

    final dynamic startJson = jsonDecode(startResponse.body);
    final eventId = (startJson as Map<String, dynamic>)['event_id'] as String?;
    if (eventId == null || eventId.isEmpty) {
      throw Exception('$apiName 启动失败');
    }

    var stopped = false;
    final progressFuture = sessionId != null && onProgress != null
        ? _pollOfficialProgress(baseUrl, sessionId, onProgress, () => stopped)
        : null;

    final resultResponse = await _client.get(
      Uri.parse('$baseUrl$gradioApiPrefix/call/$apiName/$eventId'),
    );
    stopped = true;
    if (progressFuture != null) {
      await progressFuture;
    }
    if (resultResponse.statusCode < 200 || resultResponse.statusCode >= 300) {
      throw Exception('$apiName 结果获取失败 (${resultResponse.statusCode})');
    }

    final lines = const LineSplitter()
        .convert(resultResponse.body)
        .where((line) => line.startsWith('data:'))
        .toList();
    if (lines.isEmpty) {
      throw Exception('$apiName 无结果');
    }

    return jsonDecode(lines.last.substring(5).trim());
  }

  Future<String> generateModel(
    String imagePath, {
    required int resolution,
    required int seed,
    required void Function(String) onProgress,
  }) async {
    final candidates = await _resolveCandidateUrls();
    Object? lastError;

    for (var index = 0; index < candidates.length; index += 1) {
      final baseUrl = candidates[index];
      if (index > 0) {
        onProgress('当前实例异常，正在切换服务节点...');
      }

      try {
        _instanceCursor += 1;
        debugPrint('[GradioService] Try instance ${index + 1}/${candidates.length}: $baseUrl');
        return await _generateModelOnInstance(
          baseUrl,
          imagePath,
          resolution: resolution,
          seed: seed,
          onProgress: onProgress,
        );
      } catch (error) {
        lastError = error;
        debugPrint('[GradioService] Instance failed: $baseUrl => $error');
      }
    }

    if (lastError != null) {
      throw Exception(
        '当前可用实例无法稳定导出模型，请稍后重试。${lastError is Exception ? lastError.toString().replaceFirst('Exception: ', ' ') : ''}',
      );
    }
    throw Exception('当前没有可用的 Gradio 服务实例');
  }

  void dispose() {
    _client.close();
  }
}
