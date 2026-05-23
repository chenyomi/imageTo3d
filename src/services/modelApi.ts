/**
 * ============================================================
 *  Image → 3D 模型 API 接口层
 *  对接本地 Gradio Live 实例（三步：preprocess → generate_3d → extract_glb）
 * ============================================================
 */

// 网页端直接调用 /gradio_api/call，避免依赖不同实例对 @gradio/client /info 的兼容性。

// ── CORS 修复 ────────────────────────────────────────────────
// @gradio/client 硬编码 credentials:'include'，Gradio Live 不返回
// Access-Control-Allow-Credentials:true → 预检失败。补丁强制 omit。
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
    if (url.includes('.gradio.live') || url.includes('.hf.space')) {
      return orig(input, { ...init, credentials: 'omit' })
    }
    return orig(input, init)
  } as typeof fetch & { __gradio_patched?: boolean }
  next.__gradio_patched = true
  window.fetch = next
})()

// ── 错误类型 ─────────────────────────────────────────────────

export class ModelApiNotReadyError extends Error {
  constructor(msg?: string) {
    super(msg ?? 'Gradio 服务器暂不可用，请等待 CI 自动更新实例地址（每天 10:00 UTC+8）。')
    this.name = 'ModelApiNotReadyError'
  }
}

// ── URL 管理 ─────────────────────────────────────────────────
// 优先级：VITE_GRADIO_URL env var > Gist(CI自动轮询分流)

export interface GradioInstance { url: string }

let _instances: GradioInstance[] | null = null
let _instanceCursor = 0
const _validEndpointCache = new Map<string, boolean>()

export async function fetchGradioInstances(): Promise<GradioInstance[]> {
  if (_instances !== null) return _instances

  // 1. Gist raw URL（无速率限制，直接读最新内容）
  const gistId = (import.meta.env.VITE_GIST_ID as string | undefined) || ''
  if (gistId) {
    try {
      const res = await fetch(
        `https://gist.githubusercontent.com/chenyomi/${gistId}/raw/gradio-urls.json`,
        { credentials: 'omit', cache: 'no-store' },
      )
      if (res.ok) {
        const data = await res.json() as { instances?: GradioInstance[] }
        _instances = data.instances ?? []
        if (_instances.length > 0) return _instances
      }
    } catch { /* ignore */ }
  }

  _instances = []
  return _instances
}

async function hasWorkingApi(baseUrl: string): Promise<boolean> {
  const normalizedUrl = baseUrl.replace(/\/$/, '')
  const cached = _validEndpointCache.get(normalizedUrl)
  if (typeof cached === 'boolean') return cached

  try {
    const res = await fetch(`${normalizedUrl}/gradio_api/info`, {
      credentials: 'omit',
      cache: 'no-store',
    })

    if (!res.ok) {
      _validEndpointCache.set(normalizedUrl, false)
      return false
    }

    const data = await res.json() as {
      named_endpoints?: Record<string, unknown>
      unnamed_endpoints?: Record<string, unknown>
    }

    const namedEndpoints = data.named_endpoints ?? {}
    const usable = ['/preprocess', '/generate_3d', '/extract_glb_api'].every((key) => key in namedEndpoints)
    _validEndpointCache.set(normalizedUrl, usable)
    return usable
  } catch {
    _validEndpointCache.set(normalizedUrl, false)
    return false
  }
}

/** 解析当前应使用的 Gradio URL（内部使用） */
async function resolveGradioUrl(): Promise<string> {
  // 1. 固定直连地址（本地/线上优先）
  const direct = (import.meta.env.VITE_GRADIO_URL as string | undefined) ?? ''
  if (direct) {
    const normalized = direct.replace(/\/$/, '')
    if (await hasWorkingApi(normalized)) return normalized
  }

  // 2. Gist 动态地址（CI 自动更新，按实例轮询分流）
  const list = await fetchGradioInstances()
  if (list.length > 0) {
    for (let offset = 0; offset < list.length; offset += 1) {
      const picked = list[(_instanceCursor + offset) % list.length]
      const normalized = picked.url.replace(/\/$/, '')
      if (await hasWorkingApi(normalized)) {
        _instanceCursor += offset + 1
        return normalized
      }
    }
  }

  throw new ModelApiNotReadyError()
}

// ── 配置 ─────────────────────────────────────────────────────

