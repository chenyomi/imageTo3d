import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../models/asset_item.dart';
import '../state/app_controller.dart';

class PreviewScreen extends StatefulWidget {
  const PreviewScreen({
    super.key,
    required this.controller,
    required this.asset,
  });

  final AppController controller;
  final AssetItem asset;

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  late final WebViewController _controller;
  HttpServer? _localServer;
  bool _isBusy = true;
  String? _errorMessage;
  String _statusMessage = '准备预览环境...';

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..addJavaScriptChannel(
        'FlutterPreview',
        onMessageReceived: (message) {
          if (!mounted) return;
          final payload = message.message;
          debugPrint('[PreviewScreen] JS message: $payload');
          if (payload.startsWith('stage:')) {
            setState(() {
              _statusMessage = payload.substring('stage:'.length);
            });
            return;
          }
          if (payload == 'load') {
            setState(() {
              _isBusy = false;
              _errorMessage = null;
              _statusMessage = '模型加载完成';
            });
            return;
          }

          if (payload.startsWith('error:')) {
            setState(() {
              _isBusy = false;
              _errorMessage = payload.substring('error:'.length);
              _statusMessage = '模型预览失败';
            });
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (error) {
            debugPrint(
              '[PreviewScreen] Web resource error: ${error.description}',
            );
            if (!mounted) return;
            setState(() {
              _isBusy = false;
              _errorMessage = error.description;
              _statusMessage = '页面资源加载失败';
            });
          },
        ),
      );
    _loadPreviewHtml();
  }

  Future<void> _loadPreviewHtml() async {
    debugPrint('[PreviewScreen] Load preview for GLB: ${widget.asset.glbUrl}');
    setState(() {
      _isBusy = true;
      _errorMessage = null;
      _statusMessage = '正在下载模型文件...';
    });
    try {
      final bytes = await _downloadGlbBytes();

      // 关闭旧服务器（如果有）
      await _localServer?.close(force: true);
      _localServer = null;

      setState(() {
        _statusMessage = '正在启动本地预览服务...';
      });

      // 启动本地 HTTP 服务器，避免 base64 大文件问题和 CORS 限制
      final server = await HttpServer.bind('127.0.0.1', 0);
      _localServer = server;
      final port = server.port;
      final glbBytes = bytes; // 捕获引用

      server.listen((request) async {
        try {
          if (request.uri.path == '/model.glb') {
            request.response
              ..statusCode = 200
              ..headers.set('Content-Type', 'model/gltf-binary')
              ..headers.set('Content-Length', glbBytes.length.toString())
              ..headers.set('Access-Control-Allow-Origin', '*')
              ..add(glbBytes);
          } else {
            final html = _buildHtml(
              modelSrc: 'http://127.0.0.1:$port/model.glb',
            );
            request.response
              ..statusCode = 200
              ..headers.contentType = ContentType.html
              ..write(html);
          }
          await request.response.close();
        } catch (_) {}
      });

      await _controller.loadRequest(Uri.parse('http://127.0.0.1:$port/'));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isBusy = false;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
        _statusMessage = '模型文件下载失败';
      });
    }
  }

  @override
  void dispose() {
    _localServer?.close(force: true);
    super.dispose();
  }

  Future<Uint8List> _downloadGlbBytes() async {
    // 优先使用本地已缓存的文件，避免重复下载
    if (widget.asset.localGlbPath case final localPath?) {
      final file = File(localPath);
      if (await file.exists()) {
        return file.readAsBytes();
      }
    }
    final localPath = await widget.controller.downloadAsset(widget.asset);
    return File(localPath).readAsBytes();
  }

  String _buildHtml({required String modelSrc}) {
    // 转义用于 JS 单引号字符串（\\ 必须先转，再转 '）
    final nameJs = widget.asset.name
        .replaceAll(r'\', r'\\')
        .replaceAll("'", r"\'");
    // modelSrc 始终为 http://127.0.0.1:PORT/model.glb，无需额外转义
    final modelUrl = modelSrc;

    return '''
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background:
          radial-gradient(circle at 12% 0%, rgba(124,137,255,0.22), transparent 28%),
          radial-gradient(circle at 88% 16%, rgba(86,214,255,0.18), transparent 24%),
          linear-gradient(180deg, #08111c 0%, #0b1624 100%);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        color: #fff;
      }
      .shell {
        position: relative;
        width: 100%;
        height: 100%;
      }
      model-viewer {
        width: 100%;
        height: 100%;
        --progress-bar-color: #7c89ff;
        --poster-color: transparent;
        background: transparent;
      }
      .badge {
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 18px;
        padding: 12px 16px;
        border-radius: 999px;
        text-align: center;
        background: rgba(11, 22, 36, 0.74);
        border: 1px solid rgba(140, 161, 191, 0.18);
        backdrop-filter: blur(18px);
        color: #d4e1f3;
        font-size: 12px;
      }
      .title {
        position: absolute;
        top: 16px;
        left: 16px;
        right: 16px;
        padding: 14px 16px;
        border-radius: 22px;
        background: rgba(11, 22, 36, 0.7);
        border: 1px solid rgba(140, 161, 191, 0.18);
        backdrop-filter: blur(18px);
      }
      .title small {
        display: block;
        margin-bottom: 6px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        font-size: 11px;
        color: #7bdff6;
        font-weight: 700;
      }
      .title strong {
        display: block;
        font-size: 18px;
        line-height: 1.4;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="title"><small>3D Viewer</small><strong id="name"></strong></div>
      <model-viewer id="viewer" exposure="1" shadow-intensity="1" camera-controls auto-rotate interaction-prompt="auto" touch-action="pan-y"></model-viewer>
      <div class="badge">拖动旋转模型，双指缩放</div>
    </div>
    <script>
      const notify = (message) => {
        if (window.FlutterPreview && typeof window.FlutterPreview.postMessage === 'function') {
          window.FlutterPreview.postMessage(message);
        }
      };
      window.addEventListener('error', (event) => {
        notify('error:' + (event.message || '页面脚本加载失败'));
      });
      document.getElementById('name').textContent = '${nameJs}';
      const viewer = document.getElementById('viewer');
      viewer.addEventListener('load', () => notify('load'));
      viewer.addEventListener('error', (event) => {
        const detail = event?.detail;
        const message = typeof detail === 'string'
          ? detail
          : detail?.type || detail?.message || '模型资源加载失败';
        notify('error:' + message);
      });

      notify('stage:模型数据已就绪，交给查看器渲染');
      viewer.src = '${modelUrl}';
    </script>
  </body>
</html>
''';
  }

  Future<void> _download() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final path = await widget.controller.downloadAsset(widget.asset);
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('模型已缓存到: $path')));
    } catch (error) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('下载失败: $error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.asset.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            onPressed: _download,
            icon: const Icon(Icons.download_rounded),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_errorMessage case final message?)
            Center(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  color: Color(0xE6101826),
                  borderRadius: BorderRadius.all(Radius.circular(24)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.warning_amber_rounded,
                          color: Color(0xFFFFC857),
                          size: 32,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          '模型预览加载失败',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          message,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xFFD4E1F3),
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _loadPreviewHtml,
                          icon: const Icon(Icons.refresh_rounded),
                          label: const Text('重试加载'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (_isBusy)
            Center(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  color: Color(0xCC101826),
                  borderRadius: BorderRadius.all(Radius.circular(22)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 22,
                    vertical: 18,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        '模型加载中...',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _statusMessage,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFD4E1F3),
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
