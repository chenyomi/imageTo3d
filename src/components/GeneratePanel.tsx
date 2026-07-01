import { useState, useRef, useCallback } from 'react'
import type { ComponentType, MouseEvent } from 'react'
import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronUp,
  Dices,
  ImageIcon,
  Layers3,
  Palette,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateSettings,
} from '../services/modelApi'

export type PreviewStyle = 'normal' | 'clay' | 'color' | 'forest' | 'sunset' | 'blue'

/** 将 SVG File 光栅化为 PNG File（通过 Canvas） */
function svgToPng(svgFile: File, size = 1024): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(svgFile)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || size
      const h = img.naturalHeight || size
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('No 2d context')) }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas toBlob failed'))
        resolve(new File([blob], svgFile.name.replace(/\.svg$/i, '.png'), { type: 'image/png' }))
      }, 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')) }
    img.src = url
  })
}

export interface GeneratePanelProps {
  onGenerate: (images: File[], prompt: string, settings: GenerateSettings) => void
  isGenerating: boolean
  hasModel: boolean
  error: string | null
  onClearError: () => void
  previewStyle: PreviewStyle
  onPreviewStyleChange: (style: PreviewStyle) => void
}

const previewStyles: Array<{ id: PreviewStyle; label: string }> = [
  { id: 'normal', label: 'Normal' },
  { id: 'clay', label: 'Clay' },
  { id: 'color', label: 'Color' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'blue', label: 'Blue' },
]

