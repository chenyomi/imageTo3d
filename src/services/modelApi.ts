/**
 * Image -> 3D API adapter for Stable-X/ReconViaGen.
 *
 * ReconViaGen exposes a Gradio gallery pipeline:
 * upload images -> /preprocess_images -> /generate_and_extract_glb.
 */

;(function patchFetch() {
  if (typeof window === 'undefined') return
  const prev = window.fetch as typeof fetch & { __gradio_patched?: boolean }
  if (prev.__gradio_patched) return
  const orig = window.fetch.bind(window)
  const next = function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url
    if (url.includes('.hf.space') || url.includes('.gradio.live')) {
      return orig(input, { ...init, credentials: 'omit' })
    }
    return orig(input, init)
  } as typeof fetch & { __gradio_patched?: boolean }
  next.__gradio_patched = true
  window.fetch = next
})()

const DEFAULT_RECONVIAGEN_URL = 'https://stable-x-reconviagen.hf.space'

export class ModelApiNotReadyError extends Error {
  constructor(msg?: string) {
    super(msg ?? 'ReconViaGen service is temporarily unavailable. Please try again later.')
    this.name = 'ModelApiNotReadyError'
  }
}

export interface GenerateParams {
  images: File[]
  prompt?: string
  settings?: GenerateSettings
  onProgress?: (progress: GenerateProgress) => void
}

export interface GenerateSettings {
  seed: number
  ssGuidanceStrength: number
  ssSamplingSteps: number
  slatGuidanceStrength: number
  slatSamplingSteps: number
  multiimageAlgo: 'multidiffusion' | 'stochastic'
  meshSimplify: number
  textureSize: 512 | 1024 | 2048
}

export interface GenerateResult {
  modelUrl: string
  thumbnailUrl?: string
  remoteModelUrl?: string
  previewVideoUrl?: string
}

export interface GenerateProgressStep {
  label: string
  state: 'done' | 'active' | 'pending'
}

export interface GenerateProgress {
  progress: number
  title: string
  detail: string
  phase: 'uploading' | 'preprocessing' | 'generating' | 'extracting' | 'complete'
  steps: GenerateProgressStep[]
  queuePosition?: number
  etaSeconds?: number
}

type FileData = {
  path?: string | null
  url?: string | null
  orig_name?: string | null
  mime_type?: string | null
  meta?: Record<string, unknown>
}

interface QueueStatusPayload {
  msg?: string
  rank?: number
  rank_eta?: number
  progress_data?: Array<{
    progress?: number | null
    index?: number | null
    length?: number | null
    desc?: string | null
  }>
  output?: {
    error?: string
    data?: unknown[]
  }
}

interface SseEventPayload {
  event: string
  data: unknown
}

const PIPELINE_STEPS = [
  'Upload images',
  'Preprocess views',
  'Generate 3D asset',
  'Extract GLB',
  'Load preview',
] as const

type PipelineStepLabel = (typeof PIPELINE_STEPS)[number]

const EMPTY_STEPS = buildSteps('Upload images', 0)

