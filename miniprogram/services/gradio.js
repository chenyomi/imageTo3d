/**
 * Gradio API 封装
 * 通过 Cloudflare Worker 固定代理访问 Gradio Live（解决域名动态变化问题）
 *
 * 部署 Worker 后将 PROXY_URL 替换为你的 Worker 地址：
 *   https://pixal3d-proxy.YOUR_NAME.workers.dev
 */

const PROXY_URL = 'https://pixal3d-proxy.chenyuming5640.workers.dev'

/**
 * 上传图片到代理服务器
 */
function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${PROXY_URL}/upload`,
      filePath,
      name: 'files',
      success(res) {
        try { resolve(JSON.parse(res.data)[0]) }
        catch { reject(new Error('上传失败')) }
      },
      fail() { reject(new Error('图片上传失败')) },
    })
  })
}

/**
 * 调用 Gradio named API
 */
function gradioCall(apiName, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${PROXY_URL}/call/${apiName}`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { data },
      success(res) {
        const eventId = res.data?.event_id
        if (!eventId) return reject(new Error(`${apiName} 启动失败`))
        wx.request({
          url: `${PROXY_URL}/call/${apiName}/${eventId}`,
          method: 'GET',
          success(r) {
            const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
            const lines = text.split('\n').filter(l => l.startsWith('data:'))
            const last = lines[lines.length - 1]
            if (!last) return reject(new Error(`${apiName} 无结果`))
            try { resolve(JSON.parse(last.slice(5).trim())) }
            catch { reject(new Error(`${apiName} 结果解析失败`)) }
          },
          fail() { reject(new Error(`${apiName} 结果获取失败`)) },
        })
      },
      fail() { reject(new Error(`${apiName} 请求失败`)) },
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
  const { resolution = 1536, seed = -1 } = options
  const actualSeed = seed >= 0 ? seed : Math.floor(Math.random() * 100000)
  const sessionId = String(Date.now())

  onProgress('正在上传图片...')
  const uploadedPath = await uploadImage(localImagePath)

  onProgress('预处理中...')
  const [preprocessed] = await gradioCall('preprocess', [{ path: uploadedPath }])

  onProgress('生成 3D 中（约 30~60 秒）...')
  const [stateObj] = await gradioCall('generate_3d', [
    preprocessed,
    actualSeed, resolution,
    7.5, 0.7, 12, 5.0,
    7.5, 0.5, 12, 3.0,
    1.0, 0.0, 12, 3.0,
    -1, sessionId,
  ])

  const statePath = typeof stateObj === 'string'
    ? stateObj
    : stateObj?.state_path ?? stateObj?.path ?? stateObj?.url
  if (!statePath) throw new Error('未获取到 3D 状态路径')

  onProgress('提取 GLB 文件...')
  const [glbData] = await gradioCall('extract_glb_api', [statePath, 250000, 2048, sessionId])

  const glbPath = glbData?.url ?? glbData?.path
  if (!glbPath) throw new Error('未获取到 GLB 文件')

  // 补全为完整 URL
  return glbPath.startsWith('http') ? glbPath : `${PROXY_URL}${glbPath}`
}

module.exports = { generateModel }
