/**
 * ============================================================
 *  Image → 3D 模型 API 接口层
 *  对接本地 Gradio Live 实例（三步：preprocess → generate_3d → extract_glb）
 * ============================================================
 */

import { Client } from '@gradio/client'

// ── 配置 ─────────────────────────────────────────────────────

const GRADIO_URL =
  (import.meta.env.VITE_GRADIO_URL as string | undefined) ||
  'https://bd921b1cf789ef3ea5.gradio.live'

// ── 类型定义 ────────────────────────────────────────────────

export interface GenerateParams {
  image: File
  prompt?: string
  settings?: GenerateSettings
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
}

// ── 核心接口 ─────────────────────────────────────────────────

type FileData = { url?: string | null; path?: string; state_path?: string }

export const DEFAULT_GENERATE_SETTINGS: GenerateSettings = {
  resolution: 1536,
  seed: -1,
  manualFov: -1,
  ssGuidanceStrength: 7.5,
  ssSamplingSteps: 12,
  shapeGuidanceStrength: 7.5,
  shapeSamplingSteps: 12,
  decimationTarget: 250000,
  textureSize: 2048,
}

/**
 * 图片 → 3D 模型（三步流程）
 *
 * 1. /preprocess   — 去背景 + 图片预处理
 * 2. /generate_3d  — 生成 3D 结构体（返回 state_path）
 * 3. /extract_glb  — 从状态提取 GLB 文件
 */
export async function generateModel(params: GenerateParams): Promise<GenerateResult> {
  const client = await Client.connect(GRADIO_URL)
  const sessionId = crypto.randomUUID()
  const settings = { ...DEFAULT_GENERATE_SETTINGS, ...params.settings }
  const seed =
    Number.isFinite(settings.seed) && settings.seed >= 0
      ? settings.seed
      : Math.floor(Math.random() * 100000)

  // ── Step 1: 预处理图片 ────────────────────────────────────
  const preRes = await client.predict('/preprocess', { image: params.image })
  const preprocessedImage = (preRes.data as unknown[])[0] as FileData

  // ── Step 2: 生成 3D ───────────────────────────────────────
  const genRes = await client.predict('/generate_3d', {
    image: preprocessedImage,
    seed,
    resolution: settings.resolution,
    ss_guidance_strength: settings.ssGuidanceStrength,
    ss_guidance_rescale: 0.7,
    ss_sampling_steps: settings.ssSamplingSteps,
    ss_rescale_t: 5.0,
    shape_slat_guidance_strength: settings.shapeGuidanceStrength,
    shape_slat_guidance_rescale: 0.5,
    shape_slat_sampling_steps: settings.shapeSamplingSteps,
    shape_slat_rescale_t: 3.0,
    tex_slat_guidance_strength: 1.0,
    tex_slat_guidance_rescale: 0.0,
    tex_slat_sampling_steps: settings.shapeSamplingSteps,
    tex_slat_rescale_t: 3.0,
    manual_fov: settings.manualFov,
    session_id: sessionId,
  })

  // generate_3d 返回 state 对象，其 path 字段作为 state_path 传给下一步
  const stateObj = (genRes.data as unknown[])[0] as FileData | string | null
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
  const glbRes = await client.predict('/extract_glb_api', {
    state_path: statePath,
    decimation_target: settings.decimationTarget,
    texture_size: settings.textureSize,
    session_id: sessionId,
  })

  const glbData = (glbRes.data as unknown[])[0] as FileData | null
  const glbUrl = glbData?.url ?? glbData?.path

  if (!glbUrl) {
    throw new Error(`提取 GLB 失败：${JSON.stringify(glbData)}`)
  }

  // 本地 Gradio 实例无 CORS/auth 问题，直接 fetch 转 blob
  const resp = await fetch(glbUrl)
  if (!resp.ok) throw new Error(`下载模型文件失败 (${resp.status})`)
  const blob = await resp.blob()
  return { modelUrl: URL.createObjectURL(blob) }
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
