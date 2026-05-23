/**
 * Gradio API 封装
 * 小程序直连 Gradio（优先 Gist 动态地址，回退固定地址）
 */

const GIST_ID = 'a6b2b577692bd350a543628ed2a1f9e5'
const FALLBACK_GRADIO_URL = 'https://tencentarc-pixal3d-server.hf.space'
const GRADIO_API_PREFIX = '/gradio_api'
const DEFAULT_REQUEST_TIMEOUT = 30000
const GENERATION_REQUEST_TIMEOUT = 300000
const LONG_RUNNING_APIS = new Set(['generate_3d', 'extract_glb_api'])

let cachedGradioUrl = ''
let cachedInstances = null
let instanceCursor = 0

function trimSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: DEFAULT_REQUEST_TIMEOUT,
      success(res) {
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        resolve(data)
      },
      fail(err) { reject(err) },
    })
  })
}

function requestJsonWithTimeout(url, timeout = DEFAULT_REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout,
      success(res) {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          resolve(data)
        } catch (err) {
          reject(err)
        }
      },
      fail(err) { reject(err) },
    })
  })
}

function formatOfficialProgress(queue, progress) {
  if (progress?.stage) {
    if (progress.step && progress.total) {
      return `${progress.stage} (${progress.step}/${progress.total})`
    }
    return progress.stage
  }

  if (typeof queue?.position === 'number' && queue.position > 0) {
    return `排队中，前方还有 ${queue.position} 个请求`
  }

  if (queue?.gpu_busy) {
    return 'GPU 执行中，请稍候...'
  }

  return ''
}

function startProgressPolling(baseUrl, sessionId, onProgress = () => {}) {
  let stopped = false
  let timer = null
  let lastText = ''

  const poll = async () => {
    if (stopped) return
    try {
      const [queue, progress] = await Promise.all([
        requestJsonWithTimeout(`${baseUrl}/queue?session_id=${sessionId}`, 8000).catch(() => null),
        requestJsonWithTimeout(`${baseUrl}/progress?session_id=${sessionId}`, 8000).catch(() => null),
      ])
      const text = formatOfficialProgress(queue, progress)
      if (text && text !== lastText) {
        lastText = text
        onProgress(text)
      }
    } catch (_) {
      // ignore polling failure, result SSE is still authoritative
    } finally {
      if (!stopped) {
        timer = setTimeout(poll, 1200)
      }
    }
  }

  poll()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

async function resolveGradioUrl() {
  const fallback = trimSlash(FALLBACK_GRADIO_URL)
  if (!GIST_ID) {
    cachedGradioUrl = fallback
    return cachedGradioUrl
  }

  if (!cachedInstances) {
    try {
      const gistRaw = `https://gist.githubusercontent.com/chenyomi/${GIST_ID}/raw/gradio-urls.json`
      const data = await requestJson(gistRaw)
      cachedInstances = (data?.instances || [])
        .map((item) => trimSlash(item?.url))
        .filter(Boolean)
    } catch (_) {
      cachedInstances = []
    }
  }

  if (cachedInstances.length > 0) {
    const picked = cachedInstances[instanceCursor % cachedInstances.length]
    instanceCursor += 1
    cachedGradioUrl = picked
    return cachedGradioUrl
  }

  cachedGradioUrl = fallback
  return cachedGradioUrl
}

/**
 * 上传图片到 Gradio 服务
 */
function uploadImage(baseUrl, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${baseUrl}${GRADIO_API_PREFIX}/upload`,
      filePath,
      name: 'files',
      timeout: DEFAULT_REQUEST_TIMEOUT,
      success(res) {
        try { resolve(JSON.parse(res.data)[0]) }
        catch { reject(new Error('上传失败')) }
      },
      fail(err) { reject(new Error(err?.errMsg || '图片上传失败')) },
    })
  })
}

/**
 * 调用 Gradio named API
 */
function gradioCall(baseUrl, apiName, data, options = {}) {
  const timeout = LONG_RUNNING_APIS.has(apiName)
    ? GENERATION_REQUEST_TIMEOUT
    : DEFAULT_REQUEST_TIMEOUT
  const { sessionId, onProgress } = options
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${GRADIO_API_PREFIX}/call/${apiName}`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { data },
      timeout,
      success(res) {
        const eventId = res.data?.event_id
        if (!eventId) return reject(new Error(`${apiName} 启动失败`))

        const stopPolling = sessionId
          ? startProgressPolling(baseUrl, sessionId, onProgress)
          : () => {}

        wx.request({
          url: `${baseUrl}${GRADIO_API_PREFIX}/call/${apiName}/${eventId}`,
          method: 'GET',
          timeout,
          success(r) {
            stopPolling()
            const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
            const lines = text.split('\n').filter(l => l.startsWith('data:'))
            const last = lines[lines.length - 1]
            if (!last) return reject(new Error(`${apiName} 无结果`))
            try { resolve(JSON.parse(last.slice(5).trim())) }
            catch { reject(new Error(`${apiName} 结果解析失败`)) }
          },
          fail(err) {
            stopPolling()
            reject(new Error(`${apiName} 结果获取失败：${err?.errMsg || 'unknown error'}`))
          },
        })
      },
      fail(err) { reject(new Error(`${apiName} 请求失败：${err?.errMsg || 'unknown error'}`)) },
    })
  })
}

/**
 * 主流程：图片 → 3D GLB
 * @param {string} localImagePath  wx.chooseMedia 返回的临时路径
 * @param {{ resolution: number, seed: number }} options
 * @param {(step: string) => void} onProgress  进度回调
 * @returns {Promise<string>}  GLB 文件的完整 URL
 */
async function generateModel(localImagePath, options = {}, onProgress = () => {}) {
  const baseUrl = await resolveGradioUrl()
  const { resolution = 1024, seed = -1 } = options
  const actualSeed = seed >= 0 ? seed : Math.floor(Math.random() * 100000)
  const sessionId = String(Date.now())

  onProgress('正在上传图片...')
  const uploadedPath = await uploadImage(baseUrl, localImagePath)

  onProgress('预处理中...')
  const [preprocessed] = await gradioCall(baseUrl, 'preprocess', [{ path: uploadedPath }])

  onProgress('生成 3D 中，请稍候...')
  const [stateObj] = await gradioCall(baseUrl, 'generate_3d', [
    preprocessed,
    actualSeed, resolution,
    7.5, 0.7, 8, 5.0,
    7.5, 0.5, 8, 3.0,
    1.0, 0.0, 8, 3.0,
    -1, sessionId,
  ], { sessionId, onProgress })

  const statePath = typeof stateObj === 'string'
    ? stateObj
    : stateObj?.state_path ?? stateObj?.path ?? stateObj?.url
  if (!statePath) throw new Error('未获取到 3D 状态路径')

  onProgress('提取 GLB 文件...')
  const [glbData] = await gradioCall(
    baseUrl,
    'extract_glb_api',
    [statePath, 250000, 1024, sessionId],
    { sessionId, onProgress },
  )

  const glbPath = glbData?.url ?? glbData?.path
  if (!glbPath) throw new Error('未获取到 GLB 文件')

  // 补全为完整 URL
  return glbPath.startsWith('http') ? glbPath : `${baseUrl}${glbPath}`
}

module.exports = { generateModel }
