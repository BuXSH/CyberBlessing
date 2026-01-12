export const formatTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':')
  )
}

const formatNumber = (n: number) => {
  const s = n.toString()
  return s[1] ? s : '0' + s
}

/** 祈福类型中英映射表（Key: 中文展示名, Value: 后端英文标识） */
export const BLESSING_TYPE_MAPPING: Record<string, string> = {
  '心情': 'mood',
  '学业': 'study',
  '事业': 'career',
  '生活': 'life',
  '家庭': 'family',
  '健康': 'health',
  '爱情': 'love',
  '友情': 'friendship',
  '节日': 'festival',
}

/** 祈福类型反向映射表（Key: 后端英文标识, Value: 中文展示名） */
export const BLESSING_TYPE_REVERSE_MAPPING: Record<string, string> = Object.entries(BLESSING_TYPE_MAPPING).reduce((acc, [key, value]) => {
  acc[value] = key
  return acc
}, {} as Record<string, string>)
