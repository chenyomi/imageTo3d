import { useEffect, useMemo, useRef, useState } from 'react'
import Viewport3D, { type Viewport3DHandle } from './Viewport3D'

function buildBlobUrl(file: Blob) {
  return URL.createObjectURL(file)
}

export default function EmbeddedPreviewPage() {
  const viewportRef = useRef<Viewport3DHandle>(null)
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const modelUrl = params.get('glbUrl') || ''
  const title = params.get('name') || '模型预览'
  const missingModelError = '当前没有拿到可用的模型地址。'

  const [loading, setLoading] = useState(Boolean(modelUrl))
  const [error, setError] = useState(modelUrl ? '' : missingModelError)
  const [resolvedUrl, setResolvedUrl] = useState('')

  useEffect(() => {
    if (!modelUrl) {
      return
    }

    const controller = new AbortController()
    let blobUrl = ''

    async function load() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(modelUrl, {
          credentials: 'omit',
          mode: 'cors',
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`模型文件请求失败 (${response.status})`)
        }

        const blob = await response.blob()
        blobUrl = buildBlobUrl(blob)
        setResolvedUrl(blobUrl)
        viewportRef.current?.loadModelFromUrl(blobUrl)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : '模型加载失败')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      controller.abort()
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [modelUrl])

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#07111d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(124,137,255,0.24),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(86,214,255,0.18),transparent_24%),linear-gradient(180deg,#08111c_0%,#0b1624_100%)]" />

      <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0b1624]/78 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7bdff6]">Embedded Preview</p>
          <h1 className="truncate text-[18px] font-semibold text-white md:text-[20px]">{title}</h1>
        </div>
        <a
          href={modelUrl || resolvedUrl || '#'}
          download
          className="inline-flex min-w-[88px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#82d8ff,#7c89ff)] px-4 py-2 text-[13px] font-bold text-[#07111d] shadow-[0_12px_30px_rgba(124,137,255,0.25)] transition-opacity hover:opacity-90"
        >
          下载 GLB
        </a>
      </div>

      <div className="relative z-10 flex-1">
        <Viewport3D
          ref={viewportRef}
          isEmpty={!loading && !error && !resolvedUrl}
          isLoading={loading}
          loadingProgress={loading ? 48 : 100}
          previewStyle="color"
        />

        {error && (
          <div className="absolute inset-x-4 top-4 z-20 rounded-[24px] border border-[rgba(255,122,145,0.24)] bg-[rgba(21,13,22,0.88)] px-5 py-4 text-sm text-[#ffd5dc] shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl md:left-6 md:right-auto md:max-w-[520px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#ff9cab]">Preview Failed</p>
            <p className="mt-2 text-[14px] leading-6 text-[#ffe7ec]">{error}</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-center md:bottom-6">
          <div className="rounded-full border border-white/10 bg-[#0b1624]/72 px-4 py-2 text-[12px] text-[#c9d5e6] backdrop-blur-xl">
            双指缩放，单指拖动旋转模型
          </div>
        </div>
      </div>
    </div>
  )
}