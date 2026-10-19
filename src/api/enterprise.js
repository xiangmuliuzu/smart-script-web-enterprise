import { request } from '../auth.js'
import { asList, qs } from '../utils/enterprise.js'

// 沿用若依 request：认证响应保持顶层结构，业务接口在这里读取 data。
const data = async (path, options) => (await request(path, options)).data
const id = value => encodeURIComponent(value)

/* ---------------- 询盘（我方是买方） ---------------- */
export async function listInquiries({ status, keyword, pageNum = 1, pageSize = 10 } = {}) {
  const result = await data('/api/v1/trade/inquiry/list?' + qs({ role: 'buyer', status, keyword, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getInquiry = inquiryId => data('/api/v1/trade/inquiry/' + id(inquiryId))
export const createInquiry = body => data('/api/v1/trade/inquiry', { method: 'POST', body })
export const closeInquiry = inquiryId => data('/api/v1/trade/inquiry/' + id(inquiryId) + '/close', { method: 'PUT' })
// 询盘沟通会话：inquiryId 是查询参数，不是 body 字段。
export const openInquiryChat = inquiryId => data('/api/v1/trade/inquiry/chat/sessions?' + qs({ inquiryId }), { method: 'POST' })
export const createInquiryChatSession = inquiryId => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { sessionType: 'TRADE', businessType: 'INQUIRY', businessId: inquiryId, inquiryId } })

/* ---------------- 报价与议价 ---------------- */
// 报价 price 字段按元直传，后端不做单位换算（只有订单 amount 是分）。
export async function listQuotes(inquiryId) {
  const result = await data('/api/v1/trade/quote/list?' + qs({ inquiryId }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const latestQuote = inquiryId => data('/api/v1/trade/quote/latest?' + qs({ inquiryId }))
export const counterOffer = body => data('/api/v1/trade/quote/counter-offer', { method: 'POST', body })
export const submitQuote = body => data('/api/v1/trade/quote', { method: 'POST', body })
export const acceptQuote = quoteId => data('/api/v1/trade/quote/' + id(quoteId) + '/accept', { method: 'PUT' })
export const rejectQuote = quoteId => data('/api/v1/trade/quote/' + id(quoteId) + '/reject', { method: 'PUT' })

/* ---------------- 订单（amount 单位为分） ---------------- */
export async function listOrders({ status, pageNum = 1, pageSize = 10 } = {}) {
  const result = await data('/api/v1/trade/order/list?' + qs({ role: 'buyer', status, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getOrder = orderId => data('/api/v1/trade/order/' + id(orderId))
export const cancelOrder = (orderId, reason) => data('/api/v1/trade/order/' + id(orderId) + '/cancel', { method: 'PUT', body: { reason } })
// 买方付款到托管：confirmed → escrow_pending（无需 body）。
export const payOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay', { method: 'POST' })
// 买方确认收货：delivering → completed，释放托管资金并写入作者收益。
export const completeOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/complete', { method: 'POST' })

/* ---------------- 作品（内容市场） ---------------- */
export async function listWorks({ keyword, categoryId, sort, page = 1, pageSize = 12 } = {}) {
  const result = await data('/api/v1/content/works?' + qs({ keyword, categoryId, sort, page, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getWork = workId => data('/api/v1/content/works/' + id(workId))
export const listCategories = async () => asList(await data('/api/v1/content/categories'))
export const listChapters = workId => data('/api/v1/content/works/' + id(workId) + '/chapters')
// 章节正文路径不嵌套在作品下；403 也会带 data（content 为空、readable=false）。
export const getChapter = chapterId => data('/api/v1/content/chapters/' + id(chapterId))

/* ---------------- 消息与沟通 ---------------- */
export async function listMessages({ pageNum = 1, pageSize = 50, type, includeAnnouncements } = {}) {
  const result = await data('/api/v1/messages?' + qs({ pageNum, pageSize, type, includeAnnouncements }))
  return { total: Number(result?.total || result?.length || 0), list: asList(result).map(item => ({ ...item, isRead: item.read, content: item.summary, createTime: item.createdAt })) }
}
export const getMessage = messageId => data('/api/v1/messages/' + id(messageId))
export const unreadCount = async () => Number((await data('/api/v1/messages/unread-count'))?.total || 0)
export const readMessage = messageId => data('/api/v1/messages/' + id(messageId) + '/read', { method: 'PUT' })
export const readAllMessages = () => data('/api/v1/messages/read-all', { method: 'PUT' })

export async function listChatSessions(params = {}) {
  const result = await data('/api/v1/users/me/chat/sessions?' + qs(params))
  return asList(result)
}
export const openChatSession = body => data('/api/v1/users/me/chat/sessions', { method: 'POST', body })
export const listChatMessages = async sessionId => asList(await data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages'))
export const sendChatMessage = (sessionId, content) => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages', { method: 'POST', body: { msgType: 'TEXT', content } })
export const readChatSession = sessionId => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/read', { method: 'PUT' })
// 后端只接受 action=reopen。
export const reopenChatSession = sessionId => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/status?' + qs({ action: 'reopen' }), { method: 'PUT' })
export const chatUnreadCount = async () => Number((await data('/api/v1/users/me/chat/unread-count'))?.chatUnread || 0)

/* ---------------- 账户资料与认证 ---------------- */
export const getProfile = () => data('/api/v1/users/me/profile')
export const saveProfile = form => data('/api/v1/users/me/profile', { method: 'PUT', body: { nickname: form.nickname, avatar: form.avatar, bio: form.bio } })
// 头像上传：App 域专用端点，响应 { url, path }，url 可直接写回资料 avatar 字段。
export const uploadAvatar = file => {
  const form = new FormData()
  form.append('file', file)
  return data('/api/v1/users/me/avatar', { method: 'POST', body: form })
}
export const getRealName = () => data('/api/v1/users/me/real-name')
// 证件材料上传：App 域端点，响应 { materialRef }，其值原样作为提交时的材料引用。
export const uploadRealNameMaterial = file => {
  const form = new FormData()
  form.append('file', file)
  return data('/api/v1/users/me/real-name/material', { method: 'POST', body: form })
}
// 驳回后重提走 /resubmit；两条路径共享同一状态机（PENDING/APPROVED 均返回 409）。
export const submitRealName = (form, resubmit = false) => data('/api/v1/users/me/real-name' + (resubmit ? '/resubmit' : ''), { method: 'POST', body: form })
/* ---------------- 账号安全 ---------------- */
// 与创作者端同端点：改密后需重新登录（无状态令牌不会自动失效）。
export const changePassword = form => data('/api/v1/auth/password/change', { method: 'POST', body: form })
// 换绑手机四步：old/send → old/verify（换取 stepUpToken）→ new/send → confirm。
export const phoneChange = (step, body) => data('/api/v1/users/me/phone/change/' + step, { method: 'POST', body })

export const listFeedback = async () => asList(await data('/api/v1/feedback'))
export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })
