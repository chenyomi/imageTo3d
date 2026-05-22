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
    <div className="w-[280px] bg-[#101826] border-l border-[#263348] flex flex-col flex-shrink-0">
      {/* ── 标题 ── */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-bold text-white">Assets</h2>
          <p className="text-[11px] text-[#71809a] mt-0.5">{assets.length} model{assets.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => uploadRef.current?.click()}
          title="Upload 3D Model"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#182234] hover:bg-[#202c42] rounded-xl text-[12px] font-semibold text-[#cfd8e8] hover:text-white transition-colors"
        >
          <Upload size={13} />
          <span>Import</span>
        </button>
      </div>

      <div className="mx-4 border-t border-[#263348]" />

      {/* ── 当前选中模型信息 ── */}
      {activeAsset && (
        <div className="mx-3 mt-3 bg-[#121d2d] border border-[#263348] rounded-2xl p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-100 truncate">{activeAsset.name}</p>
              <p className="text-[11px] text-[#71809a] mt-0.5">
                {activeAsset.createdAt.toLocaleTimeString()}
              </p>
            </div>
            <a
              href={activeAsset.modelUrl}
              download={`${activeAsset.name}.glb`}
              title="Download Model"
              className="p-1.5 rounded-lg text-[#71809a] hover:text-white hover:bg-[#182234] transition-colors flex-shrink-0"
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
            <Layers size={28} className="text-[#34435c] mb-3" />
            <p className="text-[13px] text-[#71809a]">No models yet</p>
            <p className="text-[11px] text-[#52617a] mt-1">
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
                      ? 'bg-[#7c89ff]/14 border border-[#7c89ff]/35'
                      : 'hover:bg-[#182234] border border-transparent'
                  }`}
                >
                  {/* 缩略图或占位 */}
                  <div className="w-10 h-10 rounded-xl bg-[#182234] flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 32 32" className="w-6 h-6 opacity-40" fill="none">
                        <path d="M16 4 27 10.5v11L16 28 5 21.5v-11L16 4Z" stroke="#7c89ff" strokeWidth="2" />
                        <path d="M16 4v24M5 10.5l11 6.5 11-6.5" stroke="#7c89ff" strokeWidth="2" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold truncate ${isActive ? 'text-[#aab2ff]' : 'text-gray-300'}`}>
                      {asset.name}
                    </p>
                    <p className="text-[11px] text-[#71809a]">
                      {asset.createdAt.toLocaleTimeString()}
                    </p>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7c89ff] flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 上传区 ── */}
      <div className="p-3 border-t border-[#263348]">
        <button
          onClick={() => uploadRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#34435c] hover:border-[#7c89ff] text-[#71809a] hover:text-gray-200 transition-colors text-[12px] font-semibold"
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
