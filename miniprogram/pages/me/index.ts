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
    /** 是否正在下拉刷新 */
    isRefreshing: false,

    /** 是否展开“我的祝福”（点赞过的）列表 */
    myLikedBlessingsExpanded: false,
    /** 我的祝福列表数据 */
    myLikedBlessings: [] as any[],
    /** 当前页码（我的祝福） */
    myLikedBlessingsPage: 1,
    /** 是否还有更多数据（我的祝福） */
    myLikedBlessingsHasMore: true,
    /** 是否正在加载中（我的祝福） */
    loadingMyLikedBlessings: false,
    /** 是否正在下拉刷新（我的祝福） */
    isRefreshingLiked: false,
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
      
      // 准备更新的数据对象
      const updates: any = {
        myBlessingsExpanded: expanded
      }
      
      // 如果是展开操作，则自动收起“我的祝福”
      if (expanded) {
        updates.myLikedBlessingsExpanded = false
      }
      
      this.setData(updates)

      // 如果展开且当前没有数据，则发起请求
      if (expanded && this.data.myBlessings.length === 0) {
        this.fetchMyBlessings(true)
      }
    },

    /** 获取我的祈福列表 */
    fetchMyBlessings(reset = false) {
      if (this.data.loadingMyBlessings) return
      
      // 如果不是重置（即加载下一页），且没有更多数据，则停止
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
          // 停止下拉刷新动画（如果正在下拉刷新）
          this.setData({ isRefreshing: false })
        }
      })
    },

    /** 下拉刷新 */
    onPullDownRefreshMyBlessings() {
      this.setData({ isRefreshing: true })
      this.fetchMyBlessings(true)
    },

    /** 滚动到底部加载更多 */
    onScrollToLowerMyBlessings() {
      this.fetchMyBlessings()
    },

    /** 点击“我的祝福”（点赞过的） */
    onTapMyLikedBlessings() {
      const app = getApp<IAppOption>()
      if (!app.globalData.userInfo) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        })
        return
      }

      const expanded = !this.data.myLikedBlessingsExpanded
      
      // 准备更新的数据对象
      const updates: any = {
        myLikedBlessingsExpanded: expanded
      }
      
      // 如果是展开操作，则自动收起“我的祈福”
      if (expanded) {
        updates.myBlessingsExpanded = false
      }

      this.setData(updates)

      // 如果展开且当前没有数据，则发起请求
      if (expanded && this.data.myLikedBlessings.length === 0) {
        this.fetchMyLikedBlessings(true)
      }
    },

    /** 获取我的祝福列表 */
    fetchMyLikedBlessings(reset = false) {
      if (this.data.loadingMyLikedBlessings) return
      
      // 如果不是重置（即加载下一页），且没有更多数据，则停止
      if (!reset && !this.data.myLikedBlessingsHasMore) return

      const app = getApp<IAppOption>()
      const token = app.globalData.token

      if (!token) return

      this.setData({ loadingMyLikedBlessings: true })
      
      const page = reset ? 1 : this.data.myLikedBlessingsPage
      const pageSize = 20

      wx.request({
        url: `${ME_BACKEND_BASE_URL}/api/blessings/my/liked`,
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
              myLikedBlessings: reset ? newItems : [...this.data.myLikedBlessings, ...newItems],
              myLikedBlessingsPage: page + 1,
              myLikedBlessingsHasMore: hasMore,
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
          this.setData({ loadingMyLikedBlessings: false })
          // 停止下拉刷新动画（如果正在下拉刷新）
          this.setData({ isRefreshingLiked: false })
        }
      })
    },

    /** 取消点赞 */
    onTapUnlike(e: any) {
      const id = e.currentTarget.dataset.id
      if (!id) return

      const app = getApp<IAppOption>()
      const token = app.globalData.token
      if (!token) return

      wx.showModal({
        title: '提示',
        content: '确定要取消点赞吗？',
        success: (res) => {
          if (res.confirm) {
             this.doUnlike(id, token)
          }
        }
      })
    },

    doUnlike(id: string, token: string) {
      wx.showLoading({ title: '处理中' })
      wx.request({
        url: `${ME_BACKEND_BASE_URL}/api/blessings/${id}/like`,
        method: 'DELETE',
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: (res: any) => {
            wx.hideLoading()
            if (res.statusCode === 200) {
                // Remove from list
                const newLikedList = this.data.myLikedBlessings.filter((item: any) => item.id !== id)
                this.setData({
                    myLikedBlessings: newLikedList
                })
                wx.showToast({ title: '已取消', icon: 'success' })
            } else {
                 if (res.statusCode === 404) {
                     wx.showToast({ title: '祝福不存在', icon: 'none' })
                 } else if (res.statusCode === 400) {
                     wx.showToast({ title: '尚未点赞', icon: 'none' })
                 } else {
                     wx.showToast({ title: '取消失败', icon: 'none' })
                 }
            }
        },
        fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '网络错误', icon: 'none' })
        }
      })
    },

    /** 下拉刷新（我的祝福） */
    onPullDownRefreshMyLikedBlessings() {
      this.setData({ isRefreshingLiked: true })
      this.fetchMyLikedBlessings(true)
    },

    /** 滚动到底部加载更多（我的祝福） */
    onScrollToLowerMyLikedBlessings() {
      this.fetchMyLikedBlessings()
    }
  },
})
