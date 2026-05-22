import { useRef } from 'react'
import { Upload, Layers, Download } from 'lucide-react'

export interface Asset {
  id: string
  name: string
  modelUrl: string
  thumbnailUrl?: string
  createdAt: Date
}

interface Props {
  assets: Asset[]
  activeAssetId: string | null
  onSelectAsset: (asset: Asset) => void
  onUploadModel: (file: File) => void
}

export default function RightPanel({
  assets,
  activeAssetId,
  onSelectAsset,
  onUploadModel,
}: Props) {
  const uploadRef = useRef<HTMLInputElement>(null)

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUploadModel(file)
    e.target.value = ''
  }

  const activeAsset = assets.find((a) => a.id === activeAssetId) ?? null

  return (
    <div className="w-[260px] bg-[#1c1c1e] border-l border-[#2a2a2d] flex flex-col flex-shrink-0">
      {/* ── 标题 ── */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Assets</h2>
          <p className="text-[11px] text-[#555558] mt-0.5">{assets.length} model{assets.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => uploadRef.current?.click()}
          title="Upload 3D Model"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#252527] hover:bg-[#2e2e31] rounded-lg text-[12px] text-gray-300 hover:text-white transition-colors"
        >
          <Upload size={13} />
          <span>Import</span>
        </button>
      </div>

      <div className="mx-4 border-t border-[#252527]" />

      {/* ── 当前选中模型信息 ── */}
      {activeAsset && (
        <div className="mx-3 mt-3 bg-[#161618] rounded-xl p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-200 truncate">{activeAsset.name}</p>
              <p className="text-[11px] text-[#555558] mt-0.5">
                {activeAsset.createdAt.toLocaleTimeString()}
              </p>
            </div>
            <a
              href={activeAsset.modelUrl}
              download={`${activeAsset.name}.glb`}
              title="Download Model"
              className="p-1.5 rounded-md text-[#555558] hover:text-white hover:bg-[#252527] transition-colors flex-shrink-0"
            >
              <Download size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ── 资产列表 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {assets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <Layers size={28} className="text-[#2e2e31] mb-3" />
            <p className="text-[13px] text-[#3a3a3d]">No models yet</p>
            <p className="text-[11px] text-[#2a2a2d] mt-1">
              Generate one or import a file
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {assets.map((asset) => {
              const isActive = asset.id === activeAssetId
              return (
                <button
                  key={asset.id}
                  onClick={() => onSelectAsset(asset)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                    isActive
                      ? 'bg-yellow-400/10 border border-yellow-400/20'
                      : 'hover:bg-[#252527] border border-transparent'
                  }`}
                >
                  {/* 缩略图或占位 */}
                  <div className="w-10 h-10 rounded-lg bg-[#252527] flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 32 32" className="w-6 h-6 opacity-40" fill="none">
                        <polygon points="16,3 29,27 3,27" stroke="#f5c518" strokeWidth="2" strokeLinejoin="round" />
                        <polygon points="16,13 23,27 9,27" fill="#f5c518" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium truncate ${isActive ? 'text-yellow-300' : 'text-gray-300'}`}>
                      {asset.name}
                    </p>
                    <p className="text-[11px] text-[#555558]">
                      {asset.createdAt.toLocaleTimeString()}
                    </p>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 上传区 ── */}
      <div className="p-3 border-t border-[#252527]">
        <button
          onClick={() => uploadRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#2a2a2d] hover:border-[#3a3a3d] text-[#555558] hover:text-gray-300 transition-colors text-[12px]"
        >
          <Upload size={14} />
          <span>Import GLB / OBJ / FBX</span>
        </button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".glb,.gltf,.obj,.fbx,.stl"
        className="hidden"
        onChange={handleModelUpload}
      />
    </div>
  )
}
