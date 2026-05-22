import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  X,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Zap,
  Scissors,
} from 'lucide-react'

export interface GeneratePanelProps {
  onGenerate: (image: File, prompt: string, mode: 'hd' | 'smart') => void
  isGenerating: boolean
  error: string | null
  onClearError: () => void
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        value ? 'bg-yellow-400' : 'bg-[#3a3a3d]'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function GeneratePanel({
  onGenerate,
  isGenerating,
  error,
  onClearError,
}: GeneratePanelProps) {
  const [mode, setMode] = useState<'hd' | 'smart'>('hd')
  const [isDragging, setIsDragging] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [removeBg, setRemoveBg] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    onClearError()
  }, [onClearError])

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    setImageFile(null)
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    onClearError()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setImage(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setImage(file)
    e.target.value = ''
  }

  const handleGenerate = () => {
    if (!imageFile || isGenerating) return
    onGenerate(imageFile, prompt.trim(), mode)
  }

  const canGenerate = !!imageFile && !isGenerating

  return (
    <div className="w-[288px] bg-[#1c1c1e] border-r border-[#2a2a2d] flex flex-col flex-shrink-0 overflow-y-auto">
      {/* ── 标题 ── */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-white">Generate 3D Model</h2>
        <p className="text-[12px] text-[#555558] mt-0.5">Upload a photo to create a 3D mesh</p>
      </div>

      <div className="mx-4 border-t border-[#252527]" />

      {/* ── HD / Smart ── */}
      <div className="flex gap-2 px-4 pt-3 pb-2">
        <button
          onClick={() => setMode('hd')}
          className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
            mode === 'hd' ? 'bg-white text-black' : 'bg-[#252527] text-[#888] hover:text-white'
          }`}
        >
          HD Model
        </button>
        <button
          onClick={() => setMode('smart')}
          className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-1 ${
            mode === 'smart' ? 'bg-white text-black' : 'bg-[#252527] text-[#888] hover:text-white'
          }`}
        >
          Smart Mesh
          <Zap size={12} className={mode === 'smart' ? 'text-yellow-500 fill-yellow-500' : 'text-yellow-400'} />
        </button>
      </div>

      {/* ── 图片上传区 ── */}
      <div className="px-4 pb-3">
        <div
          className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden ${
            isDragging ? 'border-yellow-400 bg-yellow-400/5' : 'border-[#2e2e31] hover:border-[#3a3a3d]'
          } ${imagePreview ? 'h-48' : 'h-36'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !imagePreview && fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <>
              <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/90 rounded-lg text-black text-[12px] font-medium"
                >
                  Replace
                </button>
              </div>
              <button
                onClick={clearImage}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
              <div className="w-10 h-10 rounded-full bg-[#252527] flex items-center justify-center">
                <ImageIcon size={18} className="text-[#555558]" />
              </div>
              <div className="text-center">
                <p className="text-[13px] text-gray-300 font-medium">Drop image here</p>
                <p className="text-[11px] text-[#555558] mt-0.5">or click to browse</p>
              </div>
              <p className="text-[10px] text-[#3a3a3d]">JPG · PNG · WEBP · max 20MB</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── 文字提示（可选） ── */}
      <div className="px-4 pb-3">
        <label className="text-[11px] text-[#555558] font-medium uppercase tracking-wider">
          Describe (optional)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. a red ceramic mug, clean background..."
          rows={2}
          className="mt-1.5 w-full bg-[#252527] border border-[#2e2e31] rounded-lg px-3 py-2 text-[13px] text-gray-300 placeholder-[#3a3a3d] resize-none focus:outline-none focus:border-[#3a3a3d] transition-colors"
        />
      </div>

      {/* ── 高级设置（可折叠） ── */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] text-[#555558] hover:text-gray-300 transition-colors w-full"
        >
          <span>Advanced Settings</span>
          {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-2 bg-[#161618] rounded-xl px-3 py-3">
            {/* 去除背景 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scissors size={13} className="text-[#555558]" />
                <span className="text-[13px] text-gray-400">Remove Background</span>
              </div>
              <Toggle value={removeBg} onChange={setRemoveBg} />
            </div>
            <p className="text-[11px] text-[#3a3a3d] leading-relaxed">
              Strip the background before processing — improves quality for photos with busy backgrounds.
            </p>
          </div>
        )}
      </div>

      {/* ── 错误提示 ── */}
      {error && (
        <div className="mx-4 mb-3 rounded-xl bg-red-950/60 border border-red-800/40 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-red-300 leading-relaxed flex-1">{error}</p>
            <button onClick={onClearError} className="text-red-400 hover:text-red-200 flex-shrink-0">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── 无图片提示 ── */}
      {!imageFile && !error && (
        <div className="mx-4 mb-3 rounded-xl bg-[#1a1a1c] border border-[#252527] px-3 py-2.5">
          <p className="text-[12px] text-[#3a3a3d] text-center">
            Upload an image to enable generation
          </p>
        </div>
      )}

      <div className="flex-1" />

      {/* ── 生成按钮 ── */}
      <div className="p-4 pt-2">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-bold transition-all ${
            isGenerating
              ? 'bg-yellow-400/60 text-black/60 cursor-not-allowed'
              : canGenerate
              ? 'bg-yellow-400 hover:bg-yellow-300 text-black active:scale-[0.98] shadow-lg shadow-yellow-400/20'
              : 'bg-[#252527] text-[#555558] cursor-not-allowed'
          }`}
        >
          {isGenerating ? (
            <>
              <span className="w-4 h-4 border-2 border-black/30 border-t-black/80 rounded-full animate-spin" />
              <span>Generating…</span>
            </>
          ) : (
            <span>Generate 3D Model</span>
          )}
        </button>
      </div>
    </div>
  )
}
