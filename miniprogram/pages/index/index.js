const { generateModel } = require('../../services/gradio')

const app = getApp()

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

  chooseImage() {
    if (this.data.loading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const item = res.tempFiles[0]
        this.setData({ imageUri: item.tempFilePath, imageFile: item.tempFilePath, error: '' })
      },
    })
  },

  clearImage(e) {
    e.stopPropagation?.()
    this.setData({ imageUri: '', imageFile: '' })
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
  },

  async handleGenerate() {
    if (!this.data.imageFile || this.data.loading) return
    this.setData({ loading: true, error: '', progressText: '准备中...' })

    const resolution = this.data.resolutionIdx === 0 ? 1024 : 1536

    try {
      const glbUrl = await generateModel(
        this.data.imageFile,
        { resolution, seed: this.data.seed },
        (text) => this.setData({ progressText: text }),
      )

      // 保存到历史
      const asset = {
        id: String(Date.now()),
        name: '模型_' + new Date().toLocaleTimeString(),
        glbUrl,
        createdAt: new Date().toLocaleString(),
      }
      const assets = [asset, ...(app.globalData.assets || [])]
      app.globalData.assets = assets

      wx.showToast({ title: '生成成功！', icon: 'success' })

      // 跳转到历史页
      wx.switchTab({ url: '/pages/assets/assets' })
    } catch (err) {
      this.setData({ error: err.message || '生成失败，请重试' })
    } finally {
      this.setData({ loading: false, progressText: '' })
    }
  },
})
