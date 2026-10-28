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
export const closeInquiry = inquiryId => data('/api/v1/trade/inquiry/' + id(inquiryId) + '/close', { method: 'PUT' })
// 询盘沟通会话：inquiryId 是查询参数，不是 body 字段。
export const openInquiryChat = inquiryId => data('/api/v1/trade/inquiry/chat/sessions?' + qs({ inquiryId }), { method: 'POST' })
export const createInquiryChatSession = inquiryId => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { sessionType: 'TRADE', businessType: 'INQUIRY', businessId: inquiryId, inquiryId } })

/* ---------------- 报价与议价 ---------------- */
// 报价 price 字段按元直传，后端不做单位换算（只有订单 amount 是分）。
export const latestQuote = inquiryId => data('/api/v1/trade/quote/latest?' + qs({ inquiryId }))
export const counterOffer = body => data('/api/v1/trade/quote/counter-offer', { method: 'POST', body })
export const acceptQuote = quoteId => data('/api/v1/trade/quote/' + id(quoteId) + '/accept', { method: 'PUT' })

/* ---------------- 订单（amount 单位为分） ---------------- */
export async function listOrders({ status, pageNum = 1, pageSize = 10 } = {}) {
  const result = await data('/api/v1/trade/order/list?' + qs({ role: 'buyer', status, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
// 买方付款：paying → delivering（无需 body）。
export const payOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay', { method: 'POST' })
// 买方确认收货：delivering → completed，写入作者收益。
export const completeOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/complete', { method: 'POST' })
// 取消订单：仅 confirmed 可取消，买卖双方任一方可发起；reason 选填，走 query 参数。
export const cancelOrder = (orderId, reason) => data('/api/v1/trade/order/' + id(orderId) + '/cancel' + (reason ? '?' + qs({ reason }) : ''), { method: 'POST' })

/* ---------------- 合同（amount 单位为元；签署前置实名认证由后端校验） ---------------- */
export const listContracts = params => data('/api/v1/trade/contracts/list?' + qs({ role: 'buyer', ...params }))
export const getContractByOrder = orderId => data('/api/v1/trade/contracts/' + id(orderId))
// 签署：multipart FormData（signatureImage / sealImage / placements），交由 request 侧识别不设 Content-Type。
export const signContract = (contractId, formData) => data('/api/v1/trade/contracts/' + id(contractId) + '/sign', { method: 'POST', body: formData })
// 平台模板目录（传 contractId 时按该合同生成贴合默认条款）。
export const listContractTemplates = async contractId => asList(await data('/api/v1/trade/contracts/templates' + (contractId ? '?' + qs({ contractId }) : '')))
// 正文条款编辑（进入签署即锁定）。
export const updateContractContent = (contractId, payload) => data('/api/v1/trade/contracts/' + id(contractId) + '/content', { method: 'PUT', body: payload })
// 上传 PDF 替换模板（multipart：file）与从上传件切回平台模板（body：{ templateId }）；均在进入签署后锁定。
export const uploadContractSourcePdf = (contractId, file) => {
  const form = new FormData()
  form.append('file', file, file.name || 'contract.pdf')
  return data('/api/v1/trade/contracts/' + id(contractId) + '/source-pdf', { method: 'POST', body: form })
}
export const switchContractToTemplate = (contractId, templateId) => data('/api/v1/trade/contracts/' + id(contractId) + '/source-pdf/off', { method: 'PUT', body: { templateId } })

/* ---------------- 交易会话定型文与印章（与 APP/创作者端同源） ---------------- */
export const listTradeTemplates = async () => asList(await data('/api/v1/users/me/chat/trade-templates'))
// 印章：签约时可选已审核通过的印章（与版权印章同端点）。
export const listMySeals = async () => asList(await data('/api/v1/content/copyright-seals'))

/* ---------------- 作品（内容市场） ---------------- */
export async function listWorks({ keyword, categoryId, sort, page = 1, pageSize = 12 } = {}) {
  const result = await data('/api/v1/content/works?' + qs({ keyword, categoryId, sort, page, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getWork = workId => data('/api/v1/content/works/' + id(workId))
export const listChapters = workId => data('/api/v1/content/works/' + id(workId) + '/chapters')
// 章节正文路径不嵌套在作品下；403 也会带 data（content 为空、readable=false）。
export const getChapter = chapterId => data('/api/v1/content/chapters/' + id(chapterId))

/* ---------------- 消息与沟通 ---------------- */
export async function listMessages({ pageNum = 1, pageSize = 50, type, includeAnnouncements } = {}) {
  // 企业端=买方门户：交易通知只取 BUYER/BOTH（及无受众的通用通知），卖方视角通知（如新询盘）不进此端。
  const result = await data('/api/v1/messages?' + qs({ pageNum, pageSize, type, includeAnnouncements, portalRole: 'BUYER' }))
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
export const listChatMessages = async sessionId => asList(await data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages'))
export const sendChatMessage = (sessionId, content) => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages', { method: 'POST', body: { msgType: 'TEXT', content } })
export const readChatSession = sessionId => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/read', { method: 'PUT' })
// 后端只接受 action=reopen。
export const reopenChatSession = sessionId => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/status?' + qs({ action: 'reopen' }), { method: 'PUT' })
export const chatUnreadCount = async () => Number((await data('/api/v1/users/me/chat/unread-count'))?.chatUnread || 0)
// 发起与平台管理员的沟通会话（GENERAL 平台沟通）；沟通页只列 ADMIN 会话，空列表时靠此按钮破局。
export const openPlatformChat = () => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { businessType: 'GENERAL', businessName: '平台沟通' } })

/* ---------------- 创作者门户 Cooperation.vue 复用别名（与用户端同名同义，企业端恒为买方） ---------------- */
// 交易会话列表：会话列表按 sessionType=TRADE 过滤，返回数组（沿用 listChatSessions）。
export const listTradeSessions = () => listChatSessions({ sessionType: 'TRADE' })
// 由询盘创建/获取交易会话，返回新建会话（含 sessionId）。
export const createTradeChat = inquiryId => createInquiryChatSession(inquiryId)
// 会话消息列表 / 发送文本 / 最新报价：与 Cooperation.vue 调用名对齐。
export const listChat = sessionId => listChatMessages(sessionId)
export const sendChat = (sessionId, content) => sendChatMessage(sessionId, content)
export const getLatestQuote = inquiryId => latestQuote(inquiryId)

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

export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })
