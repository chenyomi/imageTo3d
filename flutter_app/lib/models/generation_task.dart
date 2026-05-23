enum GenerationStatus { idle, running, success, error }

class GenerationTask {
  const GenerationTask({
    required this.id,
    required this.status,
    required this.progressText,
    required this.error,
    required this.imagePath,
    required this.resultAssetId,
  });

  final String id;
  final GenerationStatus status;
  final String progressText;
  final String error;
  final String imagePath;
  final String resultAssetId;

  bool get isRunning => status == GenerationStatus.running;

  factory GenerationTask.idle() {
    return const GenerationTask(
      id: '',
      status: GenerationStatus.idle,
      progressText: '',
      error: '',
      imagePath: '',
      resultAssetId: '',
    );
  }

  GenerationTask copyWith({
    String? id,
    GenerationStatus? status,
    String? progressText,
    String? error,
    String? imagePath,
    String? resultAssetId,
  }) {
    return GenerationTask(
      id: id ?? this.id,
      status: status ?? this.status,
      progressText: progressText ?? this.progressText,
      error: error ?? this.error,
      imagePath: imagePath ?? this.imagePath,
      resultAssetId: resultAssetId ?? this.resultAssetId,
    );
  }
}
