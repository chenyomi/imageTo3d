import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/asset_item.dart';
import '../models/generation_task.dart';
import '../state/app_controller.dart';

class GenerateScreen extends StatefulWidget {
  const GenerateScreen({
    super.key,
    required this.controller,
    required this.onOpenPreview,
  });

  final AppController controller;
  final ValueChanged<AssetItem> onOpenPreview;

  @override
  State<GenerateScreen> createState() => _GenerateScreenState();
}

class _GenerateScreenState extends State<GenerateScreen> {
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _seedController = TextEditingController(
    text: '-1',
  );
  String? _imagePath;
  int _resolution = 1536;

  @override
  void dispose() {
    _seedController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    final file = await _picker.pickImage(source: source, imageQuality: 100);
    if (file == null) return;
    setState(() => _imagePath = file.path);
    widget.controller.clearTaskError();
  }

  Future<void> _showImageSourcePicker() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF152133),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: const Icon(
                    Icons.photo_library_outlined,
                    color: Colors.white,
                  ),
                  title: const Text(
                    '从相册选择',
                    style: TextStyle(color: Colors.white),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _pickImage(ImageSource.gallery);
                  },
                ),
                ListTile(
                  leading: const Icon(
                    Icons.photo_camera_outlined,
                    color: Colors.white,
                  ),
                  title: const Text(
                    '拍一张',
                    style: TextStyle(color: Colors.white),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _pickImage(ImageSource.camera);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _handleGenerate() async {
    final imagePath = _imagePath;
    if (imagePath == null || widget.controller.generationTask.isRunning) return;

    try {
      final seed = int.tryParse(_seedController.text.trim()) ?? -1;
      final asset = await widget.controller.generateAsset(
        imagePath: imagePath,
        resolution: _resolution,
        seed: seed,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('生成成功，已进入预览页')));
      widget.onOpenPreview(asset);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.controller.generationTask.error.isNotEmpty
                ? widget.controller.generationTask.error
                : '生成失败，请重试',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final task = widget.controller.generationTask;

        return DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0B1523), Color(0xFF101A2B), Color(0xFF0D1420)],
            ),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
            children: [
              const _PageHeader(),
              const SizedBox(height: 20),
              GestureDetector(
                onTap: task.isRunning ? null : _showImageSourcePicker,
                child: _UploadCard(imagePath: _imagePath),
              ),
              const SizedBox(height: 20),
              _SettingCard(
                title: '分辨率',
                subtitle: '输出质量与生成速度',
                child: _ResolutionSelector(
                  value: _resolution,
                  onChanged: (value) => setState(() => _resolution = value),
                ),
              ),
              const SizedBox(height: 16),
              _SettingCard(
                title: '随机种子',
                subtitle: '固定参数可复现结果',
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _seedController,
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white),
                        decoration: _inputDecoration('输入 -1 表示随机'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    FilledButton.tonal(
                      onPressed: () => _seedController.text = DateTime.now()
                          .millisecondsSinceEpoch
                          .remainder(999999)
                          .toString(),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF1E2B43),
                      ),
                      child: const Text('随机'),
                    ),
                  ],
                ),
              ),
              if (task.status == GenerationStatus.error &&
                  task.error.isNotEmpty) ...[
                const SizedBox(height: 16),
                _ErrorCard(text: task.error),
              ],
              if (task.isRunning) ...[
                const SizedBox(height: 16),
                _ProgressCard(
                  text: task.progressText.isEmpty
                      ? '处理中...'
                      : task.progressText,
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                height: 56,
                child: FilledButton(
                  onPressed: _imagePath == null || task.isRunning
                      ? null
                      : _handleGenerate,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF7C89FF),
                    disabledBackgroundColor: const Color(0xFF24314A),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                  child: Text(
                    task.isRunning ? '生成中...' : '开始生成',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

InputDecoration _inputDecoration(String hint) {
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: Color(0xFF71809A)),
    filled: true,
    fillColor: const Color(0xFF182234),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: BorderSide.none,
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  );
}

class _PageHeader extends StatelessWidget {
  const _PageHeader();

  @override
  Widget build(BuildContext context) {
    return const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: Color(0xFF17243A),
          child: Icon(
            Icons.view_in_ar_rounded,
            color: Color(0xFF82D8FF),
            size: 30,
          ),
        ),
        SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ImageTo3D',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              SizedBox(height: 6),
              Text(
                '从单张图片快速生成可下载的 3D 模型',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.6,
                  color: Color(0xFF93A4BC),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ResolutionSelector extends StatelessWidget {
  const _ResolutionSelector({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF18263C),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: const Color(0xFF94A0B8).withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ResolutionOption(
              label: '1024 均衡',
              selected: value == 1024,
              onTap: () => onChanged(1024),
            ),
          ),
          Expanded(
            child: _ResolutionOption(
              label: '1536 高质量',
              selected: value == 1536,
              onTap: () => onChanged(1536),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResolutionOption extends StatelessWidget {
  const _ResolutionOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFF7C89FF) : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: SizedBox(
          height: 52,
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Opacity(
                  opacity: selected ? 1 : 0,
                  child: const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(
                      Icons.check_rounded,
                      size: 20,
                      color: Colors.white,
                    ),
                  ),
                ),
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UploadCard extends StatelessWidget {
  const _UploadCard({required this.imagePath});

  final String? imagePath;

  @override
  Widget build(BuildContext context) {
    final hasImage = imagePath != null;
    return Container(
      height: 292,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        color: const Color(0xFF111C2E),
        border: Border.all(color: const Color(0xFF23324C)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Stack(
          fit: StackFit.expand,
          children: [
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF19253A), Color(0xFF101827)],
                ),
              ),
            ),
            if (hasImage) Image.file(File(imagePath!), fit: BoxFit.cover),
            Container(
              color: hasImage
                  ? Colors.black.withOpacity(0.24)
                  : Colors.transparent,
            ),
            Padding(
              padding: const EdgeInsets.all(22),
              child: hasImage
                  ? const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          'Source Image',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: Color(0xFF82D8FF),
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          '已选择图片，点击可重新选择或替换',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    )
                  : const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 54,
                          color: Color(0xFF7C89FF),
                        ),
                        SizedBox(height: 18),
                        Text(
                          '选择一张主体清晰的图片',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          '支持 JPG、PNG、WEBP，自动完成预处理与 3D 重建',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.7,
                            color: Color(0xFF93A4BC),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingCard extends StatelessWidget {
  const _SettingCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF101826),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF22324C)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: Color(0xFF8CA0BB)),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A1520),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF6C3144)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Color(0xFFFF9CAB)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: Color(0xFFFFD6DE), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF121F30),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF22324C)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '实时进度',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: Color(0xFF7C89FF),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  text,
                  style: const TextStyle(color: Colors.white, height: 1.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
