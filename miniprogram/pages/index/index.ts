/** 默认弹幕配置：1 条轨道、偏慢节奏，后续可由后端覆盖 */
const DEFAULT_DANMAKU_CONFIG = {
  laneCount: 1, // 初始轨道数量；正常情况下会在挂载后按容器高度重算
  laneHeight: 70, // 单条轨道的垂直高度，约等于一张卡片高度(52rpx,wxss统计,修改样式时需同步修改) + 间隙(自己设计)
  fireIntervalMin: 800, // 相邻两条弹幕之间的最短间隔，毫秒
  fireIntervalMax: 3000, // 相邻两条弹幕之间的最长间隔，毫秒
  durationMin: 10000, // 弹幕从右到左完整经过屏幕的最短时间，毫秒
  durationMax: 18000, // 弹幕从右到左完整经过屏幕的最长时间，毫秒
}

/** 服务器后端服务基础地址：指向 Python+MySQL 服务（首页使用） */
const INDEX_BACKEND_BASE_URL = 'http://118.24.117.187:3000'

Component({
  data: {
    blessings: [] as any[], // 显式声明为 any[]，避免空数组被推断为 never[]
    priorityQueue: [] as any[], // 优先插队队列，用于存放用户刚发的祈福
    danmakuConfig: DEFAULT_DANMAKU_CONFIG, // 初始弹幕配置
    bullets: [] as any[], // 正在屏幕上飞行的弹幕实例列表
    blessingTotal: 0, //后端统计的祝福总数量
    currentPage: 1, // 当前加载的页码
    pageSize: 50, // 每页加载的数据量
  },
  /* 生命周期：挂载时初始化数据和弹幕；卸载时停止弹幕，避免定时器泄漏 */
  lifetimes: {
    attached() {
      // 初始化弹幕控制变量
      const that = this as any
      that._nextBlessingIndex = 0 // 顺序轮播指针
      that._laneLastFireTimes = [] // 记录每条轨道最后一次发射的时间戳
      that._activeTimers = [] // 记录所有活跃的定时器ID，便于统一清除
      that._isFetching = false // 防止重复请求
      that._noMoreData = false // 标记是否已无更多数据，防止到底后反复请求

      this.fetchBlessingsFromServer(true) // 初始化加载第一页
      this.initDanmakuLanesAndStart()
    },
    detached() {
      this.stopDanmaku()
    },
  },
  /* 页面生命周期：当首页所在页面每次显示时，刷新祝福总数 */
  pageLifetimes: {
    show() {
      /* 每次页面重新可见时调用统计接口，保证头部总数是最新的 */
      ;(this as any).fetchBlessingTotalFromServer()

      const app = getApp<any>()
      // 检查全局变量中是否有用户刚发布的祈福
      if (app.globalData && app.globalData.newBlessing) {
        const newBlessing = app.globalData.newBlessing
        
        // 1. 将新祈福加入优先队列，确保下一条弹幕就是它
        const currentQueue = this.data.priorityQueue || []
        this.setData({
          priorityQueue: [...currentQueue, newBlessing]
        })

        // 2. 同时也将它加到普通列表里，保证后续还能循环播放到
        const currentBlessings = this.data.blessings || []
        this.setData({
          blessings: [newBlessing, ...currentBlessings]
        })

        // 3. 消费完后清空全局变量，防止重复添加
        app.globalData.newBlessing = null

        // 4. 如果弹幕暂停了，顺手启动一下，让用户立刻看到效果
        const that = this as any
        if (!that._danmakuRunning) {
          that.startDanmaku()
        }
      }
    },
  },
  methods: {
    /** 根据设备宽度计算 1rpx 对应的像素值,再计算单条轨道高度(px) 
     *  再根据容器高度px/单条轨道高度px=轨道数
     *  并启动弹幕 */
    initDanmakuLanesAndStart() {
      const that = this as any // that 保存当前组件实例引用，避免回调中 this 指向发生变化
      // 在当前组件作用域内创建节点查询实例，用于测量弹幕容器尺寸，单位是px
      const query = wx.createSelectorQuery().in(that) 
      query
        .select('.wall-scroll') // 选中弹幕容器节点，类名与 WXML 中保持一致
        .boundingClientRect((rect: any) => {
          // 若获取失败或高度为 0，则按默认配置启动弹幕
          if (!rect || !rect.height) {
            this.startDanmaku()
            return
          }

          // 当前弹幕配置对象，若 data 中不存在则回退到默认配置
          const config = this.data.danmakuConfig || DEFAULT_DANMAKU_CONFIG 
          // 获取当前设备窗口宽度（px），若获取失败则退回 375px 作为兜底
          const windowWidth = wx.getSystemInfoSync().windowWidth || 375 
          // 1rpx 对应的像素值：微信小程序规定 750rpx 等于窗口宽度
          const rpxUnit = windowWidth / 750 
          // 默认配置下单条轨道高度（像素）:config.laneHeight * 1rpx 对应的像素值
          const laneHeightBasePx = config.laneHeight * rpxUnit 
          if (!laneHeightBasePx) {
            // 换算失败时同样回退到默认弹幕启动逻辑
            this.startDanmaku()
            return
          }

          // 第一步：根据“容器高度 / 单条卡片高度”计算最多可容纳的轨道数量（向下取整保证不溢出）
          const maxLanesByHeight = Math.floor(rect.height / laneHeightBasePx) 
          // 至少保留 1 条轨道，防止高度极小时完全没有弹幕
          const safeLaneCount = Math.max(1, maxLanesByHeight) 

          // 第二步：在“轨道之间”平均分配多余高度，得到动态调整后的 laneHeight
          let dynamicLaneHeightRpx = config.laneHeight // 默认情况下使用配置中的轨道高度（rpx）
          if (safeLaneCount > 1) {
            const usedHeightPx = safeLaneCount * laneHeightBasePx // 假设轨道完全紧挨着时被占用的总高度
            const extraHeightPx = Math.max(0, rect.height - usedHeightPx) // 容器剩余高度，用于分配成轨道间隙
            const gapCount = safeLaneCount - 1 // 轨道之间的间隙数量：N 条轨道有 N-1 个间隙
            const gapPx = extraHeightPx / gapCount || 0 // 平均分配到每个间隙的像素高度
            const laneHeightDynamicPx = laneHeightBasePx + gapPx // 新的“轨道步长”：一条卡片高度 + 一份间隙高度
            dynamicLaneHeightRpx = laneHeightDynamicPx / rpxUnit // 将动态轨道高度从 px 换算回 rpx，便于后续统一使用
          }

          const nextConfig = {
            ...config, // 保留原有配置中的其他字段（如发射间隔、速度等）
            laneCount: safeLaneCount, // 使用根据高度计算出的安全轨道数量覆盖原本的 laneCount
            laneHeight: dynamicLaneHeightRpx, // 使用根据容器高度动态推导的轨道高度，保证纵向空间被合理分配
          }

          this.setData(
            {
              danmakuConfig: nextConfig, // 将新的弹幕配置写回 data，以便后续发射逻辑使用
            },
            () => {
              this.startDanmaku() // 在配置更新完成后的回调中启动弹幕播放，确保使用的是最新的轨道数量
            },
          )
        })
        .exec() // 执行查询队列，实际触发对 .wall-scroll 的尺寸测量
    },

    /** 
     * 拉取祈福列表从后端获取数据，更新blessings
     * @param reset 是否重置（为true时加载第一页并覆盖，为false时加载下一页并追加）
     */
    fetchBlessingsFromServer(reset = false) {
      const that = this as any
      // 防止重复请求：如果正在请求中，则直接返回
      // 或者是翻页加载时发现之前已经到底了，也直接返回，等到下一轮重置后再试
      if (that._isFetching) return
      if (that._noMoreData && !reset) return
      
      that._isFetching = true

      // 如果是重置操作，先清除“无数据”的标记，给它一次机会
      if (reset) {
        that._noMoreData = false
      }

      const page = reset ? 1 : (this.data.currentPage + 1)
      const pageSize = this.data.pageSize

      wx.request({
        url: `${INDEX_BACKEND_BASE_URL}/api/blessings`, 
        method: 'GET', 
        data: {
          page, 
          pageSize, 
          orderBy: 'time', 
        },
        success(res: any) {
          that._isFetching = false
          const data = res.data || {} 
          const items = data.items || [] 

          // 校验数据有效性
          if (!Array.isArray(items)) {
            console.log('fetchBlessingsFromServer: backend returned invalid list')
            return 
          }

          // 如果没有更多数据了
          if (items.length === 0) {
            if (!reset) {
              console.log('fetchBlessingsFromServer: no more data, stop fetching until next loop')
              // 标记为无更多数据，阻止后续的重复请求
              that._noMoreData = true
              
              // 同时也重置 currentPage 为 0，这样当 _noMoreData 被解除后（下一轮），
              // 下一次请求就会是 page 1
              that.setData({ currentPage: 0 })
            }
            return
          }

          // 更新数据
          // 如果是重置，直接覆盖；如果是翻页，则追加
          let newBlessings = reset ? items : (that.data.blessings || []).concat(items)
          
          // 内存保护：如果列表太长（比如超过200条），则裁剪掉前面已经播放过的
          // 注意：裁剪需要谨慎，不能把当前正在播放的裁掉（_nextBlessingIndex 指向的位置）
          // 简单起见，如果 reset=false 且列表过长，我们可以在这里做一些清理，
          // 但考虑到 _nextBlessingIndex 的逻辑，追加是最安全的。
          // 只有当 _nextBlessingIndex 归零时（一轮播放结束），我们才真正清理列表比较好。
          // 或者这里暂不清理，等用户反馈卡顿再优化。
          // 为了防止无限增长，限制最大长度为 500
          if (newBlessings.length > 500) {
             // 只有当播放指针比较靠后时才裁剪，避免裁剪掉未播放的
             if (that._nextBlessingIndex > 200) {
                newBlessings = newBlessings.slice(that._nextBlessingIndex)
                that._nextBlessingIndex = 0 // 重置指针
             }
          }

          that.setData({
            blessings: newBlessings,
            currentPage: page,
          })
        },
        fail(err: any) {
          that._isFetching = false
          console.error('fetchBlessingsFromServer: request failed', err) 
          wx.showToast({
            icon: 'none', 
            title: '加载祈福列表失败', 
          })
        },
      })
    },

    /** 从服务器后端获取当前祝福总数，用于展示在首页头部文案 */
    fetchBlessingTotalFromServer() {
      wx.request({
        url: `${INDEX_BACKEND_BASE_URL}/api/blessings/count`,
        method: 'GET',
        success: (res: any) => {
          /* 后端返回的响应体，预期结构为 { total: number } */
          const data = res.data || {}
          /* 只在 total 为非负数字时采纳，否则视为无效数据直接忽略 */
          const total =
            /* 既要保证字段类型为 number，又要求取值不小于 0 */
            typeof data.total === 'number' && data.total >= 0
              ? data.total
              : null

          if (total === null) {
            return
          }

          /* 将统计到的祝福总数写入 data，供 WXML 副标题展示使用 */
          this.setData({
            blessingTotal: total,
          })
        },
        fail: () => {
          /* 统计接口失败时静默处理，不弹出错误提示，保持默认展示 */
        },
      })
    },

    /** 点击单条祈福卡片，占位后续查看详情或跳转逻辑 */
    onTapBlessing(e: any) {
      const id = e.currentTarget.dataset.id
      const current = this.data.blessings.find((item: any) => item.id === id)
      if (!current) return
      wx.showToast({
        icon: 'none',
        title: '后续可以在这里查看详情',
      })
    },

    /** 点击“点赞”，先本地自增点赞数量并同步到后端 */
    onTapSendEnergy(e: any) {
      const id = e.currentTarget.dataset.id
      if (!id) {
        return
      }

      /** 本地乐观更新：立即在前端自增点赞数量，提升操作反馈速度 */
      const blessings = this.data.blessings.map((item: any) => {
        if (item.id === id) {
          return {
            ...item,
            likeCount: item.likeCount + 1,
          }
        }
        return item
      })
      const target = blessings.find((item: any) => item.id === id)
      let bullets = this.data.bullets || []
      if (target) {
        bullets = bullets.map((item: any) => {
          if (item.blessingId === id) {
            return {
              ...item,
              likeCount: target.likeCount,
            }
          }
          return item
        })
      }
      this.setData({
        blessings,
        bullets,
      })
      wx.showToast({
        icon: 'none',
        title: '已送出一份好运',
      })

      /** 将点赞结果同步到服务器后端，保证数据在服务端累计 */
      wx.request({
        url: `${INDEX_BACKEND_BASE_URL}/api/blessings/${id}/like`,
        method: 'POST',
        success: (res: any) => {
          const data = res.data || {}
          const likeCount = typeof data.likeCount === 'number' ? data.likeCount : null

          if (likeCount === null) {
            return
          }

          const nextBlessings = this.data.blessings.map((item: any) => {
            if (item.id === id) {
              return {
                ...item,
                likeCount,
              }
            }
            return item
          })

          let nextBullets = this.data.bullets || []
          nextBullets = nextBullets.map((item: any) => {
            if (item.blessingId === id) {
              return {
                ...item,
                likeCount,
              }
            }
            return item
          })

          this.setData({
            blessings: nextBlessings,
            bullets: nextBullets,
          })
        },
        fail: (err: any) => {
          console.error('onTapSendEnergy: sync like to backend failed', err)
          wx.showToast({
            icon: 'none',
            title: '网络有点忙，稍后再试',
          })
        },
      })
    },
    /** 点击“我要祈福”入口，跳转到发起祈福页 */
    onTapCreate() {
      wx.navigateTo({
        url: '/pages/create/index',
      })
    },
    
    /** 启动弹幕播放：按当前配置循环发射祈福卡片 */
    startDanmaku() {
      const that = this as any
      // 防止重复启动：如果已经在运行中，则直接返回
      if (that._danmakuRunning) {
        return
      }
      // 标记为运行状态
      that._danmakuRunning = true

      // 定义递归发射函数：发射一条弹幕 -> 等待随机间隔 -> 再次调用自己
      const fireOnce = () => {
        // 如果运行标志被取消（如调用了 stopDanmaku），则停止递归
        if (!that._danmakuRunning) {
          return
        }

        // 创建并发射一条弹幕
        this.createOneBullet()

        // 计算下一次发射的随机等待时间
        const config = this.data.danmakuConfig || DEFAULT_DANMAKU_CONFIG
        const min = config.fireIntervalMin
        const max = config.fireIntervalMax
        const delay = min + Math.random() * (max - min)

        // 设置定时器触发下一次发射
        that._danmakuTimer = setTimeout(fireOnce, delay)
      }

      // 立即执行第一次发射
      fireOnce()
    },

    /** 停止弹幕播放：清除定时器并重置运行标记 */
    stopDanmaku() {
      const that = this as any
      // 将运行标志置为 false，中断 fireOnce 中的递归调用
      that._danmakuRunning = false
      
      // 清除发射循环定时器
      if (that._danmakuTimer) {
        clearTimeout(that._danmakuTimer)
        that._danmakuTimer = null
      }

      // 清除所有已存在的“移除弹幕”定时器，防止页面卸载后回调报错
      if (that._activeTimers && that._activeTimers.length) {
        that._activeTimers.forEach((id: number) => clearTimeout(id))
        that._activeTimers = []
      }
    },

    /** 创建单条弹幕实例并加入屏幕队列 */
    createOneBullet() {
      const that = this as any
      // 1. 数据校验：若暂无祈福数据，则无法创建弹幕
      const blessings = this.data.blessings || []
      if (!blessings.length) {
        return
      }

      // 2. 读取配置参数：轨道数、高度、动画时长范围
      const config = this.data.danmakuConfig || DEFAULT_DANMAKU_CONFIG
      const laneCount = config.laneCount
      const laneHeight = config.laneHeight
      const durationMin = config.durationMin
      const durationMax = config.durationMax

      // 3. 顺序轮播内容：保证每个祈福都有均等的展示机会
      // 优先检查插队队列中是否有内容
      let blessing: any = null
      if (this.data.priorityQueue && this.data.priorityQueue.length > 0) {
        blessing = this.data.priorityQueue[0]
        // 发射后从优先队列移除
        this.setData({
          priorityQueue: this.data.priorityQueue.slice(1)
        })
      } else {
        // 正常轮播逻辑
        let index = that._nextBlessingIndex || 0
        
        // 检查是否快要播放完了（剩余不到5条时），提前加载下一页数据
        if (blessings.length - index < 5) {
          this.fetchBlessingsFromServer(false)
        }

        // 如果指针越界，说明当前列表已播放完（且新数据可能还没回来，或者已经是最后一页了）
        // 此时重置为 0，从头循环播放现有列表
        if (index >= blessings.length) {
          index = 0 
          // 新的一轮开始了，我们清除“无更多数据”的标记，
          // 这样当再次播放到末尾时，会允许再次尝试请求（看看有没有新数据）
          that._noMoreData = false
        }
        
        blessing = blessings[index]
        that._nextBlessingIndex = index + 1
      }

      // 4. 智能轨道选择：寻找空闲时间最长的轨道，防止视觉重叠
      if (!that._laneLastFireTimes || that._laneLastFireTimes.length !== laneCount) {
        that._laneLastFireTimes = new Array(laneCount).fill(0)
      }

      const now = Date.now()
      let candidates = [] as number[] // 候选轨道列表

      // 找出所有空闲时间超过2秒的轨道（2秒通常足够让上一条弹幕飞出一小段距离）
      // 如果所有轨道都很忙，则回退到寻找最空闲的那一条
      for (let i = 0; i < laneCount; i++) {
        const lastFire = that._laneLastFireTimes[i] || 0
        const idle = now - lastFire
        if (idle > 2000) {
           candidates.push(i)
        }
      }

      let laneIndex = 0
      
      if (candidates.length > 0) {
        // 如果有多个空闲轨道，从中随机选一个，增加视觉的随机感
        laneIndex = candidates[Math.floor(Math.random() * candidates.length)]
      } else {
        // 如果所有轨道都很忙，则强制选择最久未发射的那一条（兜底策略）
        let maxIdleTime = -1
        let bestLaneIndex = 0
        for (let i = 0; i < laneCount; i++) {
          const lastFire = that._laneLastFireTimes[i] || 0
          const idle = now - lastFire
          if (idle > maxIdleTime) {
            maxIdleTime = idle
            bestLaneIndex = i
          }
        }
        laneIndex = bestLaneIndex
      }
      
      // 更新选中轨道的发射时间
      that._laneLastFireTimes[laneIndex] = now

      // 随机生成飞行时长（决定飞行速度）
      const duration =
        durationMin + Math.random() * (durationMax - durationMin)
      // 生成唯一 ID，用于列表渲染 key
      const bulletId = `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      // 计算弹幕距离顶部的绝对距离 (top 值)决定了弹幕在哪一条轨道
      const top = laneIndex * laneHeight

      // 5. 构建弹幕实例对象
      const bullet = {
        bulletId,
        blessingId: blessing.id,
        type: blessing.type,
        content: blessing.content,
        userNick: blessing.userNick,
        isAnonymous: blessing.isAnonymous,
        timeText: blessing.timeText,
        likeCount: blessing.likeCount,
        laneIndex,
        top,
        duration,
      }

      // 6. 更新数据：将新弹幕追加到渲染列表
      const bullets = (this.data.bullets || []).concat(bullet)
      this.setData({
        bullets,
      })

      // 7. 自动清理机制（带安全管理的定时器）
      // 在动画时长结束后（额外缓冲 500ms），将该弹幕从列表中移除
      const timerId = setTimeout(() => {
        // 执行清理：从 data.bullets 中移除该弹幕
        // 注意：此处重新获取 this.data.bullets，确保操作的是最新数组
        const current = this.data.bullets || []
        const next = current.filter((item: any) => item.bulletId !== bulletId)
        
        // 如果组件已卸载或数据异常，则不执行 setData
        // 通过检查 _activeTimers 长度辅助判断组件是否活跃（stopDanmaku 会清空它）
        if (that._activeTimers && that._activeTimers.length > 0) {
           this.setData({
            bullets: next,
          })
          // 任务完成后，从活跃定时器列表中移除自己
          const idx = that._activeTimers.indexOf(timerId)
          if (idx > -1) {
            that._activeTimers.splice(idx, 1)
          }
        }
      }, duration + 500)

      // 将定时器 ID 存入活跃列表
      if (!that._activeTimers) that._activeTimers = []
      that._activeTimers.push(timerId)
    },
  },
})
