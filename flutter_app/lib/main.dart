import 'package:flutter/material.dart';

import 'screens/home_shell.dart';
import 'state/app_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ImageTo3DApp());
}

class ImageTo3DApp extends StatefulWidget {
  const ImageTo3DApp({super.key});

  @override
  State<ImageTo3DApp> createState() => _ImageTo3DAppState();
}

class _ImageTo3DAppState extends State<ImageTo3DApp> {
  late final AppController controller;
  late final Future<void> bootstrap;

  @override
  void initState() {
    super.initState();
    controller = AppController();
    bootstrap = controller.initialize();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF7C89FF);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'ImageTo3D',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
          surface: const Color(0xFF101826),
        ),
        scaffoldBackgroundColor: const Color(0xFF0D1420),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: Color(0xFF18263C),
          contentTextStyle: TextStyle(color: Colors.white),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0F1724),
          foregroundColor: Colors.white,
          centerTitle: true,
          elevation: 0,
        ),
      ),
      home: FutureBuilder<void>(
        future: bootstrap,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const _LaunchScreen();
          }
          return HomeShell(controller: controller);
        },
      ),
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0B1523), Color(0xFF111C2F)],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.view_in_ar_rounded,
                size: 58,
                color: Color(0xFF82D8FF),
              ),
              SizedBox(height: 18),
              Text(
                'ImageTo3D',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 12),
              SizedBox(
                width: 32,
                height: 32,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
