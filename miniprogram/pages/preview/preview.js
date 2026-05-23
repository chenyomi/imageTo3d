const app = getApp()
const MODEL_LOAD_TIMEOUT = 15000
const XR_ASSET_ID = 'preview-model'

function ensureGlbLocalPath(assetId) {
  const baseDir = wx.env?.USER_DATA_PATH || ''
  if (!baseDir) return ''
  const fileName = assetId ? `model-preview-${assetId}.glb` : `model-preview-${Date.now()}.glb`
  return `${baseDir}/${fileName}`
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
    sceneReady: false,
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
        loadErrorText: '这个路径是电脑本地路径，小程序运行环境访问不到。请使用网络 GLB 地址，或先通过小程序下载到本地后再预览。',
      })
      return
    }

    this.setData({
      glbUrl: cachedLocalPath || '',
      sourceUrl,
      assetId,
      name,
      ready: Boolean(cachedLocalPath),
      hasError: !cachedLocalPath && !sourceUrl,
      loading: Boolean(cachedLocalPath) || Boolean(sourceUrl),
      loadErrorText: cachedLocalPath || sourceUrl ? '' : '当前没有拿到可用的 GLB 地址，无法在小程序内预览。',
      isDevtools,
    })

    if (name) {
      wx.setNavigationBarTitle({ title: name })
    }

    this._activeAssetUrl = ''
    this.scene = null

    if (cachedLocalPath) {
      this.tryLoadXrAsset(cachedLocalPath)
      return
    }

    if (!sourceUrl) return
    if (!sourceUrl.startsWith('http')) {
      this.setData({ glbUrl: sourceUrl, ready: true, loading: true })
      this.tryLoadXrAsset(sourceUrl)
      return
    }

    this.prepareLocalPreviewFile(sourceUrl, assetId)
  },

  onUnload() {
    this.clearLoadTimeout()
    this.scene = null
    this._activeAssetUrl = ''
  },

  handleSceneReady(event) {
    this.scene = event.detail?.value || null
    this.setData({ sceneReady: Boolean(this.scene) })
    if (this.data.glbUrl) {
      this.tryLoadXrAsset(this.data.glbUrl)
    }
  },

  startLoadTimeout() {
    this.clearLoadTimeout()
    this._loadTimeout = setTimeout(() => {
      const { isDevtools } = this.data
      this.handleModelError(
        isDevtools
          ? '预览超时：微信开发者工具里的 xr-frame 渲染可能比真机更不稳定，建议在真机上再次验证。'
          : '预览超时：xr-frame 没有在规定时间内完成模型加载。你可以先下载 GLB 验证文件是否正常。',
      )
    }, MODEL_LOAD_TIMEOUT)
  },

  clearLoadTimeout() {
    if (this._loadTimeout) {
      clearTimeout(this._loadTimeout)
      this._loadTimeout = null
    }
  },

  tryLoadXrAsset(glbUrl) {
    if (!glbUrl) return
    if (!this.scene?.assets?.loadAsset) return
    if (this._activeAssetUrl === glbUrl) return

    this._activeAssetUrl = glbUrl
    this.setData({ ready: true, loading: true, hasError: false, loadErrorText: '' })
    this.startLoadTimeout()

    this.scene.assets.loadAsset({
      type: 'gltf',
      assetId: XR_ASSET_ID,
      src: glbUrl,
      options: {},
    }).then(() => {
      this.clearLoadTimeout()
      this.setData({ loading: false, hasError: false, loadErrorText: '' })
    }).catch((err) => {
      this._activeAssetUrl = ''
      this.handleModelError(`xr-frame 模型加载失败：${err?.message || err?.errMsg || 'unknown error'}`)
    })
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

        this.setData({
          glbUrl: targetPath,
          ready: true,
          loading: true,
          hasError: false,
          loadErrorText: '',
        })

        app.updateAsset(assetId, { localGlbPath: targetPath })
        this.tryLoadXrAsset(targetPath)
      },
      fail: () => {
        this.handleModelError('模型文件下载失败，通常是该域名未加入小程序 downloadFile 合法域名。')
      },
    })
  },

  handleModelError(customText) {
    this.clearLoadTimeout()
    this._activeAssetUrl = ''

    this.setData({
      loading: false,
      hasError: true,
      loadErrorText: customText || '模型加载失败，通常是 GLB 文件损坏、纹理扩展不兼容，或该域名未加入小程序 downloadFile 合法域名。',
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