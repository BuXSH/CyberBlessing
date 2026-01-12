import { BLESSING_TYPE_MAPPING } from '../../utils/util'

/** 本地后端服务基础地址：指向 Python+MySQL 服务（祈福创建页使用） */
const CREATE_BACKEND_BASE_URL = 'http://118.24.117.187:3000'

Component({
  data: {
    /** 祈福类型选项列表，用于 Picker 组件展示 */
    typeOptions: ['心情', '学业', '事业', '生活', '家庭', '健康', '爱情', '友情', '节日'],
    /** 当前选中的类型索引，对应 typeOptions 数组下标 */
    typeIndex: 0,
    /** 用户输入的祈福内容文本 */
    content: '',
    /** 是否开启匿名发送模式 */
    isAnonymous: false,
    /** 是否允许提交（仅当内容非空时为 true，控制按钮禁用状态） */
    canSubmit: false,
  },
  methods: {
    /**
     * 监听祈福类型选择器的变更事件
     * @param e 事件对象，e.detail.value 包含选中的索引值
     */
    onTypeChange(e: any) {
      const index = e.detail.value
      this.setData({
        typeIndex: index,
      })
    },
    /**
     * 监听祈福内容输入框的输入事件
     * 实时更新 content 数据，并根据内容是否为空来控制 canSubmit 状态
     * @param e 事件对象，e.detail.value 为输入框当前内容
     */
    onContentInput(e: any) {
      const value = e.detail.value || ''
      this.setData({
        content: value,
        canSubmit: value.trim().length > 0,
      })
    },
    /**
     * 监听匿名开关的状态变更
     * @param e 事件对象，e.detail.value 为开关的布尔值状态
     */
    onAnonymousChange(e: any) {
      const checked = e.detail.value
      this.setData({
        isAnonymous: checked,
      })
    },

    /** 发布心愿内容到服务器后端，并在成功后返回祈福墙页面 */
    onSubmit() {
      // 添加震动反馈
      wx.vibrateShort({ type: 'light' })

      if (!this.data.canSubmit) {
        return
      }

      // 获取可选的祈福类型列表
      const typeOptions = this.data.typeOptions || [] 
      // 确保索引安全，防止 undefined
      const safeIndex = this.data.typeIndex || 0 
      // 从 typeOptions 中获取选中的中文标签，若索引超出范围则默认 '心情'
      const selectedLabel = typeOptions[safeIndex] || '心情' 
      // 从映射表中获取对应的英文类型值，若未找到则默认 'mood'
      const type = BLESSING_TYPE_MAPPING[selectedLabel] || 'mood' 
      // 获取内容并去除首尾空格
      const content = (this.data.content || '').trim() 

      if (!content) {
        wx.showToast({
          icon: 'none',
          title: '请先写下你的心愿',
        })
        return
      }

      // 获取用户信息
      const app = getApp<IAppOption>()
      const userInfo = app.globalData.userInfo

      // 请求体
      const payload: any = {
        content,
        type, // 映射后的英文类型
        isAnonymous: !!this.data.isAnonymous,
      }

      // 如果已登录，注入用户信息
      if (userInfo) {
        payload.userId = userInfo.id
        payload.userNick = userInfo.nick
      } else {
        // 未登录用户默认昵称，虽然后端有默认值，显式传更明确
        payload.userNick = '路人'
      }

      wx.showLoading({
        title: '发送中…',
        mask: true,
      })

      wx.request({
        url: `${CREATE_BACKEND_BASE_URL}/api/blessings`,
        method: 'POST',
        data: payload,
        success: (res) => {
          wx.hideLoading()
          
          // 根据后端规范，创建成功返回 201
          if (res.statusCode === 201) {
            // 将新发布的祈福保存到全局变量，以便返回首页后优先展示
            const app = getApp<any>()
            app.globalData.newBlessing = res.data

            wx.showToast({
              icon: 'success',
              title: '祈福已送出',
            })
            setTimeout(() => {
              wx.navigateBack()
            }, 600)
          } else {
            // 处理 400 或其他错误
            console.error('create blessing error', res)
            const data = res.data as any
            const msg = data && data.error ? data.error : '发送失败'
            wx.showToast({
              icon: 'none',
              title: msg,
            })
          }
        },
        fail: (err: any) => {
          wx.hideLoading()
          console.error('create blessing request failed', err)
          wx.showToast({
            icon: 'none',
            title: '网络请求失败',
          })
        },
      })
    },
  },
})
