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
// 发起支付宝沙箱付款，并由服务端核验支付结果。
export const payOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay', { method: 'POST' })
export const confirmSandboxPayment = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay/confirm', { method: 'POST' })
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

/* ---------------- 买方版权（确认收货后的交割 cert；只读预览/下载） ---------------- */
export async function listBuyerCopyrights({ keyword, pageNum = 1, pageSize = 10 } = {}) {
  const result = await data('/api/v1/trade/copyright/list?' + qs({ keyword, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getBuyerCopyright = fileId => data('/api/v1/trade/copyright/' + id(fileId))

/* ---------------- 交易会话定型文与印章（与 APP/创作者端同源） ---------------- */
export const listTradeTemplates = async () => asList(await data('/api/v1/users/me/chat/trade-templates'))
// 印章：与 App / 创作者端共用 /api/v1/content/copyright-seals；签约时筛审核通过且启用中的印章。
const sealPath = sealId => '/api/v1/content/copyright-seals/' + id(sealId)
export const listMySeals = async () => asList(await data('/api/v1/content/copyright-seals'))
export const listSeals = listMySeals
export const getSeal = sealId => data(sealPath(sealId))
export const createSeal = form => data('/api/v1/content/copyright-seals', {
  method: 'POST',
  body: { sealName: form.sealName, sealImageUrl: form.sealImageUrl, materialUrls: form.materialUrls || '' }
})
export const updateSeal = (sealId, form) => data(sealPath(sealId), { method: 'PUT', body: form })
export const disableSeal = sealId => data(sealPath(sealId) + '/disable', { method: 'PUT' })
export const deleteSeal = sealId => data(sealPath(sealId), { method: 'DELETE' })
// 印章图 / 审核材料：走 content/upload，type=material（与 App 一致）。
export const upload = (file, purpose = 'seal') => {
  const body = new FormData()
  body.append('file', file)
  if (purpose === 'seal') body.append('type', 'material')
  return data('/api/v1/content/upload', { method: 'POST', body })
}

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
// 驳回后重提走 /resubmit；两条路径共享同一状态机（PENDING/APPROVED 均返回 409）。
export const submitRealName = (form, resubmit = false) => data('/api/v1/users/me/real-name' + (resubmit ? '/resubmit' : ''), { method: 'POST', body: form })
/* ---------------- 账号安全 ---------------- */
// 与创作者端同端点：改密后需重新登录（无状态令牌不会自动失效）。
export const changePassword = form => data('/api/v1/auth/password/change', { method: 'POST', body: form })
// 换绑手机四步：old/send → old/verify（换取 stepUpToken）→ new/send → confirm。
export const phoneChange = (step, body) => data('/api/v1/users/me/phone/change/' + step, { method: 'POST', body })

export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })

/* ---------------- 任务广场（需求悬赏）：企业端=发布者侧，可发布/托管/验收/延期决策，不可接单 ---------------- */
// 金额口径（后端 AppTradeDemandController 实测）：
//   入参 budget / budgetMin / budgetMax = 分；stages[].amount = 元（parseStages 不做换算）；
//   出参 budget / escrowAmount / depositAmount / stages[].amount / pay 返回 amount = 分。
const demandBase = '/api/v1/trade/demand'
const demandPath = demandId => demandBase + '/' + id(demandId)
const stagePath = (demandId, stageId) => `${demandPath(demandId)}/stage/${id(stageId)}`
// mine=published 查我方发布的全部任务（含进行中/完成，此分支才接受 status 过滤）；
// 不传 mine 则为公开广场，后端强制 status=open ∧ escrow_status=escrowed 并忽略传入 status。
export async function listDemands({ status, genreId, keyword, mine, sortBy, order, budgetMin, budgetMax, episodesMin, pageNum = 1, pageSize = 20 } = {}) {
  const result = await data(demandBase + '/list?' + qs({ status, genreId, keyword, mine, sortBy, order, budgetMin, budgetMax, episodesMin, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
// 广场统计：availableCount / prizePoolFen(分) / todayNewCount / genreCounts:[{genreId,count}]，公开可接单口径
export const demandStats = () => data(demandBase + '/stats')
export const getDemand = demandId => data(demandPath(demandId))
export const createDemand = form => data(demandBase, { method: 'POST', body: form })
// 编辑：仅发布者本人、且未托管未接单时后端才放行，否则 400 带原因
export const updateDemand = (demandId, form) => data(demandPath(demandId), { method: 'PUT', body: form })
export const closeDemand = demandId => data(demandPath(demandId) + '/close', { method: 'PUT' })
// 支付宝沙箱入账：发布者托管付款（需服务端查单确认）。接单侧押金付款不在本端提供。
export const payEscrow = demandId => data(demandPath(demandId) + '/pay/escrow', { method: 'POST' })
export const confirmEscrow = demandId => data(demandPath(demandId) + '/pay/escrow/confirm', { method: 'POST' })
// 验收轮次（出参 amount 为分）：review 通过即放出本轮款项，是逐轮放款的唯一触发点
export const demandStages = demandId => data(demandPath(demandId) + '/stages')
export const reviewStage = (demandId, stageId, body) => data(stagePath(demandId, stageId) + '/review', { method: 'PUT', body })
// 验收前查看交付作品：仅发布者可调，正文只含本轮 episodeTo 内的章节，之后章节 readable=false
export const deliverableWork = (demandId, stageId) => data(stagePath(demandId, stageId) + '/deliverable-work')
// 延期：决定创作者申请 / 发布者自主延时（不经申请直接顺延），两者均写入延时记录
export const decideExtend = (demandId, stageId, approved) => data(stagePath(demandId, stageId) + '/extend/decision', { method: 'PUT', body: { approved } })
export const selfExtendStage = (demandId, stageId, body) => data(stagePath(demandId, stageId) + '/extend', { method: 'PUT', body })
export const stageExtendHistory = (demandId, stageId) => data(stagePath(demandId, stageId) + '/extend/history')
export const demandExtendHistory = demandId => data(demandPath(demandId) + '/extend/history')
// 任务会话：发布者发起必须显式指定对手用户（targetUserId 是查询参数，不是 body 字段）
export const demandChatSession = (demandId, targetUserId) => data(demandPath(demandId) + '/chat/session?' + qs({ targetUserId }), { method: 'POST' })

