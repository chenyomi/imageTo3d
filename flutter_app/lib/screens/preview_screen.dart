import 'dart:convert';

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
  bool _isBusy = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted) setState(() => _isBusy = false);
          },
        ),
      )
      ..loadHtmlString(_buildHtml(), baseUrl: widget.asset.glbUrl);
  }

  String _buildHtml() {
    final name = jsonEncode(widget.asset.name);
    final src = jsonEncode(widget.asset.glbUrl);

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
      const name = $name;
      const src = $src;
      document.getElementById('name').textContent = name;
      document.getElementById('viewer').src = src;
    </script>
  </body>
</html>
'''
        .replaceAll(r'$name', name)
        .replaceAll(r'$src', src);
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
          if (_isBusy)
            const Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Color(0xCC101826),
                  borderRadius: BorderRadius.all(Radius.circular(22)),
                ),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 22, vertical: 18),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      ),
                      SizedBox(height: 14),
                      Text(
                        '模型加载中...',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
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
