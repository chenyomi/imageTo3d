import { useState, useRef, useCallback } from 'react'
import Navbar from './components/Navbar'
import GeneratePanel from './components/GeneratePanel'
import Viewport3D, { type Viewport3DHandle } from './components/Viewport3D'
import RightPanel, { type Asset } from './components/RightPanel'
import { generateModel, ModelApiNotReadyError } from './services/modelApi'
import './index.css'

type AppState = 'idle' | 'generating' | 'done' | 'error'

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)

  const viewportRef = useRef<Viewport3DHandle>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 进度条模拟（真实接口替换后可移除） ──────────────────────────
  const startProgress = () => {
    setProgress(0)
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p >= 88 ? 88 : p + Math.random() * 10 + 2))
    }, 700)
  }
  const stopProgress = (final = 100) => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    setProgress(final)
  }

  // ── 核心生成入口 ──────────────────────────────────────────────────
  // 当模型 API 就绪时，只需修改 src/services/modelApi.ts 即可
  const handleGenerate = useCallback(
    async (imageFile: File, prompt: string, mode: 'hd' | 'smart') => {
      setAppState('generating')
      setError(null)
      startProgress()

      try {
        const result = await generateModel({
          image: imageFile,
          prompt: prompt || undefined,
          mode,
          removeBackground: true, // 默认开启去背景
        })

        stopProgress(100)

        // 加载到视口
        viewportRef.current?.loadModelFromUrl(result.modelUrl)

        // 添加到资产列表
        const asset: Asset = {
          id: Date.now().toString(),
          name: imageFile.name.replace(/\.[^.]+$/, ''),
          modelUrl: result.modelUrl,
          thumbnailUrl: result.thumbnailUrl,
          createdAt: new Date(),
        }
        setAssets((prev) => [asset, ...prev])
        setActiveAssetId(asset.id)
        setAppState('done')
      } catch (err) {
        stopProgress(0)
        const isNotReady = err instanceof ModelApiNotReadyError
        setError(
          isNotReady
            ? '⚠️ Model API not configured yet.\nEdit src/services/modelApi.ts to connect your model.'
            : err instanceof Error
            ? err.message
            : String(err),
        )
        setAppState('error')
      }
    },
    [],
  )

  // ── 点击资产 → 在视口中加载 ─────────────────────────────────────
  const handleSelectAsset = useCallback((asset: Asset) => {
    setActiveAssetId(asset.id)
    viewportRef.current?.loadModelFromUrl(asset.modelUrl)
    setAppState('done')
  }, [])

  // ── 直接导入 3D 文件 ─────────────────────────────────────────────
  const handleUploadModel = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    viewportRef.current?.loadModelFromFile(file)

    const asset: Asset = {
      id: Date.now().toString(),
      name: file.name,
      modelUrl: url,
      createdAt: new Date(),
    }
    setAssets((prev) => [asset, ...prev])
    setActiveAssetId(asset.id)
    setAppState('done')
  }, [])

  return (
    <div className="flex h-screen bg-[#111113] text-white overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        <Navbar />

        <div className="flex flex-1 min-h-0">
          {/* 左侧生成面板 */}
          <GeneratePanel
            onGenerate={handleGenerate}
            isGenerating={appState === 'generating'}
            error={error}
            onClearError={() => { setError(null); setAppState('idle') }}
          />

          {/* 3D 视口 */}
          <Viewport3D
            ref={viewportRef}
            isEmpty={appState === 'idle'}
            isLoading={appState === 'generating'}
            loadingProgress={progress}
          />

          {/* 右侧资产面板 */}
          <RightPanel
            assets={assets}
            activeAssetId={activeAssetId}
            onSelectAsset={handleSelectAsset}
            onUploadModel={handleUploadModel}
          />
        </div>
      </div>
    </div>
  )
}
