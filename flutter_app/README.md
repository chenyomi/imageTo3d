# flutter_app

ImageTo3D 的 Flutter 复刻版，基于当前小程序流程重建：

- 生成页：选择图片、设置分辨率和随机种子、调用 Pixal3D Gradio 接口
- 历史页：查看已生成模型、预览、下载到应用目录、删除历史记录
- 预览页：通过内置 WebView 加载 model-viewer 预览远程 GLB

## 当前状态

项目结构和业务代码已创建，现已补齐 Android、iOS、Web、macOS 平台脚手架。

当前验证结果：

- `flutter create --platforms=web,macos .` 已成功执行
- `flutter pub get` 所需依赖已成功解析并写入当前工程
- `flutter devices` 已能识别 Chrome 和 macOS 为本项目支持的平台
- `flutter run -d chrome` 已成功启动应用

如果之后再次遇到 `pub.dev` TLS 握手失败，根因通常仍然是本机代理链路，尤其是 Clash Verge 的 fake-ip/TUN 组合。排查重点如下：

1. 在 Clash Verge 里临时关闭 TUN。
2. 把 DNS 的 `enhanced-mode` 从 `fake-ip` 改成 `redir-host`，或给下面这些域名加入 `fake-ip-filter` / 直连规则：
	- `pub.dev`
	- `*.pub.dev`
	- `storage.googleapis.com`
	- `maven.google.com`
	- `github.com`
	- `*.github.com`
	- `cocoapods.org`
	- `*.cocoapods.org`
3. 如果节点本身仍然握手失败，直接退出 Clash Verge，再重新执行下面的命令。

可以先用这条命令验证网络是否恢复正常：

```bash
curl -Ivs https://pub.dev
```

当输出里不再出现 `SSL_ERROR_SYSCALL` 或 `Connection terminated during handshake` 后，再继续：

首次启动前请在 flutter_app 目录执行：

```bash
flutter pub get
flutter run
```

如果你要跑 iOS 或 macOS，还需要额外准备完整 Xcode；如果涉及插件集成，通常还需要 CocoaPods。Chrome/Web 已经验证可直接运行。

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