export default function GeneratePanel({
  onGenerate,
  isGenerating,
  hasModel,
  error,
  onClearError,
  previewStyle,
  onPreviewStyleChange,
}: GeneratePanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [showEngine, setShowEngine] = useState(false)
  const [settings, setSettings] = useState<GenerateSettings>(DEFAULT_GENERATE_SETTINGS)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setImages = useCallback(async (files: File[]) => {
    const imageList = files.filter((file) => file.type.startsWith('image/')).slice(0, 8)
    if (imageList.length === 0) return
    onClearError()

    const converted = await Promise.all(imageList.map(async (file) => {
      if (file.type !== 'image/svg+xml') return file
      try {
        return await svgToPng(file)
      } catch {
        return file
      }
    }))

    setImageFiles(converted)
    setImagePreviews((prev) => {
      prev.forEach(URL.revokeObjectURL)
      return imageList.map((file) => URL.createObjectURL(file))
    })
  }, [onClearError])

  const appendImages = useCallback(async (files: File[]) => {
    const slots = Math.max(0, 8 - imageFiles.length)
    if (slots === 0) return
    const incoming = files.filter((file) => file.type.startsWith('image/')).slice(0, slots)
    if (incoming.length === 0) return
    onClearError()

    const converted = await Promise.all(incoming.map(async (file) => {
      if (file.type !== 'image/svg+xml') return file
      try {
        return await svgToPng(file)
      } catch {
        return file
      }
    }))

    setImageFiles((prev) => [...prev, ...converted])
    setImagePreviews((prev) => [...prev, ...incoming.map((file) => URL.createObjectURL(file))])
  }, [imageFiles.length, onClearError])

  const removeImage = (index: number, e?: MouseEvent) => {
    e?.stopPropagation()
    setImageFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
    setImagePreviews((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index)
      URL.revokeObjectURL(prev[index])
      return next
    })
    onClearError()
  }

  const clearImages = (e: MouseEvent) => {
    e.stopPropagation()
    setImageFiles([])
    setImagePreviews((prev) => {
      prev.forEach(URL.revokeObjectURL)
      return []
    })
    onClearError()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) {
      void setImages(files)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) {
      void (imageFiles.length ? appendImages(files) : setImages(files))
    }
    e.target.value = ''
  }

  const updateSetting = <K extends keyof GenerateSettings>(
    key: K,
    value: GenerateSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const randomizeSeed = () => {
    updateSetting('seed', Math.floor(Math.random() * 999999))
  }

  const handleGenerate = () => {
    if (imageFiles.length === 0 || isGenerating) return
    onGenerate(imageFiles, '', settings)
  }

  const canGenerate = imageFiles.length > 0 && !isGenerating

  return (
    <aside className="w-full lg:w-[320px] bg-[#101826] lg:border-r border-[#263348] flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-y] text-[#dbe4f3]">
      <div className="px-6 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8fa0bb]">
          <Sparkles size={15} className="text-[#7c89ff]" />
          ReconViaGen Workspace
        </div>
        <h2 className="mt-1.5 text-[21px] leading-tight font-bold text-white">Multi-view to 3D</h2>
      </div>

      <div className="px-6 pb-4">
        <div
          className={`relative min-h-[150px] rounded-[18px] border transition-all cursor-pointer overflow-hidden ${
            isDragging
              ? 'border-[#7c89ff] bg-[#7c89ff]/10'
              : 'border-[#34435c] bg-[#182234] hover:border-[#566785]'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => imagePreviews.length === 0 && fileInputRef.current?.click()}
        >
          {imagePreviews.length > 0 ? (
            <>
              <div className="grid h-full min-h-[150px] grid-cols-2 gap-1 p-1">
                {imagePreviews.slice(0, 4).map((preview, index) => (
                  <div key={preview} className="relative overflow-hidden rounded-xl bg-[#0d1420]">
                    <img src={preview} alt={`view ${index + 1}`} className="h-full min-h-[70px] w-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => removeImage(index, e)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {imagePreviews.length > 4 && (
                <div className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-bold text-white">
                  +{imagePreviews.length - 4}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#111827]"
                >
                  <UploadCloud size={15} />
                  Add Views
                </button>
              </div>
              <button
                onClick={clearImages}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <div className="flex h-full min-h-[150px] flex-col items-center justify-center gap-2.5 px-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#202c42] text-[#8fa0bb]">
                <ImageIcon size={22} />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-white">Drop object views here</p>
                <p className="mt-1 text-[12px] text-[#8fa0bb]">1-8 JPG, PNG, WEBP, SVG images</p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="space-y-4 px-6 pb-5">
        <section className="space-y-2.5">
          <PanelTitle icon={Box} label="Generation" />
          <div>
            <div className="flex items-center justify-between">
              <FieldLabel label="Generation Seed" />
              <span className="text-[13px] font-bold text-[#7c89ff]">
                {settings.seed >= 0 ? `#${settings.seed}` : 'Random'}
              </span>
            </div>
            <div className="flex gap-3">
              <input
                type="number"
                min={-1}
                max={999999}
                value={settings.seed}
                onChange={(e) => updateSetting('seed', Number(e.target.value))}
                className="min-w-0 flex-1 rounded-2xl border border-[#34435c] bg-[#182234] px-4 py-3 text-[15px] font-semibold text-white outline-none focus:border-[#7c89ff]"
              />
              <button
                type="button"
                onClick={randomizeSeed}
                className="flex h-[50px] w-[58px] items-center justify-center rounded-2xl border border-[#34435c] bg-[#182234] text-white hover:border-[#7c89ff]"
                title="Random seed"
              >
                <Dices size={19} />
              </button>
            </div>
          </div>
          <div>
            <FieldLabel label="Multi-view Algorithm" />
            <select
              value={settings.multiimageAlgo}
              onChange={(e) => updateSetting('multiimageAlgo', e.target.value as GenerateSettings['multiimageAlgo'])}
              className="w-full rounded-2xl border border-[#34435c] bg-[#182234] px-4 py-3 text-[15px] font-semibold text-white outline-none focus:border-[#7c89ff]"
            >
              <option value="multidiffusion">Multidiffusion</option>
              <option value="stochastic">Stochastic</option>
            </select>
          </div>
        </section>

        {hasModel && (
          <section className="space-y-3">
            <PanelTitle icon={Palette} label="Preview Style" />
            <div className="grid grid-cols-3 gap-2">
              {previewStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onPreviewStyleChange(style.id)}
                  className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                    previewStyle === style.id
                      ? 'border-[#7c89ff] bg-[#7c89ff] text-white'
                      : 'border-[#34435c] bg-[#182234] text-[#aab7cc] hover:border-[#566785] hover:text-white'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[20px] border border-[#263348] bg-[#121d2d] p-4">
          <button
            type="button"
            onClick={() => setShowEngine((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <PanelTitle icon={Layers3} label="Advanced Engine" compact />
            {showEngine ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showEngine && (
            <div className="mt-4 space-y-5 border-t border-[#263348] pt-4">
              <RangeField
                label="SS Guidance"
                value={settings.ssGuidanceStrength}
                min={0}
                max={10}
                step={0.1}
                onChange={(value) => updateSetting('ssGuidanceStrength', value)}
              />
              <RangeField
                label="SS Sampling"
                value={settings.ssSamplingSteps}
                min={1}
                max={50}
                step={1}
                onChange={(value) => updateSetting('ssSamplingSteps', value)}
              />
              <RangeField
                label="SLat Guidance"
                value={settings.slatGuidanceStrength}
                min={0}
                max={10}
                step={0.1}
                onChange={(value) => updateSetting('slatGuidanceStrength', value)}
              />
              <RangeField
                label="SLat Sampling"
                value={settings.slatSamplingSteps}
                min={1}
                max={50}
                step={1}
                onChange={(value) => updateSetting('slatSamplingSteps', value)}
              />
              <RangeField
                label="Mesh Simplify"
                value={settings.meshSimplify}
                min={0.9}
                max={0.98}
                step={0.01}
                onChange={(value) => updateSetting('meshSimplify', value)}
              />

              <div>
                <FieldLabel label="Texture" />
                <select
                  value={settings.textureSize}
                  onChange={(e) => updateSetting('textureSize', Number(e.target.value) as 512 | 1024 | 2048)}
                  className="w-full rounded-xl border border-[#34435c] bg-[#182234] px-3 py-2.5 text-[13px] font-semibold text-white outline-none"
                >
                  <option value={512}>512</option>
                  <option value={1024}>1024</option>
                  <option value={2048}>2048</option>
                </select>
              </div>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="mx-6 mb-4 rounded-2xl border border-red-500/30 bg-red-950/40 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-red-300" />
            <p className="flex-1 text-[12px] leading-relaxed text-red-200">{error}</p>
            <button onClick={onClearError} className="text-red-300 hover:text-white">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1" />

      <div className="sticky bottom-0 border-t border-[#263348] bg-[#101826]/95 p-6 backdrop-blur">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`flex w-full items-center justify-center gap-3 rounded-[22px] py-4 text-[16px] font-extrabold transition ${
            isGenerating
              ? 'bg-[#7c89ff]/60 text-white/70 cursor-not-allowed'
              : canGenerate
              ? 'bg-[#7c89ff] text-white shadow-[0_18px_38px_rgba(124,137,255,0.28)] hover:bg-[#8d98ff] active:scale-[0.98]'
              : 'bg-[#1a2537] text-[#62718a] cursor-not-allowed'
          }`}
        >
          {isGenerating ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Generating
            </>
          ) : (
            <>
              <Zap size={20} />
              {hasModel ? 'Regenerate' : 'Start Generation'}
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

function PanelTitle({
  icon: Icon,
  label,
  compact = false,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  label: string
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 font-bold text-[#cfd8e8] ${compact ? 'text-[14px]' : 'text-[15px]'}`}>
      <Icon size={compact ? 15 : 17} className="text-[#8fa0bb]" />
      <span>{label}</span>
    </div>
  )
}

function FieldLabel({ label }: { label: string }) {
  return (
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8190aa]">
      {label}
    </label>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#dbe4f3]">{label}</span>
        <span className="text-[13px] font-extrabold text-[#8d98ff]">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#7c89ff]"
      />
    </div>
  )
}
