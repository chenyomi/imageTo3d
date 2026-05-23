const app = getApp()
const MODEL_LOAD_TIMEOUT = 15000

function ensureGlbLocalPath(assetId) {
  const baseDir = wx.env?.USER_DATA_PATH || ''
  if (!baseDir) return ''
  const fileName = assetId ? `model-preview-${assetId}.glb` : `model-preview-${Date.now()}.glb`
  return `${baseDir}/${fileName}`
}

function readUint32LE(bytes, offset) {
  return bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
}

function decodeAscii(bytes, start, length) {
  let text = ''
  for (let idx = start; idx < start + length; idx += 1) {
    text += String.fromCharCode(bytes[idx])
  }
  return text
}

function decodeUtf8(bytes, start, length) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes.slice(start, start + length))
  }

  let text = ''
  for (let idx = start; idx < start + length; idx += 1) {
    text += String.fromCharCode(bytes[idx])
  }
  try {
    return decodeURIComponent(escape(text))
  } catch (_) {
    return text
  }
}

function inspectGlbCompatibility(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 20) {
    return { ok: false, reason: 'GLB 文件过小，无法解析。' }
  }

  const magic = decodeAscii(bytes, 0, 4)
  if (magic !== 'glTF') {
    return { ok: false, reason: '文件头不是有效的 GLB。' }
  }

  const jsonChunkLength = readUint32LE(bytes, 12)
  const jsonChunkType = decodeAscii(bytes, 16, 4)
  if (jsonChunkType !== 'JSON') {
    return { ok: false, reason: 'GLB 缺少 JSON chunk，无法识别。' }
  }

  try {
    const jsonText = decodeUtf8(bytes, 20, jsonChunkLength).replace(/\u0000+$/, '')
    const gltf = JSON.parse(jsonText)
    const extensionsRequired = gltf.extensionsRequired || []
    const images = gltf.images || []
    const hasWebpExtension = extensionsRequired.includes('EXT_texture_webp')
    const hasWebpImage = images.some((image) => image?.mimeType === 'image/webp')

    if (hasWebpExtension || hasWebpImage) {
      return {
        ok: false,
        reason: '这个 GLB 内嵌了 WebP 纹理，并声明了 EXT_texture_webp。小程序原生 model 组件通常不支持这种贴图扩展，所以会加载失败。',
        details: {
          extensionsRequired,
          imageMimeTypes: images.map((image) => image?.mimeType).filter(Boolean),
        },
      }
    }

    return { ok: true, details: { extensionsRequired } }
  } catch (_) {
    return { ok: false, reason: 'GLB 元数据解析失败，无法判断兼容性。' }
  }
}