export const DEFAULT_GENERATE_SETTINGS: GenerateSettings = {
  seed: -1,
  ssGuidanceStrength: 7.5,
  ssSamplingSteps: 30,
  slatGuidanceStrength: 3,
  slatSamplingSteps: 12,
  multiimageAlgo: 'multidiffusion',
  meshSimplify: 0.95,
  textureSize: 1024,
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveGradioUrl(): string {
  return trimSlash((import.meta.env.VITE_GRADIO_URL as string | undefined) || DEFAULT_RECONVIAGEN_URL)
}

function absoluteUrl(baseUrl: string, url?: string | null): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/gradio_api/') || url.startsWith('/file=')) return `${baseUrl}${url}`
  return `${baseUrl}/gradio_api/file=${encodeURI(url)}`
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatEta(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 'Waiting for GPU slot...'
  if (seconds < 60) return `Estimated ${Math.ceil(seconds)}s remaining`
  return `Estimated ${Math.ceil(seconds / 60)} min remaining`
}

function buildSteps(
  activeLabel: PipelineStepLabel,
  activeProgress = 0,
  completedLabels: Iterable<PipelineStepLabel> = [],
): GenerateProgressStep[] {
  const completed = new Set(completedLabels)
  return PIPELINE_STEPS.map((label) => ({
    label,
    state:
      completed.has(label)
        ? 'done'
        : label === activeLabel
          ? activeProgress >= 1 ? 'done' : 'active'
          : 'pending',
  }))
}

function stepPercent(activeLabel: PipelineStepLabel, activeProgress = 0, completedLabels: Iterable<PipelineStepLabel> = []) {
  const completed = new Set(completedLabels)
  const fallbackIndex = PIPELINE_STEPS.indexOf(activeLabel)
  const completedCount = Math.max(completed.size, fallbackIndex < 0 ? 0 : fallbackIndex)
  return ((completedCount + Math.max(0, Math.min(1, activeProgress))) / PIPELINE_STEPS.length) * 100
}

function createProgress(
  title: string,
  detail: string,
  phase: GenerateProgress['phase'],
  activeLabel: PipelineStepLabel,
  activeProgress = 0,
  completedLabels: Iterable<PipelineStepLabel> = [],
  extra?: Pick<GenerateProgress, 'queuePosition' | 'etaSeconds'>,
): GenerateProgress {
  return {
    progress: clampPercent(stepPercent(activeLabel, activeProgress, completedLabels)),
    title,
    detail,
    phase,
    steps: buildSteps(activeLabel, activeProgress, completedLabels),
    ...extra,
  }
}

function latestProgress(status?: QueueStatusPayload | null) {
  const items = status?.progress_data ?? []
  return items.length > 0 ? items[items.length - 1] : undefined
}

function decodeSseEvents(text: string): SseEventPayload[] {
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return chunks.map((chunk) => {
    const lines = chunk.split('\n')
    const eventLine = lines.find((line) => line.startsWith('event:'))
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')

    return {
      event: eventLine ? eventLine.slice(6).trim() : 'message',
      data: dataLines ? JSON.parse(dataLines) : null,
    }
  })
}

async function collectSseEvents(
  response: Response,
  onEvent: (event: SseEventPayload) => void,
): Promise<SseEventPayload[]> {
  if (!response.body) {
    const events = decodeSseEvents(await response.text())
    events.forEach(onEvent)
    return events
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events: SseEventPayload[] = []

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    const chunks = buffer.split(/\n\s*\n/)
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const parsed = decodeSseEvents(chunk)
      for (const event of parsed) {
        events.push(event)
        onEvent(event)
      }
    }

    if (done) break
  }

  const tail = buffer.trim()
  if (tail) {
    const parsed = decodeSseEvents(tail)
    for (const event of parsed) {
      events.push(event)
      onEvent(event)
    }
  }

  return events
}

async function ensureReconViaGenApi(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/gradio_api/info`, {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = await res.json() as { named_endpoints?: Record<string, unknown> }
    const endpoints = data.named_endpoints ?? {}
    const usable = ['/preprocess_images', '/generate_and_extract_glb'].every((name) => name in endpoints)
    if (!usable) throw new Error('ReconViaGen endpoints missing')
  } catch (error) {
    throw new ModelApiNotReadyError(error instanceof Error ? error.message : undefined)
  }
}

async function uploadImage(baseUrl: string, file: File): Promise<FileData> {
  const form = new FormData()
  form.append('files', file)

  const res = await fetch(`${baseUrl}/gradio_api/upload`, {
    method: 'POST',
    body: form,
    credentials: 'omit',
  })

  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status})`)
  }

  const data = await res.json() as string[]
  if (!Array.isArray(data) || !data[0]) {
    throw new Error('Image upload response was empty')
  }

  return {
    path: data[0],
    orig_name: file.name,
    mime_type: file.type || 'image/png',
    meta: { _type: 'gradio.FileData' },
  }
}

