import 'package:flutter/material.dart';

import '../models/asset_item.dart';
import '../state/app_controller.dart';
import 'assets_screen.dart';
import 'generate_screen.dart';
import 'preview_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int currentIndex = 0;

  void _openPreview(AssetItem asset) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            PreviewScreen(controller: widget.controller, asset: asset),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      GenerateScreen(
        controller: widget.controller,
        onOpenPreview: _openPreview,
      ),
      AssetsScreen(controller: widget.controller, onOpenPreview: _openPreview),
    ];

    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(currentIndex),
            child: pages[currentIndex],
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (value) => setState(() => currentIndex = value),
        height: 72,
        backgroundColor: const Color(0xFF101826),
        indicatorColor: const Color(0xFF1E2B43),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.auto_awesome), label: '生成'),
          NavigationDestination(
            icon: Icon(Icons.grid_view_rounded),
            label: '历史',
          ),
        ],
      ),
    );
  }
}
