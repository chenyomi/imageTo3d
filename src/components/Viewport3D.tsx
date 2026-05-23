import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Check, LoaderCircle, Settings, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { PreviewStyle } from './GeneratePanel'
import type { GenerateProgress } from '../services/modelApi'

/** 外部可调用的方法 — 后续接入模型时使用 */
export interface Viewport3DHandle {
  /** 传入 GLB/GLTF 的 URL 加载模型 */
  loadModelFromUrl: (url: string) => Promise<void>
  /** 传入 File 对象加载模型 */
  loadModelFromFile: (file: File) => Promise<void>
  /** 清空场景中的所有模型 */
  clearModels: () => void
  /** 重置摄像机 */
  resetCamera: () => void
}

interface Props {
  /** 无模型时是否显示空状态提示 */
  isEmpty?: boolean
  /** 是否正在生成（显示加载遮罩） */
  isLoading?: boolean
  /** 生成进度 0–100 */
  loadingProgress?: number
  /** 生成阶段信息 */
  loadingInfo?: GenerateProgress | null
  /** 视口预览风格 */
  previewStyle?: PreviewStyle
}

const Viewport3D = forwardRef<Viewport3DHandle, Props>(
  ({ isEmpty = true, isLoading = false, loadingProgress = 0, loadingInfo = null, previewStyle = 'normal' }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const ambientRef = useRef<THREE.AmbientLight | null>(null)
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null)
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null)
  const frameRef = useRef<number>(0)
  const hasModelRef = useRef(false)

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    loadModelFromUrl(url: string) {
      return loadModel(url)
    },
    loadModelFromFile(file: File) {
      const url = URL.createObjectURL(file)
      return loadModel(url, () => URL.revokeObjectURL(url))
    },
    clearModels() {
      removeLoadedModels()
      hasModelRef.current = false
    },
    resetCamera() {
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(4, 3, 6)
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    },
  }))

  function removeLoadedModels() {
    if (!sceneRef.current) return
    const toRemove = sceneRef.current.children.filter((c) => c.userData.isLoadedModel)
    toRemove.forEach((c) => {
      sceneRef.current!.remove(c)
      c.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    })
  }

  function loadModel(url: string, onLoaded?: () => void): Promise<void> {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) {
      return Promise.reject(new Error('3D viewport is not ready'))
    }

    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()
      loader.load(
        url,
        (gltf) => {
          removeLoadedModels()
          const model = gltf.scene
          model.userData.isLoadedModel = true
          model.traverse((child) => {
            child.userData.isLoadedModel = true
            if (child instanceof THREE.Mesh) {
              child.userData.originalMaterial = child.material
            }
          })

          // 自动居中 + 适配相机距离
          const box = new THREE.Box3().setFromObject(model)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)

          model.position.sub(center)
          sceneRef.current!.add(model)
          hasModelRef.current = true
          applyPreviewStyle(previewStyle)

          const dist = maxDim * 2.5
          cameraRef.current!.position.set(dist, dist * 0.7, dist)
          controlsRef.current!.target.set(0, 0, 0)
          controlsRef.current!.update()

          onLoaded?.()
          resolve()
        },
        undefined,
        (err) => {
          console.error('[Viewport3D] 模型加载失败:', err)
          reject(err instanceof Error ? err : new Error('Model load failed'))
        }
      )
    })
  }

  function applyPreviewStyle(style: PreviewStyle) {
    const scene = sceneRef.current
    if (!scene) return

    const styleConfig: Record<PreviewStyle, {
      background: number
      ambient: number
      key: number
      fill: number
      clay?: number
      normal?: boolean
    }> = {
      normal: { background: 0x111113, ambient: 0xffffff, key: 0xffffff, fill: 0x8890ff },
      color: { background: 0x121826, ambient: 0xffffff, key: 0xffffff, fill: 0x7c89ff },
      clay: { background: 0x16181d, ambient: 0xf7efe4, key: 0xffffff, fill: 0xd2b48c, clay: 0xc9c1b6 },
      forest: { background: 0x0f1b17, ambient: 0xe4f5dd, key: 0xb9f29b, fill: 0x4f8f76 },
      sunset: { background: 0x221518, ambient: 0xffe1c2, key: 0xff9a62, fill: 0x6b6dff },
      blue: { background: 0x0f172a, ambient: 0xdbeafe, key: 0x93c5fd, fill: 0x818cf8 },
    }
    const config = styleConfig[style]

    scene.background = new THREE.Color(config.background)
    if (ambientRef.current) ambientRef.current.color.setHex(config.ambient)
    if (dirLightRef.current) dirLightRef.current.color.setHex(config.key)
    if (fillLightRef.current) fillLightRef.current.color.setHex(config.fill)

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.isLoadedModel) {
        return
      }

      if (style === 'normal') {
        child.material = new THREE.MeshNormalMaterial()
        return
      }

      if (style === 'clay') {
        child.material = new THREE.MeshStandardMaterial({
          color: config.clay,
          roughness: 0.82,
          metalness: 0.02,
        })
        return
      }

      const original = child.userData.originalMaterial
      if (original) child.material = original
    })
  }

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // ── Scene ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111113)
    sceneRef.current = scene

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    )
    camera.position.set(4, 3, 6)
    cameraRef.current = camera

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ── Controls ──
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 0.5
    controls.maxDistance = 500
    controlsRef.current = controls

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(ambient)
    ambientRef.current = ambient

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 8, 5)
    dirLight.castShadow = true
    scene.add(dirLight)
    dirLightRef.current = dirLight

    const fillLight = new THREE.DirectionalLight(0x8890ff, 0.3)
    fillLight.position.set(-4, 2, -4)
    scene.add(fillLight)
    fillLightRef.current = fillLight

    // ── Grid ──
    const grid = new THREE.GridHelper(30, 60, 0x222225, 0x1e1e21)
    scene.add(grid)

    // ── Animate loop ──
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    applyPreviewStyle(previewStyle)
  }, [previewStyle])

  const steps = loadingInfo?.steps ?? []
  const completedCount = steps.filter((step) => step.state === 'done').length
  const currentStep = steps.find((step) => step.state === 'active')
  const loadingTitle = loadingInfo?.title ?? 'AI Generating 3D Model'
  const loadingDetail = loadingInfo?.detail ?? 'This may take 30–120 seconds…'

  return (
    <div className="flex-1 relative bg-[#0d1420] overflow-hidden min-w-0">
      {/* Three.js 挂载点 */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* 坐标轴 gizmo */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <AxisGizmo />
      </div>

      {/* ── 空状态 ── */}
      {isEmpty && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <svg viewBox="0 0 64 64" className="w-16 h-16 mb-5 opacity-[0.15]" fill="none">
            <path d="M32 6 55 19.5v25L32 58 9 44.5v-25L32 6Z" stroke="#7c89ff" strokeWidth="3" />
            <path d="M32 6v52M9 19.5 32 33l23-13.5" stroke="#7c89ff" strokeWidth="3" />
          </svg>
          <p className="text-[18px] font-semibold text-[#53627a]">No Model Yet</p>
          <p className="text-[13px] text-[#3f4d63] mt-1.5">Upload an image and start generation</p>
        </div>
      )}

      {/* ── 生成中遮罩 ── */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#0d1420]/85 flex flex-col items-center justify-center z-20 backdrop-blur-[2px]">
          <div className="w-full max-w-[560px] rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(124,137,255,0.12),_transparent_34%),linear-gradient(180deg,rgba(10,14,24,0.96),rgba(8,12,20,0.96))] px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:px-8">
            <div className="mb-6 flex items-start gap-5">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-white/8 bg-[#0a1020]/80">
                <svg viewBox="0 0 80 80" className="h-16 w-16 -rotate-90" aria-hidden="true">
                  <circle cx="40" cy="40" r="30" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
                  <circle
                    cx="40"
                    cy="40"
                    r="30"
                    stroke="#8c94ff"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={188.5}
                    strokeDashoffset={188.5 * (1 - clampProgress(loadingProgress) / 100)}
                    className="transition-all duration-500"
                  />
                </svg>
                <LoaderCircle size={18} className="absolute text-[#cfd4ff] animate-spin" />
              </div>

              <div className="min-w-0 flex-1 pt-2">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-[28px] font-semibold leading-tight text-[#8f95ff]">{loadingTitle}</p>
                  <span className="shrink-0 pt-1 text-[15px] font-semibold text-[#c5cae6]">
                    {completedCount}/{Math.max(steps.length, 1)}
                  </span>
                </div>
                <p className="mt-2 text-[14px] text-[#a9b4c8]">{loadingDetail}</p>
              </div>
            </div>

            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7c89ff] via-[#71a7ff] to-[#2ed3a6] rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, loadingProgress)}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[12px] text-[#8d99b2]">
              <span>{Math.round(loadingProgress)}%</span>
              {currentStep ? <span>Current: {currentStep.label}</span> : <span>Finalizing...</span>}
            </div>

            {steps.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {steps.map((step) => (
                    <div key={step.label} className="flex items-center gap-3 text-left">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        step.state === 'done'
                          ? 'border-[#2ed3a6]/30 bg-[#2ed3a6]/12 text-[#2ed3a6]'
                          : step.state === 'active'
                            ? 'border-[#8f95ff]/40 bg-[#8f95ff]/12 text-[#8f95ff]'
                            : 'border-white/10 bg-white/5 text-[#61708b]'
                      }`}>
                        {step.state === 'done' ? (
                          <Check size={14} />
                        ) : step.state === 'active' ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </span>
                      <span className={`text-[14px] ${
                        step.state === 'done'
                          ? 'text-[#d6f8ef]'
                          : step.state === 'active'
                            ? 'text-white'
                            : 'text-[#7c879d]'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 右侧工具栏 ── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        <ViewBtn icon={ZoomIn} label="Zoom In" onClick={() => {
          cameraRef.current?.position.multiplyScalar(0.82)
        }} />
        <ViewBtn icon={ZoomOut} label="Zoom Out" onClick={() => {
          cameraRef.current?.position.multiplyScalar(1.22)
        }} />
        <div className="w-7 h-px bg-[#2a2a2d] mx-auto my-0.5" />
        <ViewBtn icon={Maximize2} label="Reset Camera" onClick={() => {
          if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.set(4, 3, 6)
            controlsRef.current.target.set(0, 0, 0)
            controlsRef.current.update()
          }
        }} />
        <div className="w-7 h-px bg-[#2a2a2d] mx-auto my-0.5" />
        <ViewBtn icon={Settings} label="Settings" />
      </div>
    </div>
  )
})

Viewport3D.displayName = 'Viewport3D'
export default Viewport3D

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

// ── 工具按钮 ──
function ViewBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick?: () => void
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-md bg-[#1c1c1e]/80 backdrop-blur-sm text-[#555558] hover:text-white hover:bg-[#2a2a2d] transition-colors"
    >
      <Icon size={15} />
    </button>
  )
}

// ── 坐标轴 gizmo ──
function AxisGizmo() {
  return (
    <svg viewBox="0 0 72 72" className="w-14 h-14" aria-hidden="true">
      {/* Y 轴 绿 */}
      <line x1="36" y1="36" x2="36" y2="10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
      <polygon points="36,5 32.5,12 39.5,12" fill="#4ade80" />
      <text x="36" y="4" textAnchor="middle" fill="#4ade80" fontSize="8" fontFamily="system-ui, sans-serif">Y</text>
      {/* X 轴 红 */}
      <line x1="36" y1="36" x2="60" y2="24" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
      <circle cx="62" cy="23" r="3" fill="#f87171" />
      <text x="67" y="22" textAnchor="start" fill="#f87171" fontSize="8" fontFamily="system-ui, sans-serif">X</text>
      {/* Z 轴 蓝 */}
      <line x1="36" y1="36" x2="14" y2="24" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="23" r="3" fill="#60a5fa" />
      <text x="7" y="22" textAnchor="end" fill="#60a5fa" fontSize="8" fontFamily="system-ui, sans-serif">Z</text>
      {/* 中心 */}
      <circle cx="36" cy="36" r="3.5" fill="white" opacity="0.75" />
    </svg>
  )
}
