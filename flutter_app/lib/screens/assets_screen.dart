import 'dart:io';

import 'package:flutter/material.dart';

import '../models/asset_item.dart';
import '../models/generation_task.dart';
import '../state/app_controller.dart';

class AssetsScreen extends StatelessWidget {
  const AssetsScreen({
    super.key,
    required this.controller,
    required this.onOpenPreview,
  });

  final AppController controller;
  final ValueChanged<AssetItem> onOpenPreview;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final task = controller.generationTask;

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
              Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '模型库',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          '查看已生成结果、继续预览或下载本地文件',
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.6,
                            color: Color(0xFF93A4BC),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18263C),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${controller.assets.length} 个',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              if (task.status == GenerationStatus.running) ...[
                const SizedBox(height: 18),
                _TaskBanner(
                  icon: Icons.bolt_rounded,
                  accent: const Color(0xFF7C89FF),
                  title: '当前任务仍在处理',
                  subtitle: task.progressText.isEmpty
                      ? '处理中...'
                      : task.progressText,
                  imagePath: task.imagePath,
                ),
              ],
              if (task.status == GenerationStatus.error &&
                  task.error.isNotEmpty) ...[
                const SizedBox(height: 18),
                _TaskBanner(
                  icon: Icons.error_outline,
                  accent: const Color(0xFFFF9CAB),
                  title: '上一个生成任务失败',
                  subtitle: task.error,
                  imagePath: task.imagePath,
                ),
              ],
              const SizedBox(height: 18),
              if (controller.assets.isEmpty)
                const _EmptyState()
              else
                ...controller.assets.map(
                  (asset) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _AssetCard(
                      asset: asset,
                      onPreview: () => onOpenPreview(asset),
                      onDownload: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          final path = await controller.downloadAsset(asset);
                          messenger.showSnackBar(
                            SnackBar(content: Text('已保存到应用目录: $path')),
                          );
                        } catch (error) {
                          messenger.showSnackBar(
                            SnackBar(content: Text('下载失败: $error')),
                          );
                        }
                      },
                      onDelete: () async {
                        final confirmed = await showDialog<bool>(
                          context: context,
                          builder: (_) => AlertDialog(
                            backgroundColor: const Color(0xFF162235),
                            title: const Text(
                              '删除历史记录',
                              style: TextStyle(color: Colors.white),
                            ),
                            content: Text(
                              '确定删除 ${asset.name} 吗？删除后不会影响已经导出的本地文件。',
                              style: const TextStyle(color: Color(0xFFD8E2F0)),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context, false),
                                child: const Text('取消'),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(context, true),
                                child: const Text('删除'),
                              ),
                            ],
                          ),
                        );
                        if (confirmed == true) {
                          await controller.removeAsset(asset.id);
                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(const SnackBar(content: Text('已删除')));
                        }
                      },
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

class _TaskBanner extends StatelessWidget {
  const _TaskBanner({
    required this.icon,
    required this.accent,
    required this.title,
    required this.subtitle,
    required this.imagePath,
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final String imagePath;

  @override
  Widget build(BuildContext context) {
    final hasImage = imagePath.isNotEmpty && File(imagePath).existsSync();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF101826),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF22324C)),
      ),
      child: Row(
        children: [
          hasImage
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: SizedBox(
                    width: 52,
                    height: 52,
                    child: Image.file(File(imagePath), fit: BoxFit.cover),
                  ),
                )
              : CircleAvatar(
                  radius: 22,
                  backgroundColor: accent.withValues(alpha: 0.18),
                  child: Icon(icon, color: accent),
                ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: Color(0xFF93A4BC),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 46),
      decoration: BoxDecoration(
        color: const Color(0xFF101826),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFF22324C)),
      ),
      child: const Column(
        children: [
          Icon(Icons.inventory_2_outlined, size: 56, color: Color(0xFF7C89FF)),
          SizedBox(height: 16),
          Text(
            '你的模型库还是空的',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          SizedBox(height: 10),
          Text(
            '生成完成后，模型会自动出现在这里，你可以继续预览、下载或管理历史记录。',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              height: 1.7,
              color: Color(0xFF93A4BC),
            ),
          ),
        ],
      ),
    );
  }
}

class _AssetCard extends StatelessWidget {
  const _AssetCard({
    required this.asset,
    required this.onPreview,
    required this.onDownload,
    required this.onDelete,
  });

  final AssetItem asset;
  final VoidCallback onPreview;
  final VoidCallback onDownload;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF101826),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: const Color(0xFF22324C)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: SizedBox(
                width: 96,
                height: 96,
                child:
                    asset.coverPath.isNotEmpty &&
                        File(asset.coverPath).existsSync()
                    ? Image.file(File(asset.coverPath), fit: BoxFit.cover)
                    : Container(
                        color: const Color(0xFF1B2740),
                        child: const Icon(
                          Icons.view_in_ar_rounded,
                          color: Color(0xFFB4A6FF),
                          size: 42,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${asset.createdAt.year}/${asset.createdAt.month}/${asset.createdAt.day} ${asset.createdAt.hour.toString().padLeft(2, '0')}:${asset.createdAt.minute.toString().padLeft(2, '0')}:${asset.createdAt.second.toString().padLeft(2, '0')}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF8CA0BB),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    children: const [_Pill('GLB'), _Pill('3D Asset')],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              children: [
                _ActionButton(label: '预览', onTap: onPreview),
                const SizedBox(height: 10),
                _ActionButton(label: '下载', onTap: onDownload),
                const SizedBox(height: 10),
                _ActionButton(label: '删除', onTap: onDelete, danger: true),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFF18263C),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: Color(0xFFD9E5F7),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 88,
      child: FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          backgroundColor: danger
              ? const Color(0xFF4A2330)
              : const Color(0xFF18263C),
          foregroundColor: danger ? const Color(0xFFFFB3C0) : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        child: Text(label),
      ),
    );
  }
}
