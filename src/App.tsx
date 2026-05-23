import { useState, useRef, useCallback } from 'react'
import Navbar from './components/Navbar'
import GeneratePanel, { type PreviewStyle } from './components/GeneratePanel'
import Viewport3D, { type Viewport3DHandle } from './components/Viewport3D'
import RightPanel, { type Asset } from './components/RightPanel'
import { generateModel, type GenerateSettings } from './services/modelApi'
import './index.css'

type AppState = 'idle' | 'generating' | 'done' | 'error'
type MobileTab = 'generate' | 'view' | 'assets'

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [assets, setAssets] = useState<Asset[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [previewStyle, setPreviewStyle] = useState<PreviewStyle>('color')
  const [mobileTab, setMobileTab] = useState<MobileTab>('generate')

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
    async (imageFile: File, prompt: string, settings: GenerateSettings) => {
      setAppState('generating')
      setError(null)
      startProgress()

      try {
        const result = await generateModel({
          image: imageFile,
          prompt: prompt || undefined,
          settings,
        })

        stopProgress(100)
        viewportRef.current?.loadModelFromUrl(result.modelUrl)

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
        setMobileTab('view')
      } catch (err) {
        stopProgress(0)
        setError(err instanceof Error ? err.message : String(err))
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
    <div className="flex flex-col h-[100dvh] bg-[#0d1420] text-white overflow-hidden">
      <Navbar />

      <div className="flex flex-1 min-h-0">
        {/* 左侧生成面板 */}
        <div className={`${mobileTab === 'generate' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-auto`}>
          <GeneratePanel
            onGenerate={handleGenerate}
            isGenerating={appState === 'generating'}
            hasModel={appState === 'done'}
            error={error}
            onClearError={() => { setError(null); setAppState('idle') }}
            previewStyle={previewStyle}
            onPreviewStyleChange={setPreviewStyle}
          />
        </div>

        {/* 3D 视口 */}
        <div className={`${mobileTab === 'view' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0`}>
          <Viewport3D
            ref={viewportRef}
            isEmpty={appState === 'idle'}
            isLoading={appState === 'generating'}
            loadingProgress={progress}
            previewStyle={previewStyle}
          />
        </div>

        {/* 右侧资产面板 */}
        <div className={`${mobileTab === 'assets' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-auto`}>
          <RightPanel
            assets={assets}
            activeAssetId={activeAssetId}
            onSelectAsset={(asset) => { handleSelectAsset(asset); setMobileTab('view') }}
            onUploadModel={(file) => { handleUploadModel(file); setMobileTab('view') }}
          />
        </div>
      </div>

      {/* 移动端底部 Tab 栏 */}
      <nav className="lg:hidden flex border-t border-[#263348] bg-[#101826]">
        {([
          { id: 'generate', label: '生成', icon: '✦' },
          { id: 'view',     label: '预览', icon: '◈' },
          { id: 'assets',   label: '历史', icon: '⊞', badge: assets.length > 0 ? assets.length : undefined },
        ] as { id: MobileTab; label: string; icon: string; badge?: number }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
              mobileTab === tab.id ? 'text-[#7c89ff]' : 'text-[#71809a]'
            }`}
          >
            <span className="text-[18px] leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="absolute top-1.5 right-[calc(50%-14px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7c89ff] px-1 text-[9px] font-bold text-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
