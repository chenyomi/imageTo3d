/**
 * ============================================================
 *  Image → 3D 模型 API 接口层
 *  在这里对接你的 ModelSpace / 自建服务 / Gradio Space
 * ============================================================
 */

// ── 类型定义 ────────────────────────────────────────────────

export interface GenerateParams {
  /** 输入图片文件 */
  image: File
  /** 文字描述（可选，辅助引导生成） */
  prompt?: string
  /** 质量模式 */
  mode: 'hd' | 'smart'
  /** 是否自动去除背景（建议开启） */
  removeBackground?: boolean
}

export interface GenerateResult {
  /** 3D 模型文件 URL（GLB / GLTF / OBJ 等，浏览器可直接加载） */
  modelUrl: string
  /** 缩略图 URL（可选，用于资产列表展示） */
  thumbnailUrl?: string
  /** 异步任务 ID（若 API 是异步接口则有此字段） */
  jobId?: string
}

export interface JobStatus {
  jobId: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  /** 进度 0–100 */
  progress?: number
  result?: GenerateResult
  errorMessage?: string
}

// ── 配置 ─────────────────────────────────────────────────────
// 在项目根目录的 .env 文件中设置：VITE_API_BASE=https://your-api.com
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

// ── 核心接口 ─────────────────────────────────────────────────

/**
 * 图片 → 3D 模型（主入口）
 *
 * ══ 接入方式 A：同步 REST 接口 ════════════════════════════════
 *   const fd = new FormData()
 *   fd.append('image', params.image)
 *   if (params.prompt)           fd.append('prompt',            params.prompt)
 *   if (params.removeBackground) fd.append('remove_background', 'true')
 *   fd.append('mode', params.mode)
 *
 *   const res = await fetch(`${API_BASE}/generate`, { method: 'POST', body: fd })
 *   if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`)
 *   const json = await res.json()
 *   return { modelUrl: json.model_url, thumbnailUrl: json.thumbnail_url }
 *
 * ══ 接入方式 B：Hugging Face Gradio Space ═════════════════════
 *   import { Client } from '@gradio/client'
 *   const client = await Client.connect('your-space/image-to-3d')
 *   const result = await client.predict('/predict', { image: params.image })
 *   return { modelUrl: (result.data as [{ url: string }])[0].url }
 *
 * ══ 接入方式 C：异步任务（先提交再轮询）══════════════════════
 *   const jobId = await submitJob(params)
 *   // 在 App.tsx 中循环调用 getJobStatus(jobId) 直到 status === 'done'
 */
export async function generateModel(params: GenerateParams): Promise<GenerateResult> {
  // ── TODO: 取消下方注释并替换为你的接口实现 ────────────────────
  //
  // const fd = new FormData()
  // fd.append('image', params.image)
  // if (params.prompt)           fd.append('prompt',            params.prompt)
  // if (params.removeBackground) fd.append('remove_background', 'true')
  // fd.append('mode', params.mode)
  //
  // const res = await fetch(`${API_BASE}/generate`, {
  //   method: 'POST',
  //   body: fd,
  //   // headers: { Authorization: `Bearer ${import.meta.env.VITE_API_KEY}` },
  // })
  // if (!res.ok) throw new Error(`Generate failed (${res.status}): ${await res.text()}`)
  // const json = await res.json()
  // return { modelUrl: json.model_url, thumbnailUrl: json.thumbnail_url }
  // ─────────────────────────────────────────────────────────────

  throw new ModelApiNotReadyError()
}

/**
 * 提交异步任务并返回 jobId（API 耗时较长时使用）
 */
export async function submitJob(params: GenerateParams): Promise<string> {
  // TODO: 参考 generateModel 的接入方式，返回 job_id 字符串
  void params
  throw new ModelApiNotReadyError()
}

/**
 * 查询异步任务状态（配合 submitJob 使用，在 App.tsx 中轮询）
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  // TODO:
  // const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`)
  // if (!res.ok) throw new Error(`Poll failed (${res.status})`)
  // const d = await res.json()
  // return {
  //   jobId,
  //   status: d.status,          // 'queued' | 'processing' | 'done' | 'failed'
  //   progress: d.progress,      // 0–100
  //   result: d.model_url ? { modelUrl: d.model_url } : undefined,
  //   errorMessage: d.error,
  // }
  void jobId
  throw new ModelApiNotReadyError()
}

// ── 错误类型 ─────────────────────────────────────────────────

export class ModelApiNotReadyError extends Error {
  constructor(msg?: string) {
    super(
      msg ??
        'Model API not configured.\n' +
          'Open src/services/modelApi.ts and fill in your endpoint.',
    )
    this.name = 'ModelApiNotReadyError'
  }
}

// 导出 API_BASE 供调试用
export { API_BASE }
