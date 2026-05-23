/**
 * 从 HuggingFace Space (TencentARC/Pixal3D-Server) 抓取所有 Gradio Live 实例地址
 * 将结果写入 GitHub Gist（通过 GitHub API），前端直接 fetch Gist 的 raw URL，
 * 无需 git commit，也不需要触发重新部署。
 *
 * 环境变量（在 GitHub Actions Secrets 中配置）：
 *   GIST_ID        — Gist 的 ID（第一次手动创建后填入）
 *   GITHUB_TOKEN   — GitHub Actions 自带，无需额外配置
 *
 * 本地调试：
 *   GIST_ID=xxx GITHUB_TOKEN=ghp_xxx node scripts/fetch-gradio-urls.mjs
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// 同时本地写一份，方便本地开发调试
const LOCAL_OUTPUT = resolve(ROOT, 'public/gradio-urls.json')

const SPACE_URL = 'https://tencentarc-pixal3d-server.hf.space'
const HF_PAGE_URL = 'https://huggingface.co/spaces/TencentARC/Pixal3D-Server'

// ── 爬取 ─────────────────────────────────────────────────────

async function extractUrlsFromPage(page) {
  await page.waitForFunction(
    () => document.body.innerText.includes('.gradio.live'),
    { timeout: 90_000 },
  )
  const raw = await page.evaluate(() => document.body.innerText)
  const seen = new Set()
  return [...raw.matchAll(/https:\/\/[a-f0-9]{16,}\.gradio\.live/g)]
    .map((m) => m[0])
    .filter((url) => { if (seen.has(url)) return false; seen.add(url); return true })
}

async function scrape() {
  const browser = await chromium.launch({ headless: true })
  try {
    // 方案一：直连 Space URL
    const page1 = await browser.newPage()
    try {
      console.log('[1/2] 直连 Space:', SPACE_URL)
      await page1.goto(SPACE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      return await extractUrlsFromPage(page1)
    } catch (e) {
      console.warn('直连失败：', e.message)
      await page1.close()
    }

    // 方案二：通过 HuggingFace 包装页 + iframe
    const page2 = await browser.newPage()
    console.log('[2/2] HF 包装页 + iframe:', HF_PAGE_URL)
    await page2.goto(HF_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page2.waitForSelector('iframe[src*="hf.space"]', { timeout: 30_000 })
    const frameEl = await page2.$('iframe[src*="hf.space"]')
    const frame = await frameEl.contentFrame()
    if (!frame) throw new Error('无法获取 iframe')
    await frame.waitForFunction(
      () => document.body.innerText.includes('.gradio.live'),
      { timeout: 90_000 },
    )
    const raw = await frame.evaluate(() => document.body.innerText)
    const seen = new Set()
    return [...raw.matchAll(/https:\/\/[a-f0-9]{16,}\.gradio\.live/g)]
      .map((m) => m[0])
      .filter((url) => { if (seen.has(url)) return false; seen.add(url); return true })
  } finally {
    await browser.close()
  }
}

// ── 写入 GitHub Gist ──────────────────────────────────────────

async function updateGist(gistId, token, content) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      files: {
        'gradio-urls.json': { content },
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gist 更新失败 (${res.status}): ${err}`)
  }
  const data = await res.json()
  return data.files['gradio-urls.json'].raw_url
}

// ── 主流程 ────────────────────────────────────────────────────

async function main() {
  const urls = await scrape()

  if (urls.length === 0) {
    console.error('未发现任何 Gradio Live 地址，退出')
    process.exit(1)
  }

  console.log(`发现 ${urls.length} 个实例：`)
  urls.forEach((u, i) => console.log(`  [${i}] ${u}`))

  const config = {
    instances: urls.map((url) => ({ url })),
    updatedAt: new Date().toISOString(),
  }
  const content = JSON.stringify(config, null, 2) + '\n'

  // 本地也写一份（用于本地开发）
  writeFileSync(LOCAL_OUTPUT, content)
  console.log('本地已写入', LOCAL_OUTPUT)

  // 写入 Gist
  const gistId = process.env.GIST_ID
  const token = process.env.GITHUB_TOKEN

  if (gistId && token) {
    const rawUrl = await updateGist(gistId, token, content)
    console.log('Gist 已更新，raw URL:', rawUrl)
  } else {
    console.warn('未设置 GIST_ID 或 GITHUB_TOKEN，跳过 Gist 更新（仅本地写入）')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