Page({
  data: {
    glbUrl: '',
    sourceUrl: '',
    assetId: '',
    name: '模型预览',
    ready: false,
    hasError: false,
    loading: true,
    loadErrorText: '',
    isDevtools: false,
  },

  onLoad(options = {}) {
    const sourceUrl = decodeURIComponent(options.glbUrl || '')
    const name = decodeURIComponent(options.name || '模型预览')
    const assetId = options.assetId || ''
    const asset = (app.globalData.assets || []).find((item) => item.id === assetId)
    const cachedLocalPath = asset?.localGlbPath || ''
    const systemInfo = wx.getSystemInfoSync?.() || {}
    const isDevtools = systemInfo.platform === 'devtools'

    if (sourceUrl.startsWith('/Users/')) {
      this.setData({
        glbUrl: '',
        sourceUrl,
        assetId,
        name,
        ready: false,
        hasError: true,
        loading: false,
        isDevtools,
        loadErrorText: '这个路径是电脑本地路径，小程序运行环境访问不到。请使用网络 GLB 地址，或先通过小程序下载到临时文件后再预览。',
      })
      return
    }

    const shouldUseCachedFile = Boolean(cachedLocalPath) && !sourceUrl.startsWith('http')
    const shouldRenderCachedFile = Boolean(cachedLocalPath) && sourceUrl.startsWith('http')

    this.setData({
      glbUrl: shouldUseCachedFile || shouldRenderCachedFile ? cachedLocalPath : '',
      sourceUrl,
      assetId,
      name,
      ready: shouldUseCachedFile || shouldRenderCachedFile,
      hasError: !cachedLocalPath && !sourceUrl,
      loading: Boolean(cachedLocalPath) || Boolean(sourceUrl),
      loadErrorText: cachedLocalPath || sourceUrl ? '' : '当前没有拿到可用的 GLB 地址，无法在小程序内预览。',
      isDevtools,
    })

    if (name) {
      wx.setNavigationBarTitle({ title: name })
    }

    this._didRetryFromSource = false

    if (cachedLocalPath) {
      this.startLoadTimeout()
      return
    }

    if (!sourceUrl) return
    if (!sourceUrl.startsWith('http')) {
      this.setData({ glbUrl: sourceUrl, ready: true, loading: true })
      this.startLoadTimeout()
      return
    }

    this.prepareLocalPreviewFile(sourceUrl, assetId)
  },

  onUnload() {
    this.clearLoadTimeout()
  },

  startLoadTimeout() {
    this.clearLoadTimeout()
    this._loadTimeout = setTimeout(() => {
      const { isDevtools } = this.data
      this.handleModelError(
        isDevtools
          ? '预览超时：微信开发者工具里的 model 组件经常不触发加载回调，建议在真机上预览；模型文件仍可下载。'
          : '预览超时：模型文件已拿到，但原生预览组件在规定时间内未完成加载。你可以先下载 GLB 验证文件是否正常。',
      )
    }, MODEL_LOAD_TIMEOUT)
  },

  clearLoadTimeout() {
    if (this._loadTimeout) {
      clearTimeout(this._loadTimeout)
      this._loadTimeout = null
    }
  },

  prepareLocalPreviewFile(sourceUrl, assetId) {
    this.setData({ loading: true, hasError: false, loadErrorText: '' })

    wx.downloadFile({
      url: sourceUrl,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.tempFilePath) {
          this.handleModelError('模型文件下载失败，无法在小程序内预览。')
          return
        }

        const targetPath = ensureGlbLocalPath(assetId)
        if (!targetPath) {
          this.handleModelError('本地预览文件目录不可用，无法在小程序内预览。')
          return
        }

        const fs = wx.getFileSystemManager?.()
        if (!fs) {
          this.handleModelError('当前环境不支持文件系统接口，无法准备本地预览文件。')
          return
        }

        try {
          fs.unlinkSync(targetPath)
        } catch (_) {
          // ignore missing file
        }

        try {
          fs.copyFileSync(res.tempFilePath, targetPath)
        } catch (_) {
          this.handleModelError('本地预览文件准备失败，无法在小程序内预览。')
          return
        }

        try {
          const buffer = fs.readFileSync(targetPath)
          const compatibility = inspectGlbCompatibility(buffer)
          if (!compatibility.ok) {
            this.handleModelError(compatibility.reason)
            return
          }
        } catch (_) {
          this.handleModelError('本地预览文件检查失败，无法确认模型是否兼容小程序原生预览。')
          return
        }

        this.setData({
          glbUrl: targetPath,
          ready: true,
          loading: true,
          hasError: false,
          loadErrorText: '',
        })

        this.startLoadTimeout()

        app.updateAsset(assetId, { localGlbPath: targetPath })
      },
      fail: () => {
        this.handleModelError('模型文件下载失败，通常是该域名未加入小程序 downloadFile 合法域名。')
      },
    })
  },

  handleModelLoad() {
    this.clearLoadTimeout()
    this.setData({ loading: false, hasError: false, loadErrorText: '' })
  },

  handleModelError(customText) {
    const { glbUrl, sourceUrl, assetId } = this.data
    const isCachedLocalFile = Boolean(glbUrl) && !String(glbUrl).startsWith('http')

    if (!customText && isCachedLocalFile && sourceUrl && !this._didRetryFromSource) {
      this._didRetryFromSource = true
      this.prepareLocalPreviewFile(sourceUrl, assetId)
      return
    }

    this.clearLoadTimeout()

    this.setData({
      loading: false,
      hasError: true,
      loadErrorText: customText || '模型加载失败，通常是 GLB 文件格式不兼容，或该域名未加入小程序 downloadFile 合法域名。',
    })
  },

  downloadModel() {
    const { glbUrl, sourceUrl, name } = this.data
    const fileUrl = sourceUrl || glbUrl
    if (!fileUrl) return

    wx.showLoading({ title: '准备下载...' })
    wx.downloadFile({
      url: fileUrl,
      success(res) {
        wx.hideLoading()
        wx.saveFileToDisk?.({
          filePath: res.tempFilePath,
          fileName: `${name || 'model'}.glb`,
          success() { wx.showToast({ title: '已保存', icon: 'success' }) },
          fail() {
            wx.openDocument({ filePath: res.tempFilePath, showMenu: true })
          },
        }) ?? wx.openDocument({ filePath: res.tempFilePath, showMenu: true })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'error' })
      },
    })
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/assets/assets' })
  },
})