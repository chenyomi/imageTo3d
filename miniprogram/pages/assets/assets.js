const app = getApp()

Page({
  data: { assets: [] },

  onShow() {
    this.setData({ assets: app.globalData.assets || [] })
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
