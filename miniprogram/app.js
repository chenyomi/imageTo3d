const ASSETS_STORAGE_KEY = 'imageTo3d_assets'

App({
  globalData: {
    serverUrl: '',
    assets: [],
    generationTask: {
      id: '',
      status: 'idle',
      progressText: '',
      error: '',
      imageUri: '',
      resultAssetId: '',
    },
  },

  _generationListeners: [],

  onLaunch() {
    this.loadAssets()
  },

  loadAssets() {
    try {
      const assets = wx.getStorageSync(ASSETS_STORAGE_KEY)
      this.globalData.assets = Array.isArray(assets) ? assets : []
    } catch (_) {
      this.globalData.assets = []
    }
  },

  persistAssets() {
    try {
      wx.setStorageSync(ASSETS_STORAGE_KEY, this.globalData.assets || [])
    } catch (_) {
      // ignore storage failure and keep in-memory state available
    }
  },

  addAsset(asset) {
    if (!asset) return
    const assets = [asset, ...(this.globalData.assets || [])]
    this.globalData.assets = assets
    this.persistAssets()
  },

  removeAsset(assetId) {
    if (!assetId) return
    const removedAsset = (this.globalData.assets || []).find((asset) => asset.id === assetId)
    if (removedAsset?.localGlbPath) {
      try {
        wx.getFileSystemManager?.().unlinkSync(removedAsset.localGlbPath)
      } catch (_) {
        // ignore local cache cleanup failure
      }
    }
    this.globalData.assets = (this.globalData.assets || []).filter((asset) => asset.id !== assetId)
    this.persistAssets()
  },

  updateGenerationTask(patch = {}) {
    const prev = this.globalData.generationTask || {}
    this.globalData.generationTask = { ...prev, ...patch }
    this.notifyGenerationTask()
  },

  resetGenerationTask() {
    this.globalData.generationTask = {
      id: '',
      status: 'idle',
      progressText: '',
      error: '',
      imageUri: '',
      resultAssetId: '',
    }
    this.notifyGenerationTask()
  },

  notifyGenerationTask() {
    const task = this.globalData.generationTask
    this._generationListeners.forEach((listener) => {
      try { listener(task) } catch (_) { /* ignore listener errors */ }
    })
  },

  subscribeGenerationTask(listener) {
    if (typeof listener !== 'function') return () => {}
    this._generationListeners.push(listener)
    listener(this.globalData.generationTask)
    return () => {
      this._generationListeners = this._generationListeners.filter((fn) => fn !== listener)
    }
  },

  updateAsset(assetId, patch = {}) {
    if (!assetId) return
    const assets = this.globalData.assets || []
    this.globalData.assets = assets.map((asset) => (
      asset.id === assetId ? { ...asset, ...patch } : asset
    ))
    this.persistAssets()
  },
})
