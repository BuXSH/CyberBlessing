
Page({
  data: {
    username: '',
    password: '',
    canSubmit: false,
  },

  /** 输入框内容变更处理 */
  onInput(e: any) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [field]: value
    })
    this.checkSubmit()
  },

  /** 检查是否可以提交 */
  checkSubmit() {
    const { username, password } = this.data
    this.setData({
      canSubmit: !!username && !!password
    })
  },

  /** 点击登录 */
  onLogin() {
    // 添加震动反馈
    wx.vibrateShort({ type: 'light' })

    if (!this.data.canSubmit) return

    const { username, password } = this.data

    wx.showLoading({ title: '连接中...' })
    
    wx.request({
      url: 'http://118.24.117.187:3000/api/users/login',
      method: 'POST',
      data: {
        account: username,
        password: password
      },
      success: (res: any) => {
        wx.hideLoading()
        if (res.statusCode === 200) {
          const { token, ...userInfo } = res.data
          // 保存登录状态
          const app = getApp<IAppOption>()
          // @ts-ignore
          app.globalData.token = token
          app.globalData.userInfo = userInfo
          
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1000)
        } else {
          const error = (res.data && res.data.error) || ''
          let msg = '登录失败'
          if (error === 'account_and_password_required') {
            msg = '请输入账号和密码'
          } else if (error === 'invalid_credentials') {
            msg = '账号或密码错误'
          }
          wx.showToast({
            title: msg,
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('登录请求失败', err)
        wx.showToast({
          title: '网络连接失败',
          icon: 'none'
        })
      }
    })
  },

  /** 点击注册（跳转到注册页） */
  onRegister() {
    wx.navigateTo({
      url: '/pages/register/index'
    })
  }
})