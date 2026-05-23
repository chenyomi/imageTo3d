const WEB_PREVIEW_BASE_URL = 'https://chenyomi.github.io/imageTo3d/'

Page({
  data: {
    name: '模型预览',
    viewerUrl: '',
  },

  onLoad(options = {}) {
    const sourceUrl = decodeURIComponent(options.glbUrl || '')
    const name = decodeURIComponent(options.name || '模型预览')

    if (name) {
      wx.setNavigationBarTitle({ title: name })
    }

    if (!sourceUrl) {
      wx.showToast({ title: '缺少模型地址', icon: 'error' })
      this.goBack()
      return
    }

    const viewerUrl = `${WEB_PREVIEW_BASE_URL}?mode=embed-preview&glbUrl=${encodeURIComponent(sourceUrl)}&name=${encodeURIComponent(name)}`
    this.setData({ name, viewerUrl })
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/assets/assets' })
  },
})