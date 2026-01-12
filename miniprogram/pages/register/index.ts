
/** 注册页后端服务基础地址 */
const REGISTER_BACKEND_BASE_URL = 'http://118.24.117.187:3000'

Page({
  data: {
    username: '',
    nick: '',
    password: '',
    confirmPassword: '',
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
    const { username, nick, password, confirmPassword } = this.data
    // 简单校验：非空且两次密码一致
    const isValid = !!username && !!nick && !!password && !!confirmPassword && (password === confirmPassword)
    this.setData({
      canSubmit: isValid
    })
  },

  /** 点击注册 */
  onRegister() {
    if (!this.data.canSubmit) return

    const { username, nick, password, confirmPassword } = this.data
    if (password !== confirmPassword) {
      wx.showToast({
        title: '两次密码不一致',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '注册中...' })
    
    wx.request({
      url: `${REGISTER_BACKEND_BASE_URL}/api/users/register`,
      method: 'POST',
      data: {
        account: username,
        password: password,
        nick: nick
      },
      success: (res: any) => {
        wx.hideLoading()
        if (res.statusCode === 201) {
          wx.showToast({
            title: '注册成功',
            icon: 'success'
          })
          setTimeout(() => {
            // 注册成功后返回登录页
            wx.navigateBack()
          }, 1500)
        } else {
          // 处理错误响应
          const error = (res.data && res.data.error) || ''
          let msg = '注册失败'
          if (error === 'account_exists') {
            msg = '账号已存在'
          } else if (error === 'account_and_password_required') {
             msg = '信息不完整'
          }
          wx.showToast({
            title: msg,
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('注册请求失败', err)
        wx.showToast({
          title: '网络连接失败',
          icon: 'none'
        })
      }
    })
  },

  /** 返回登录页 */
  onBackToLogin() {
    wx.navigateBack()
  }
})