const { generateModel } = require('../../services/gradio')

const app = getApp()

function taskToPageData(task = {}) {
  const status = task.status || 'idle'
  return {
    loading: status === 'running',
    progressText: status === 'running' ? (task.progressText || '处理中...') : '',
    error: status === 'error' ? (task.error || '生成失败，请重试') : '',
    imageUri: task.imageUri || '',
    imageFile: task.imageUri || '',
  }
}

Page({
  data: {
    imageUri: '',
    imageFile: '',
    resolutionOptions: ['1024 均衡', '1536 高质量'],
    resolutionIdx: 1,
    seed: -1,
    loading: false,
    progressText: '',
    error: '',
  },

  onShow() {
    if (!this._unsubscribeTask) {
      this._unsubscribeTask = app.subscribeGenerationTask((task) => {
        const patch = taskToPageData(task)
        this.setData(patch)
      })
    }
  },

  onHide() {
    this._unsubscribeTask?.()
    this._unsubscribeTask = null
  },

  onUnload() {
    this._unsubscribeTask?.()
    this._unsubscribeTask = null
  },

  chooseImage() {
    if (this.data.loading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const item = res.tempFiles[0]
        this.setData({ imageUri: item.tempFilePath, imageFile: item.tempFilePath, error: '' })
        app.updateGenerationTask({
          status: 'idle',
          error: '',
          progressText: '',
          imageUri: item.tempFilePath,
          resultAssetId: '',
        })
      },
    })
  },

  clearImage(e) {
    e.stopPropagation?.()
    this.setData({ imageUri: '', imageFile: '' })
    app.resetGenerationTask()
  },

  previewSelectedImage() {
    if (!this.data.imageUri) return
    wx.previewImage({
      current: this.data.imageUri,
      urls: [this.data.imageUri],
    })
  },

  onResolutionChange(e) {
    this.setData({ resolutionIdx: Number(e.detail.value) })
  },

  onSeedInput(e) {
    this.setData({ seed: Number(e.detail.value) })
  },

  randomSeed() {
    this.setData({ seed: Math.floor(Math.random() * 999999) })
  },

  clearError() {
    this.setData({ error: '' })
    app.updateGenerationTask({ status: 'idle', error: '', progressText: '' })
  },

  async handleGenerate() {
    if (!this.data.imageFile || this.data.loading) return
    const taskId = String(Date.now())
    app.updateGenerationTask({
      id: taskId,
      status: 'running',
      progressText: '准备中...',
      error: '',
      imageUri: this.data.imageFile,
      resultAssetId: '',
    })

    const resolution = this.data.resolutionIdx === 0 ? 1024 : 1536

    try {
      const glbUrl = await generateModel(
        this.data.imageFile,
        { resolution, seed: this.data.seed },
        (text) => app.updateGenerationTask({ id: taskId, status: 'running', progressText: text || '处理中...' }),
      )

      // 保存到历史
      const asset = {
        id: String(Date.now()),
        name: '模型_' + new Date().toLocaleTimeString(),
        coverUrl: this.data.imageUri,
        glbUrl,
        createdAt: new Date().toLocaleString(),
      }
      app.addAsset(asset)
      app.updateGenerationTask({
        id: taskId,
        status: 'success',
        progressText: '',
        error: '',
        imageUri: this.data.imageFile,
        resultAssetId: asset.id,
      })

      wx.showToast({ title: '生成成功！', icon: 'success' })

      wx.navigateTo({
        url: `/pages/preview/preview?glbUrl=${encodeURIComponent(asset.glbUrl)}&name=${encodeURIComponent(asset.name)}&assetId=${asset.id}`,
        fail: () => {
          wx.switchTab({ url: '/pages/assets/assets' })
        },
      })
    } catch (err) {
      app.updateGenerationTask({
        id: taskId,
        status: 'error',
        progressText: '',
        error: err.message || '生成失败，请重试',
      })
    }
  },
})
