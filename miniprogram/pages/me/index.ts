/** “我”页组件，后续用于展示用户相关数据与入口 */

/** 服务器后端服务基础地址，用于处理登录等业务请求（“我”页使用） */
const ME_BACKEND_BASE_URL = 'http://118.24.117.187:3000'

Component({
  data: {
    userInfo: null,
    /** 是否展开“我的祈福”列表 */
    myBlessingsExpanded: false,
    /** 我的祈福列表数据 */
    myBlessings: [] as any[],
    /** 当前页码 */
    myBlessingsPage: 1,
    /** 是否还有更多数据 */
    myBlessingsHasMore: true,
    /** 是否正在加载中 */
    loadingMyBlessings: false,
  },
  pageLifetimes: {
    show() {
      const app = getApp<IAppOption>()
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo
        })
      } else {
        this.setData({
          userInfo: null,
          myBlessingsExpanded: false,
          myBlessings: []
        })
      }
    }
  },
  methods: {
    onTapLogin() {
      wx.navigateTo({
        url: '/pages/login/index',
        fail: () => {
          wx.showToast({
             icon: 'none',
             title: '登录功能开发中',
          })
        }
      })
    },

    /** 点击“我的祈福” */
    onTapMyBlessings() {
      const app = getApp<IAppOption>()
      if (!app.globalData.userInfo) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        })
        return
      }

      const expanded = !this.data.myBlessingsExpanded
      this.setData({
        myBlessingsExpanded: expanded
      })

      // 如果展开且当前没有数据，则发起请求
      if (expanded && this.data.myBlessings.length === 0) {
        this.fetchMyBlessings(true)
      }
    },

    /** 获取我的祈福列表 */
    fetchMyBlessings(reset = false) {
      if (this.data.loadingMyBlessings) return
      if (!reset && !this.data.myBlessingsHasMore) return

      const app = getApp<IAppOption>()
      const token = app.globalData.token

      if (!token) return

      this.setData({ loadingMyBlessings: true })
      
      const page = reset ? 1 : this.data.myBlessingsPage
      const pageSize = 20

      wx.request({
        url: `${ME_BACKEND_BASE_URL}/api/blessings/my`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${token}`
        },
        data: {
          page,
          pageSize
        },
        success: (res: any) => {
          if (res.statusCode === 200) {
            const { items, hasMore } = res.data
            
            const newItems = items.map((item: any) => ({
              ...item,
              // 简单的格式化时间，实际项目中可能需要更复杂的处理
              createdAtFormatted: item.createdAt ? item.createdAt.replace('T', ' ').substring(0, 16) : ''
            }))

            this.setData({
              myBlessings: reset ? newItems : [...this.data.myBlessings, ...newItems],
              myBlessingsPage: page + 1,
              myBlessingsHasMore: hasMore,
            })
          } else {
            wx.showToast({
              title: '获取数据失败',
              icon: 'none'
            })
          }
        },
        fail: () => {
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
        },
        complete: () => {
          this.setData({ loadingMyBlessings: false })
        }
      })
    },

    /** 滚动到底部加载更多 */
    onScrollToLowerMyBlessings() {
      this.fetchMyBlessings()
    }
  },
})
