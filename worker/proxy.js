/**
 * Cloudflare Worker — Pixal3D 代理
 *
 * 功能：
 * 1. 从 GitHub Gist 读取最新 Gradio Live URL（带 5 分钟缓存）
 * 2. 将请求透传给 Gradio 服务器
 * 3. 添加 CORS 头，兼容浏览器和小程序
 *
 * 部署：
 *   pnpm dlx wrangler deploy worker/proxy.js --name pixal3d-proxy --compatibility-date 2024-01-01
 *
 * 小程序 / 网页 调用示例：
 *   POST https://pixal3d-proxy.YOUR_NAME.workers.dev/call/preprocess
 */

const GIST_RAW = 'https://gist.githubusercontent.com/chenyomi/a6b2b577692bd350a543628ed2a1f9e5/raw/gradio-urls.json'
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

let cachedUrl = ''
let cachedAt = 0

async function getGradioUrl() {
  if (cachedUrl && Date.now() - cachedAt < CACHE_TTL) return cachedUrl
  const res = await fetch(GIST_RAW, { cf: { cacheTtl: 300 } })
  if (!res.ok) throw new Error('Gist 读取失败')
  const data = await res.json()
  const url = data?.instances?.[0]?.url
  if (!url) throw new Error('暂无可用实例')
  cachedUrl = url.replace(/\/$/, '')
  cachedAt = Date.now()
  return cachedUrl
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
}

export default {
  async fetch(request) {
    // 处理预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    // /status → 返回当前 Gradio URL（用于调试）
    if (url.pathname === '/status') {
      try {
        const gradioUrl = await getGradioUrl()
        return Response.json({ ok: true, gradioUrl }, { headers: CORS })
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 503, headers: CORS })
      }
    }

    // 其他路径直接代理到 Gradio
    try {
      const gradioUrl = await getGradioUrl()
      const target = gradioUrl + url.pathname + url.search

      const proxyReq = new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      })

      const res = await fetch(proxyReq)

      // 注入 CORS 头
      const headers = new Headers(res.headers)
      Object.entries(CORS).forEach(([k, v]) => headers.set(k, v))
      headers.delete('content-encoding') // 避免 double gzip

      return new Response(res.body, {
        status: res.status,
        headers,
      })
    } catch (e) {
      return Response.json(
        { error: e.message },
        { status: 502, headers: CORS },
      )
    }
  },
}
