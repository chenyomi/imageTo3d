const app = getApp()

Page({
  data: {
    assets: [],
    generationTask: null,
  },

  onShow() {
    this.setData({
      assets: app.globalData.assets || [],
      generationTask: app.globalData.generationTask || null,
    })

    if (!this._unsubscribeTask) {
      this._unsubscribeTask = app.subscribeGenerationTask((task) => {
        this.setData({ generationTask: task })
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

  previewGlb(e) {
    const { url, name, id } = e.currentTarget.dataset
    if (!url) {
      wx.showToast({ title: '暂无预览地址', icon: 'error' })
      return
    }

    wx.navigateTo({
      url: `/pages/preview/preview?glbUrl=${encodeURIComponent(url)}&name=${encodeURIComponent(name || '')}&assetId=${id || ''}`,
    })
  },

  deleteAsset(e) {
    const { id, name } = e.currentTarget.dataset
    if (!id) return

    wx.showModal({
      title: '删除历史记录',
      content: `确定删除 ${name || '这个模型'} 吗？删除后不会影响已经下载到本地的文件。`,
      confirmColor: '#ff6b81',
      success: (res) => {
        if (!res.confirm) return
        app.removeAsset(id)
        this.setData({ assets: app.globalData.assets || [] })
        wx.showToast({ title: '已删除', icon: 'success' })
      },
    })
  },

  downloadGlb(e) {
    const { url, name } = e.currentTarget.dataset
    wx.showLoading({ title: '准备下载...' })
    wx.downloadFile({
      url,
      success(res) {
        wx.hideLoading()
        wx.saveFileToDisk?.({
          filePath: res.tempFilePath,
          success() { wx.showToast({ title: '已保存', icon: 'success' }) },
          fail() {
            // 回退：打开文件预览
            wx.openDocument({ filePath: res.tempFilePath, showMenu: true })
          },
        }) ?? wx.openDocument({ filePath: res.tempFilePath, showMenu: true })
      },
      fail() {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'error' })
      },
    })
  },
})