async function gradioCall<T>(
  baseUrl: string,
  apiName: string,
  data: unknown[],
  sessionHash: string,
  onStatus?: (status: QueueStatusPayload) => void,
): Promise<T> {
  const startRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, session_hash: sessionHash }),
    credentials: 'omit',
  })

  if (!startRes.ok) {
    throw new Error(`${apiName} request failed (${startRes.status})`)
  }

  const startJson = await startRes.json() as { event_id?: string }
  if (!startJson.event_id) {
    throw new Error(`${apiName} did not return an event id`)
  }

  const resultRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}/${startJson.event_id}`, {
    method: 'GET',
    credentials: 'omit',
  })

  if (!resultRes.ok) {
    throw new Error(`${apiName} result failed (${resultRes.status})`)
  }

  const events = await collectSseEvents(resultRes, (event) => {
    if (event.event === 'generating' || event.event === 'message') {
      onStatus?.(event.data as QueueStatusPayload)
    }
  })

  for (const event of events) {
    if (event.event === 'error') {
      const payload = event.data as { error?: string } | null
      throw new Error(payload?.error || `${apiName} failed`)
    }
    const payload = event.data as QueueStatusPayload | null
    if (payload?.msg === 'process_completed' && payload.output?.error) {
      throw new Error(payload.output.error)
    }
  }

  const completeEvent = [...events].reverse().find((event) => event.event === 'complete')
  const processCompleted = [...events]
    .reverse()
    .map((event) => event.data as QueueStatusPayload | null)
    .find((payload) => payload?.msg === 'process_completed')

  const resultData = Array.isArray(completeEvent?.data)
    ? completeEvent?.data
    : processCompleted?.output?.data

  if (!Array.isArray(resultData)) {
    throw new Error(`${apiName} returned no usable data`)
  }

  return resultData as T
}

function toGalleryItems(files: FileData[]) {
  return files.map((file) => ({
    image: file,
    caption: null,
  }))
}

function normalizeGalleryOutput(data: unknown): Array<{ image: FileData; caption?: string | null }> {
  if (!Array.isArray(data)) return []
  return data
    .map((item) => {
      const value = item as { image?: FileData; caption?: string | null } | FileData
      if ('image' in value && value.image) return value as { image: FileData; caption?: string | null }
      return { image: value as FileData, caption: null }
    })
    .filter((item) => Boolean(item.image?.path || item.image?.url))
}

function normalizeGeneratedFile(baseUrl: string, data: unknown): string | null {
  if (typeof data === 'string') return absoluteUrl(baseUrl, data)
  const file = data as FileData | null
  return absoluteUrl(baseUrl, file?.url ?? file?.path)
}

export async function generateModel(params: GenerateParams): Promise<GenerateResult> {
  if (!params.images.length) {
    throw new Error('Please upload at least one image.')
  }

  const baseUrl = resolveGradioUrl()
  const sessionHash = crypto.randomUUID()
  const settings = { ...DEFAULT_GENERATE_SETTINGS, ...params.settings }
  const emitProgress = (progress: GenerateProgress) => params.onProgress?.(progress)
  const completedSteps = new Set<PipelineStepLabel>()
  const seed =
    Number.isFinite(settings.seed) && settings.seed >= 0
      ? settings.seed
      : Math.floor(Math.random() * 2147483647)

  await ensureReconViaGenApi(baseUrl)

  emitProgress({
    progress: 2,
    title: 'Connecting to ReconViaGen',
    detail: 'Preparing generation session...',
    phase: 'uploading',
    steps: EMPTY_STEPS,
  })

  await gradioCall<unknown[]>(baseUrl, 'start_session', [], sessionHash).catch(() => undefined)

  emitProgress(
    createProgress(
      'Uploading images',
      `${params.images.length} view${params.images.length > 1 ? 's' : ''} selected`,
      'uploading',
      'Upload images',
      0.2,
      completedSteps,
    ),
  )

  const uploadedFiles: FileData[] = []
  for (let index = 0; index < params.images.length; index += 1) {
    const file = params.images[index]
    uploadedFiles.push(await uploadImage(baseUrl, file))
    emitProgress(
      createProgress(
        'Uploading images',
        `${index + 1}/${params.images.length} uploaded`,
        'uploading',
        'Upload images',
        (index + 1) / params.images.length,
        completedSteps,
      ),
    )
  }
  completedSteps.add('Upload images')

  emitProgress(
    createProgress(
      'Preprocessing views',
      'Removing backgrounds and preparing multi-view inputs...',
      'preprocessing',
      'Preprocess views',
      0.25,
      completedSteps,
    ),
  )

  const preprocessData = await gradioCall<unknown[]>(
    baseUrl,
    'preprocess_images',
    [toGalleryItems(uploadedFiles)],
    sessionHash,
    (status) => {
      const latest = latestProgress(status)
      emitProgress(
        createProgress(
          latest?.desc ?? 'Preprocessing views',
          status.rank && status.rank > 0 ? formatEta(status.rank_eta) : 'Preparing image gallery...',
          'preprocessing',
          'Preprocess views',
          latest?.progress ?? 0.5,
          completedSteps,
          { queuePosition: status.rank, etaSeconds: status.rank_eta },
        ),
      )
    },
  )

  const processedGallery = normalizeGalleryOutput(preprocessData[0])
  if (processedGallery.length === 0) {
    throw new Error(`Preprocess failed: ${JSON.stringify(preprocessData[0])}`)
  }
  completedSteps.add('Preprocess views')

  emitProgress(
    createProgress(
      'Generating 3D asset',
      'ReconViaGen is sampling geometry and texture...',
      'generating',
      'Generate 3D asset',
      0.1,
      completedSteps,
    ),
  )

  const generatedData = await gradioCall<unknown[]>(
    baseUrl,
    'generate_and_extract_glb',
    [
      processedGallery,
      seed,
      settings.ssGuidanceStrength,
      settings.ssSamplingSteps,
      settings.slatGuidanceStrength,
      settings.slatSamplingSteps,
      settings.multiimageAlgo,
      settings.meshSimplify,
      settings.textureSize,
    ],
    sessionHash,
    (status) => {
      const latest = latestProgress(status)
      const isDone = status.msg === 'process_completed'
      const queuePosition = status.rank && status.rank > 0 ? status.rank : undefined
      emitProgress(
        createProgress(
          latest?.desc ?? (queuePosition ? 'Waiting for ZeroGPU' : 'Generating 3D asset'),
          queuePosition ? formatEta(status.rank_eta) : 'Generating and exporting GLB...',
          'generating',
          isDone ? 'Extract GLB' : 'Generate 3D asset',
          isDone ? 1 : latest?.progress ?? 0.45,
          completedSteps,
          { queuePosition, etaSeconds: status.rank_eta },
        ),
      )
    },
  )

  const previewVideoUrl = normalizeGeneratedFile(baseUrl, generatedData[1])
  const modelUrl = normalizeGeneratedFile(baseUrl, generatedData[3] ?? generatedData[2])

  if (!modelUrl) {
    throw new Error(`GLB export failed: ${JSON.stringify(generatedData)}`)
  }

  emitProgress({
    progress: 100,
    title: 'Generation complete',
    detail: 'Loading model preview...',
    phase: 'complete',
    steps: PIPELINE_STEPS.map((label) => ({ label, state: 'done' })),
  })

  return {
    modelUrl,
    remoteModelUrl: modelUrl,
    previewVideoUrl: previewVideoUrl ?? undefined,
  }
}
