import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Settings, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

/** 外部可调用的方法 — 后续接入模型时使用 */
export interface Viewport3DHandle {
  /** 传入 GLB/GLTF 的 URL 加载模型 */
  loadModelFromUrl: (url: string) => void
  /** 传入 File 对象加载模型 */
  loadModelFromFile: (file: File) => void
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
}

const Viewport3D = forwardRef<Viewport3DHandle, Props>(
  ({ isEmpty = true, isLoading = false, loadingProgress = 0 }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const frameRef = useRef<number>(0)
  const hasModelRef = useRef(false)

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    loadModelFromUrl(url: string) {
      loadModel(url)
    },
    loadModelFromFile(file: File) {
      const url = URL.createObjectURL(file)
      loadModel(url, () => URL.revokeObjectURL(url))
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

  function loadModel(url: string, onLoaded?: () => void) {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return
    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        removeLoadedModels()
        const model = gltf.scene
        model.userData.isLoadedModel = true

        // 自动居中 + 适配相机距离
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)

        model.position.sub(center)
        sceneRef.current!.add(model)
        hasModelRef.current = true

        const dist = maxDim * 2.5
        cameraRef.current!.position.set(dist, dist * 0.7, dist)
        controlsRef.current!.target.set(0, 0, 0)
        controlsRef.current!.update()

        onLoaded?.()
      },
      undefined,
      (err) => console.error('[Viewport3D] 模型加载失败:', err)
    )
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

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 8, 5)
    dirLight.castShadow = true
    scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x8890ff, 0.3)
    fillLight.position.set(-4, 2, -4)
    scene.add(fillLight)

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

  return (
    <div className="flex-1 relative bg-[#111113] overflow-hidden min-w-0">
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
            <polygon points="32,5 59,55 5,55" stroke="#f5c518" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="32,24 46,52 18,52" fill="#f5c518" opacity="0.8" />
          </svg>
          <p className="text-[18px] font-semibold text-[#44444a]">No Model Yet</p>
          <p className="text-[13px] text-[#33333a] mt-1.5">Upload an image and click Generate</p>
        </div>
      )}

      {/* ── 生成中遮罩 ── */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#111113]/85 flex flex-col items-center justify-center z-20 backdrop-blur-[2px]">
          {/* 脉冲 logo */}
          <div className="relative mb-6">
            <svg viewBox="0 0 64 64" className="w-14 h-14" fill="none">
              <polygon
                points="32,5 59,55 5,55"
                stroke="#f5c518"
                strokeWidth="2.5"
                strokeLinejoin="round"
                className="animate-pulse"
              />
              <polygon points="32,24 46,52 18,52" fill="#f5c518" opacity="0.7" className="animate-pulse" />
            </svg>
            {/* 旋转环 */}
            <div className="absolute -inset-3 border-2 border-yellow-400/20 border-t-yellow-400/60 rounded-full animate-spin" />
          </div>

          <p className="text-[14px] font-semibold text-gray-200 mb-1">AI Generating 3D Model</p>
          <p className="text-[12px] text-[#555558] mb-5">This may take 30–120 seconds…</p>

          {/* 进度条 */}
          <div className="w-52 h-1.5 bg-[#2a2a2d] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, loadingProgress)}%` }}
            />
          </div>
          <p className="text-[11px] text-[#555558] mt-1.5">{Math.round(loadingProgress)}%</p>
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