// ── 类型定义 ────────────────────────────────────────────────

export interface GenerateParams {
  image: File
  prompt?: string
  settings?: GenerateSettings
  onProgress?: (progress: GenerateProgress) => void
}

export interface GenerateSettings {
  resolution: 1024 | 1536
  seed: number
  manualFov: number
  ssGuidanceStrength: number
  ssSamplingSteps: number
  shapeGuidanceStrength: number
  shapeSamplingSteps: number
  decimationTarget: number
  textureSize: 512 | 1024 | 2048 | 4096
}

export interface GenerateResult {
  modelUrl: string
  thumbnailUrl?: string
  remoteModelUrl?: string
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

// ── 核心接口 ─────────────────────────────────────────────────

type FileData = { url?: string | null; path?: string; state_path?: string }

const PIPELINE_STEPS = [
  'Preprocessing & Camera Estimation',
  'Sampling sparse structure (proj)',
  'Sampling shape SLat (proj)',
  'Sampling HR shape SLat',
  'Sampling texture SLat (proj)',
  'Rendering',
  'Extracting GLB',
] as const

type PipelineStepLabel = (typeof PIPELINE_STEPS)[number]

const EMPTY_STEPS: GenerateProgressStep[] = PIPELINE_STEPS.map((label, index) => ({
  label,
  state: index === 0 ? 'active' : 'pending',
}))

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatEta(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 'Queueing job...'
  if (seconds < 60) return `Estimated ${Math.ceil(seconds)}s remaining`
  const minutes = Math.ceil(seconds / 60)
  return `Estimated ${minutes} min remaining`
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
          ? activeProgress < 1 ? 'active' : 'done'
          : 'pending',
  }))
}

function calcStepPercent(
  _activeLabel: PipelineStepLabel,
  activeProgress = 0,
  completedLabels: Iterable<PipelineStepLabel> = [],
): number {
  const normalized = Math.max(0, Math.min(1, activeProgress))
  const completedCount = new Set(completedLabels).size
  return ((completedCount + normalized) / PIPELINE_STEPS.length) * 100
}

function matchPipelineStep(desc?: string | null): PipelineStepLabel {
  const text = String(desc ?? '').toLowerCase()
  if (text.includes('camera')) return 'Preprocessing & Camera Estimation'
  if (text.includes('sparse structure')) return 'Sampling sparse structure (proj)'
  if (text.includes('hr shape slat')) return 'Sampling HR shape SLat'
  if (text.includes('shape slat')) return 'Sampling shape SLat (proj)'
  if (text.includes('texture slat')) return 'Sampling texture SLat (proj)'
  if (text.includes('render')) return 'Rendering'
  return 'Sampling sparse structure (proj)'
}

interface QueueStatusPayload {
  msg?: string
  queue_size?: number
  rank?: number
  rank_eta?: number
  progress_data?: Array<{
    progress?: number | null
    index?: number | null
    length?: number | null
    unit?: string | null
    desc?: string | null
  }>
  output?: {
    error?: string
    data?: unknown[]
  }
  success?: boolean
}

interface OfficialQueueResponse {
  position?: number
  total_waiting?: number
  gpu_busy?: boolean
  total_ahead_for_unregistered?: number
}

interface OfficialProgressResponse {
  stage?: string
  step?: number
  total?: number
  done?: boolean
}

interface SseEventPayload {
  event: string
  data: unknown
}

