// 企业端展示口径：统一货币、日期、枚举标签，避免各页面各写一套。
export const asList = data => Array.isArray(data) ? data : data?.list || data?.rows || []

export const qs = params => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  }
  return search.toString()
}

// 交易域金额一律以「分」下发：报价 price、询盘 budget、订单 amount 都是分
// （后端在 controller 里把库中的元 ×100，见 AppTradeQuoteController.yuanToFen）。
export const money = fen => '¥' + (Number(fen || 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

export const licenseLabels = { exclusive: '独家授权', non_exclusive: '非独家授权', adaptation: '改编授权' }
export const licenseLabel = value => licenseLabels[value] || '授权方式待确认'

export const inquiryStatus = {
  pending: { label: '待回复', tone: 'gray' },
  quoted: { label: '沟通中', tone: '' },
  deal: { label: '已达成', tone: '' },
  rejected: { label: '已拒绝', tone: 'red' },
  closed: { label: '已关闭', tone: 'gray' },
  accepted: { label: '沟通中', tone: '' }
}
// 采购卡片底部的进度文案（原型：报价确认中 / 合同准备中）。
export const inquiryProgress = { pending: '等待作者回复', quoted: '报价确认中', deal: '合同准备中', accepted: '报价确认中', rejected: '已拒绝', closed: '已关闭' }
export const inquiryProgressText = value => inquiryProgress[value] || '采购推进中'
// 采购进度时间线：后端只有询盘与订单两类事实，用它们推出已完成的节点。
export const progressIndex = ({ hasOrder = false, orderDone = false, hasQuote = false } = {}) => orderDone ? 4 : hasOrder ? 3 : hasQuote ? 1 : 0
export const orderStatus = {
  confirmed: { label: '待签署', tone: 'gold' },
  paying: { label: '付款中', tone: 'gold' },
  delivering: { label: '交割中', tone: 'gold' },
  completed: { label: '已完成', tone: '' },
  escrow_pending: { label: '已托管', tone: 'gold' },
  cancelled: { label: '已取消', tone: 'gray' },
  refunded: { label: '已退款', tone: 'red' }
}
export const realNameStatus = {
  NOT_SUBMITTED: { label: '未实名认证', tone: 'gray', note: '尚未完成实名认证，完成后才能参与作品采购、合同签署和订单交付。' },
  PENDING: { label: '实名认证审核中', tone: 'gray', note: '认证材料已提交，平台正在审核。' },
  APPROVED: { label: '已实名认证', tone: '', note: '已完成实名认证，可参与作品采购、合同签署和订单交付。' },
  REJECTED: { label: '实名认证未通过', tone: 'red', note: '认证未通过，请按审核意见补充材料后重新提交。' }
}
export const state = (map, value, fallback = '状态待确认') => map[value] || { label: fallback, tone: 'gray' }

// 手机号注册的账号昵称就是掩码手机号，直接取首字会得到数字，此时回落到品牌字。
export const avatarText = value => {
  const text = String(value || '').trim()
  if (!text || /^[\d*]+$/.test(text)) return '剧'
  return text.slice(0, 1)
}

// 平台头像按当前 API 地址加载，兼容历史开发机地址与本地预览图片（与创作者端同一口径）。
export function avatarUrl(raw, apiBase = import.meta.env?.VITE_APP_BASE_API || '/dev-api') {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,/i.test(value)) return value
  let resource = value
  if (/^https?:\/\//i.test(value)) {
    try { resource = new URL(value).pathname } catch { return '' }
  } else if (!value.startsWith('/') || value.startsWith('//')) {
    return ''
  }
  const start = resource.search(/\/profile\/(?:upload|avatar|contract)\//)
  if (start < 0) return value
  resource = resource.slice(start)
  if (resource.includes('\\') || resource.split('/').some(part => part === '.' || part === '..')) return ''
  const root = apiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  return root + resource
}

/**
 * 内容域静态资源归一（已签 PDF / 印章图等 /profile 相对路径），补当前 API 前缀走代理，
 * 逐段 encode 避免中文文件名浏览器直链 404（与创作者端同一口径）。
 */
export function mediaUrl(raw, apiBase = import.meta.env?.VITE_APP_BASE_API || '/dev-api') {
  if (raw == null || raw === '') return ''
  let url = String(raw).trim()
  if (!url) return ''
  if (/^data:|^blob:/i.test(url)) return url
  const mediaIndex = url.indexOf('/profile/')
  if (mediaIndex >= 0) url = url.slice(mediaIndex)
  const root = String(apiBase || '').replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  if (url.startsWith('/dev-api/') || url.startsWith('/prod-api/')) {
    const idx = url.indexOf('/profile/')
    if (idx >= 0) return url.slice(0, idx) + encodeMediaPath(url.slice(idx))
    return url
  }
  if (root && (url === root || url.startsWith(root + '/'))) return url
  if (url.startsWith('/') && !url.startsWith('//')) return (root || '') + encodeMediaPath(url)
  return url
}

/** 对路径每一段 decode 后再 encode，避免中文未编码或二次编码。 */
export function encodeMediaPath(path) {
  return String(path || '').split('/').map(seg => {
    if (!seg) return ''
    try { return encodeURIComponent(decodeURIComponent(seg)) }
    catch { return encodeURIComponent(seg) }
  }).join('/')
}

/**
 * 合同正文（HTML）内的静态资源改写：签名/印章图与签约 PDF 存的是 /profile 相对路径，
 * iframe srcdoc 以父页面为基址，不补 API 前缀必定 404；逐个 URL 属性走 avatarUrl 归一。
 */
export function contractHtml(html) {
  const value = typeof html === 'string' ? html : ''
  if (!value) return ''
  return value.replace(/(src|href|xlink:href)(\s*=\s*)(["'])([^"']+)\3/gi, (whole, attr, eq, quote, raw) => {
    if (!raw.includes('/profile/')) return whole
    const fixed = avatarUrl(raw)
    return fixed ? `${attr}${eq}${quote}${fixed}${quote}` : whole
  })
}

// 合同 amount 接口按「元」直返（区别于订单/报价/询盘的「分」），展示不除 100。
export const contractMoney = value => '¥' + Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

// 头像上传前的本地校验，规则与创作者端一致（png/jpg，5 MB）。
export function validateImage(file) {
  if (!file || !['png', 'jpg', 'jpeg'].includes(file.name.split('.').pop().toLowerCase())) return '请选择 .png / .jpg 图片'
  if (!file.size) return '文件为空，请重新选择'
  if (file.size > 5 * 1024 * 1024) return '图片不能超过 5 MB'
  return ''
}

export function dateText(value) {
  if (!value) return '—'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.replace('T', ' ').slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export const dayText = value => {
  const text = dateText(value)
  return text.length > 10 ? text.slice(0, 10) : text
}

// 原型用「今天 10:16 / 昨天 16:42 / 10-10」的相对口径，这里按同一口径换算真实时间。
export function relativeText(value) {
  if (!value) return '—'
  const text = dateText(value)
  const time = text.length > 10 ? text.slice(11, 16) : ''
  const today = dayText(new Date().toISOString())
  const day = text.slice(0, 10)
  if (day === today) return time ? '今天 ' + time : '今天'
  const yesterday = dayText(new Date(Date.now() - 86400000).toISOString())
  if (day === yesterday) return time ? '昨天 ' + time : '昨天'
  return day.slice(5)
}

// 作品题材：AppWorkDto 只提供 genreName，缺失时按未分类处理。
export const genreText = work => work?.genreName || '题材待确认'
export const episodeText = work => Number(work?.episodeCount || 0) > 0 ? Number(work.episodeCount) + ' 集' : '集数待确认'

// 未开放服务统一口径：后端尚无该域的用户接口，不伪造成功状态。
export const NOT_OPEN = '服务尚未开放'
export const NOT_OPEN_NOTE = '该服务尚未对用户开放，可在「消息 → 联系平台运营」咨询进度。'