function getLatestProgressItem(status?: QueueStatusPayload | null) {
  const items = status?.progress_data ?? []
  return items.length > 0 ? items[items.length - 1] : undefined
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
    progress: clampPercent(calcStepPercent(activeLabel, activeProgress, completedLabels)),
    title,
    detail,
    phase,
    steps: buildSteps(activeLabel, activeProgress, completedLabels),
    ...extra,
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function startOfficialProgressPolling(
  baseUrl: string,
  sessionId: string,
  onUpdate: (snapshot: { queue: OfficialQueueResponse | null; progress: OfficialProgressResponse | null }) => void,
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false

  const poll = async () => {
    if (stopped || inFlight) return
    inFlight = true

    try {
      const [queueRes, progressRes] = await Promise.all([
        fetch(`${baseUrl}/queue?session_id=${sessionId}`, { credentials: 'omit', cache: 'no-store' }),
        fetch(`${baseUrl}/progress?session_id=${sessionId}`, { credentials: 'omit', cache: 'no-store' }),
      ])

      const queue = queueRes.ok
        ? await queueRes.json() as OfficialQueueResponse
        : null
      const progress = progressRes.ok
        ? await progressRes.json() as OfficialProgressResponse
        : null

      onUpdate({ queue, progress })
    } catch {
      // ignore polling errors and fall back to SSE status
    } finally {
      inFlight = false
      if (!stopped) {
        timer = setTimeout(poll, 1200)
      }
    }
  }

  void poll()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

async function uploadImage(baseUrl: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('files', file)

  const res = await fetch(`${baseUrl}/gradio_api/upload`, {
    method: 'POST',
    body: form,
    credentials: 'omit',
  })

  if (!res.ok) {
    throw new Error(`图片上传失败 (${res.status})`)
  }

  const data = await res.json() as string[]
  if (!Array.isArray(data) || !data[0]) {
    throw new Error('上传结果解析失败')
  }

  return data[0]
}

function decodeSseEvents(text: string): SseEventPayload[] {
  const chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return chunks.map((chunk) => {
    const lines = chunk.split('\n')
    const eventLine = lines.find((line) => line.startsWith('event:'))
    const dataLine = lines.find((line) => line.startsWith('data:'))

    return {
      event: eventLine ? eventLine.slice(6).trim() : 'message',
      data: dataLine ? JSON.parse(dataLine.slice(5).trim()) : null,
    }
  })
}

async function collectSseEvents(
  response: Response,
  onEvent: (event: SseEventPayload) => void,
): Promise<SseEventPayload[]> {
  if (!response.body) {
    const text = await response.text()
    const events = decodeSseEvents(text)
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
      const trimmed = chunk.trim()
      if (!trimmed) continue
      const parsed = decodeSseEvents(trimmed)
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

async function gradioCall<T>(
  baseUrl: string,
  apiName: string,
  data: unknown[],
  onStatus?: (status: QueueStatusPayload) => void,
): Promise<T> {
  const startRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    credentials: 'omit',
  })

  if (!startRes.ok) {
    throw new Error(`${apiName} 请求失败 (${startRes.status})`)
  }

  const startJson = await startRes.json() as { event_id?: string }
  if (!startJson.event_id) {
    throw new Error(`${apiName} 启动失败`)
  }

  const resultRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}/${startJson.event_id}`, {
    method: 'GET',
    credentials: 'omit',
  })

  if (!resultRes.ok) {
    throw new Error(`${apiName} 结果获取失败 (${resultRes.status})`)
  }

  const events = await collectSseEvents(resultRes, (event) => {
    if (event.event === 'error') {
      return
    }

    if (event.event === 'generating' || event.event === 'message') {
      onStatus?.(event.data as QueueStatusPayload)
    }
  })
  if (events.length === 0) {
    throw new Error(`${apiName} 无结果`)
  }

  for (const event of events) {
    if (event.event === 'error') {
      const payload = event.data as { error?: string } | null
      throw new Error(payload?.error || `${apiName} 执行失败`)
    }

    const payload = event.data as QueueStatusPayload | null
    if (payload?.msg === 'process_completed' && payload.output?.error) {
      throw new Error(payload.output.error)
    }
  }

  const completed = [...events].reverse().find((event) => event.event === 'complete')
  const completedPayload = completed?.data
  const processCompleted = [...events]
    .reverse()
    .map((event) => event.data as QueueStatusPayload | null)
    .find((event) => event?.msg === 'process_completed')

  const resultData = Array.isArray(completedPayload)
    ? completedPayload
    : processCompleted?.output?.data

  if (!Array.isArray(resultData)) {
    throw new Error(`${apiName} 结果解析失败`)
  }

  return resultData as T
}

export const DEFAULT_GENERATE_SETTINGS: GenerateSettings = {
  resolution: 1024,
  seed: -1,
  manualFov: -1,
  ssGuidanceStrength: 7.5,
  ssSamplingSteps: 8,
  shapeGuidanceStrength: 7.5,
  shapeSamplingSteps: 8,
  decimationTarget: 250000,
  textureSize: 1024,
}

/**
 * 图片 → 3D 模型（三步流程）
 *
 * 1. /preprocess   — 去背景 + 图片预处理
 * 2. /generate_3d  — 生成 3D 结构体（返回 state_path）
 * 3. /extract_glb  — 从状态提取 GLB 文件
 */
export async function generateModel(params: GenerateParams): Promise<GenerateResult> {
  const gradioUrl = await resolveGradioUrl()
  const baseUrl = trimSlash(gradioUrl)
  const sessionId = crypto.randomUUID()
  const settings = { ...DEFAULT_GENERATE_SETTINGS, ...params.settings }
  const emitProgress = (progress: GenerateProgress) => params.onProgress?.(progress)
  const completedSteps = new Set<PipelineStepLabel>()
  let currentGenerateStep: PipelineStepLabel | null = null
  const seed =
    Number.isFinite(settings.seed) && settings.seed >= 0
      ? settings.seed
      : Math.floor(Math.random() * 100000)

  emitProgress({
    progress: 2,
    title: 'Uploading source image',
    detail: 'Preparing request...',
    phase: 'uploading',
    steps: EMPTY_STEPS,
  })

  // ── Step 1: 预处理图片 ────────────────────────────────────
  const uploadedPath = await uploadImage(baseUrl, params.image)
  const preData = await gradioCall<unknown[]>(baseUrl, 'preprocess', [{ path: uploadedPath }])
  const preprocessedImage = preData[0] as FileData

  emitProgress(
    createProgress(
      'Preprocessing & Camera Estimation',
      'Cleaning image and estimating view...',
      'preprocessing',
      'Preprocessing & Camera Estimation',
      1,
      completedSteps,
    ),
  )
  completedSteps.add('Preprocessing & Camera Estimation')

  // ── Step 2: 生成 3D ───────────────────────────────────────
  let hasOfficialGenerateProgress = false
  const stopGeneratePolling = startOfficialProgressPolling(baseUrl, sessionId, ({ queue, progress }) => {
    const stageText = progress?.stage?.trim()
    const hasSnapshot = Boolean(stageText) || typeof queue?.position === 'number'
    if (!hasSnapshot) return

    hasOfficialGenerateProgress = true
    const stepLabel = stageText ? matchPipelineStep(stageText) : (currentGenerateStep ?? 'Sampling sparse structure (proj)')
    const stepProgress = progress?.step && progress?.total ? progress.step / progress.total : 0.12

    if (currentGenerateStep && currentGenerateStep !== stepLabel) {
      completedSteps.add(currentGenerateStep)
    }
    currentGenerateStep = stepLabel

    if (typeof queue?.position === 'number' && queue.position > 0 && !stageText) {
      emitProgress({
        progress: 3,
        title: `In queue: ${queue.position} request${queue.position > 1 ? 's' : ''} ahead`,
        detail: queue.gpu_busy ? 'Waiting for GPU slot...' : 'Waiting in queue...',
        phase: 'generating',
        steps: EMPTY_STEPS,
        queuePosition: queue.position,
      })
      return
    }

    emitProgress(
      createProgress(
        stageText ?? 'Generating 3D structure',
        progress?.step && progress?.total
          ? `${progress.step}/${progress.total}`
          : queue?.gpu_busy
            ? 'GPU job running...'
            : 'Generating 3D structure...',
        'generating',
        stepLabel,
        Math.max(0.08, Math.min(1, stepProgress)),
        completedSteps,
        {
          queuePosition: queue?.position,
        },
      ),
    )
  })

  let genData: unknown[]
  try {
    genData = await gradioCall<unknown[]>(baseUrl, 'generate_3d', [
      preprocessedImage,
      seed,
      settings.resolution,
      settings.ssGuidanceStrength,
      0.7,
      settings.ssSamplingSteps,
      5.0,
      settings.shapeGuidanceStrength,
      0.5,
      settings.shapeSamplingSteps,
      3.0,
      1.0,
      0.0,
      settings.shapeSamplingSteps,
      3.0,
      settings.manualFov,
      sessionId,
    ], (status) => {
      if (hasOfficialGenerateProgress) return

      const latest = getLatestProgressItem(status)
      const stepLabel = latest?.desc ? matchPipelineStep(latest.desc) : 'Sampling sparse structure (proj)'
      const stepProgress = latest?.progress ?? (
        latest?.index !== null && latest?.length ? (latest.index ?? 0) / latest.length : 0
      )

      if (currentGenerateStep && currentGenerateStep !== stepLabel) {
        completedSteps.add(currentGenerateStep)
      }
      currentGenerateStep = stepLabel

      if (status.rank && status.rank > 0 && !latest?.desc) {
        emitProgress({
          progress: 3,
          title: `In queue: ${status.rank} request${status.rank > 1 ? 's' : ''} ahead`,
          detail: formatEta(status.rank_eta),
          phase: 'generating',
          steps: EMPTY_STEPS,
          queuePosition: status.rank,
          etaSeconds: status.rank_eta,
        })
        return
      }

      const fallbackTitle = status.msg === 'process_completed' ? 'Generating 3D structure' : 'Preparing 3D generation'
      emitProgress(
        createProgress(
          latest?.desc ?? fallbackTitle,
          latest?.length
            ? `${Math.max(1, (latest.index ?? 0) + (latest.progress && latest.progress > 0 ? 1 : 0))}/${latest.length}`
            : formatEta(status.rank_eta),
          'generating',
          stepLabel,
          stepProgress ?? 0,
          completedSteps,
          {
            queuePosition: status.rank,
            etaSeconds: status.rank_eta,
          },
        ),
      )
    })
  } finally {
    stopGeneratePolling()
  }

  // generate_3d 返回 state 对象，其 path 字段作为 state_path 传给下一步
  const stateObj = genData[0] as FileData | string | null
  const statePath =
    typeof stateObj === 'string'
      ? stateObj
      : (stateObj as FileData)?.state_path ??
        (stateObj as FileData)?.path ??
        (stateObj as FileData)?.url ??
        null

  if (!statePath) {
    throw new Error(`生成失败：未获取到状态路径，数据：${JSON.stringify(stateObj)}`)
  }

  // ── Step 3: 提取 GLB ──────────────────────────────────────
  emitProgress(
    createProgress(
      'Extracting GLB',
      'Packaging geometry and textures...',
      'extracting',
      'Extracting GLB',
      0.35,
      completedSteps,
    ),
  )
  if (currentGenerateStep) {
    completedSteps.add(currentGenerateStep)
  }

  let hasOfficialExtractProgress = false
  const stopExtractPolling = startOfficialProgressPolling(baseUrl, sessionId, ({ queue, progress }) => {
    if (!progress?.stage && typeof queue?.position !== 'number') return
    hasOfficialExtractProgress = true

    emitProgress(
      createProgress(
        progress?.stage?.trim() || 'Extracting GLB',
        progress?.step && progress?.total
          ? `${progress.step}/${progress.total}`
          : typeof queue?.position === 'number' && queue.position > 0
            ? `Waiting for export slot...`
            : 'Packaging geometry and textures...',
        'extracting',
        'Extracting GLB',
        progress?.step && progress?.total ? progress.step / progress.total : 0.7,
        completedSteps,
        {
          queuePosition: queue?.position,
        },
      ),
    )
  })

  let glbDataList: unknown[]
  try {
    glbDataList = await gradioCall<unknown[]>(baseUrl, 'extract_glb_api', [
      statePath,
      settings.decimationTarget,
      settings.textureSize,
      sessionId,
    ], (status) => {
      if (hasOfficialExtractProgress) return

      emitProgress(
        createProgress(
          'Extracting GLB',
          status.rank && status.rank > 0
            ? `Waiting for export slot · ${formatEta(status.rank_eta)}`
            : 'Packaging geometry and textures...',
          'extracting',
          'Extracting GLB',
          status.msg === 'process_completed' ? 1 : 0.7,
          completedSteps,
          {
            queuePosition: status.rank,
            etaSeconds: status.rank_eta,
          },
        ),
      )
    })
  } finally {
    stopExtractPolling()
  }

  const glbData = glbDataList[0] as FileData | null
  const glbUrl = glbData?.url ?? glbData?.path

  if (!glbUrl) {
    throw new Error(`提取 GLB 失败：${JSON.stringify(glbData)}`)
  }

  emitProgress({
    progress: 100,
    title: 'Generation complete',
    detail: 'Loading model preview...',
    phase: 'complete',
    steps: PIPELINE_STEPS.map((label) => ({ label, state: 'done' })),
  })

  return {
    modelUrl: glbUrl,
    remoteModelUrl: glbUrl,
  }
}


