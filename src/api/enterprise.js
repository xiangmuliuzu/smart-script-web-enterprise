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

/* ---------------- 报价与议价 ---------------- */
// 报价 price 字段按元直传，后端不做单位换算（只有订单 amount 是分）。
export const latestQuote = inquiryId => data('/api/v1/trade/quote/latest?' + qs({ inquiryId }))
export const counterOffer = body => data('/api/v1/trade/quote/counter-offer', { method: 'POST', body })
export const acceptQuote = quoteId => data('/api/v1/trade/quote/' + id(quoteId) + '/accept', { method: 'PUT' })

/* ---------------- 订单（amount 单位为分） ---------------- */
export async function listOrders({ status, keyword, pageNum = 1, pageSize = 10 } = {}) {
  const result = await data('/api/v1/trade/order/list?' + qs({ role: 'buyer', status, keyword, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
// 按询盘回查关联订单（会话页「查看订单」跳转用），无订单时返回 null
export const getOrderByInquiry = inquiryId => data('/api/v1/trade/order/by-inquiry/' + id(inquiryId))
// 发起支付宝沙箱付款，并由服务端核验支付结果。refresh=true 时换新商户单号重出收款码（旧码失效后用）。
export const payOrder = (orderId, refresh = false) => data('/api/v1/trade/order/' + id(orderId) + '/pay' + (refresh ? '?refresh=true' : ''), { method: 'POST' })
export const confirmSandboxPayment = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay/confirm', { method: 'POST' })
// 测试直付：跳过支付宝沙箱，订单直接按已付款进入交割（与版权零元直付同性质）。
export const directPayOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/pay/direct-pay', { method: 'POST' })
// 买方确认收货：delivering → completed，写入作者收益。
export const completeOrder = orderId => data('/api/v1/trade/order/' + id(orderId) + '/complete', { method: 'POST' })
// 取消订单：仅 confirmed 可取消，买卖双方任一方可发起；reason 选填，走 query 参数。
export const cancelOrder = (orderId, reason) => data('/api/v1/trade/order/' + id(orderId) + '/cancel' + (reason ? '?' + qs({ reason }) : ''), { method: 'POST' })

/* ---------------- 合同（amount 单位为元；签署前置实名认证由后端校验） ---------------- */
export const listContracts = params => data('/api/v1/trade/contracts/list?' + qs({ ...params, role: 'buyer' }))
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

/* ---------------- 版权交割（企业端恒为买方：列表/详情/确认收货；无卖方上传） ---------------- */
const deliveryBase = '/api/v1/trade/delivery'
export async function listDeliveries({ status, pageNum = 1, pageSize = 10 } = {}) {
  // role 固定 buyer，避免混入卖方视角
  const result = await data(deliveryBase + '/list?' + qs({ role: 'buyer', status, pageNum, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getDelivery = deliveryId => data(deliveryBase + '/' + id(deliveryId))
export const getDeliveryByOrder = orderId => data(deliveryBase + '/by-order/' + id(orderId))
export const confirmDelivery = deliveryId => data(deliveryBase + '/' + id(deliveryId) + '/confirm', { method: 'POST' })

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
export const enableSeal = sealId => data(sealPath(sealId) + '/enable', { method: 'PUT' })
export const deleteSeal = sealId => data(sealPath(sealId), { method: 'DELETE' })
// 印章图 / 审核材料：走 content/upload，type=material（与 App 一致）。
export const upload = (file, purpose = 'seal') => {
  const body = new FormData()
  body.append('file', file)
  if (purpose === 'seal') body.append('type', 'material')
  return data('/api/v1/content/upload', { method: 'POST', body })
}

/* ---------------- 作品（内容市场） ---------------- */
export const listHotRankings = async () => asList(await data('/api/v1/content/rankings?' + qs({ type: 'view', limit: 3 })))
export async function listWorks({ keyword, categoryId, sort, recommendStatus, showScope, page = 1, pageSize = 12 } = {}) {
  const result = await data('/api/v1/content/works?' + qs({ keyword, categoryId, sort, recommendStatus, showScope, page, pageSize }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
export const getWork = workId => data('/api/v1/content/works/' + id(workId))
export const listChapters = workId => data('/api/v1/content/works/' + id(workId) + '/chapters')
// 分镜目录与章节同级：后端只返回审核通过的分镜，readable=false 时不含正文。
export const listStoryboards = workId => data('/api/v1/content/works/' + id(workId) + '/storyboards')
// 章节正文路径不嵌套在作品下；403 也会带 data（content 为空、readable=false）。
export const getChapter = chapterId => data('/api/v1/content/chapters/' + id(chapterId))

/* ---------------- 消息与沟通 ---------------- */
export async function listMessages({ pageNum = 1, pageSize = 50, type, includeAnnouncements } = {}) {
  // 企业端=买方门户：交易通知只取 BUYER/BOTH（及无受众的通用通知），卖方视角通知（如新询盘）不进此端。
  const result = await data('/api/v1/messages?' + qs({ pageNum, pageSize, type, includeAnnouncements, portalRole: 'BUYER' }))
  return { total: Number(result?.total || result?.length || 0), list: asList(result).map(item => ({ ...item, isRead: item.read, content: item.summary, createTime: item.createdAt })) }
}
export const getMessage = messageId => data('/api/v1/messages/' + id(messageId))
export const unreadCount = async () => Number((await data('/api/v1/messages/unread-count?' + qs({ portalRole: 'BUYER' })))?.total || 0)
export const readMessage = messageId => data('/api/v1/messages/' + id(messageId) + '/read', { method: 'PUT' })
export const readAllMessages = () => data('/api/v1/messages/read-all', { method: 'PUT' })

export async function listChatSessions(params = {}) {
  const result = await data('/api/v1/users/me/chat/sessions?' + qs(params))
  return asList(result)
}
export const listChatMessages = async sessionId => asList(await data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages'))
export const sendChatMessage = (sessionId, content, quoteMessageId) => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages', { method: 'POST', body: { msgType: 'TEXT', content, ...(quoteMessageId ? { quoteMessageId } : {}) } })
export const recallChatMessage = (sessionId, messageId) => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/messages/' + id(messageId) + '/recall', { method: 'PUT' })
export const readChatSession = sessionId => data('/api/v1/users/me/chat/sessions/' + id(sessionId) + '/read', { method: 'PUT' })
// 与沟通页同口径：客服徽标只统计 ADMIN 会话未读，不含交易会话。
export const chatUnreadCount = async () => Number((await data('/api/v1/users/me/chat/unread-count?' + qs({ sessionType: 'ADMIN' })))?.chatUnread || 0)
// 发起与平台管理员的沟通会话（GENERAL 平台沟通）；沟通页只列 ADMIN 会话，空列表时靠此按钮破局。
export const openPlatformChat = () => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { businessType: 'GENERAL', businessName: '平台沟通' } })

/* ---------------- 创作者门户 Cooperation.vue 复用别名（与用户端同名同义，企业端恒为买方） ---------------- */
// 交易会话列表：会话列表按 sessionType=TRADE 过滤，返回数组（沿用 listChatSessions）。
export const listTradeSessions = () => listChatSessions({ sessionType: 'TRADE' })
// 由询盘创建/获取交易会话，返回新建会话（含 sessionId）。走交易域专用端点，幂等且带询盘校验。
export const createTradeChat = inquiryId => openInquiryChat(inquiryId)
// 会话消息列表 / 发送文本 / 最新报价：与 Cooperation.vue 调用名对齐。
export const listChat = sessionId => listChatMessages(sessionId)
export const sendChat = (sessionId, content, quoteMessageId) => sendChatMessage(sessionId, content, quoteMessageId)
export const recallChat = (sessionId, messageId) => recallChatMessage(sessionId, messageId)
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
// form 为 FormData 时按 multipart 直传（实名契约要求身份证正反面图片），普通对象仍走 JSON。
export const submitRealName = (form, resubmit = false) => data('/api/v1/users/me/real-name' + (resubmit ? '/resubmit' : ''), { method: 'POST', body: form })
/* ---------------- 账号安全 ---------------- */
// 与创作者端同端点：改密后需重新登录（无状态令牌不会自动失效）。
export const changePassword = form => data('/api/v1/auth/password/change', { method: 'POST', body: form })
// 换绑手机四步：old/send → old/verify（换取 stepUpToken）→ new/send → confirm。
export const phoneChange = (step, body) => data('/api/v1/users/me/phone/change/' + step, { method: 'POST', body })

export const listFeedback = async () => asList(await data('/api/v1/feedback'))
export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })

/* ---------------- 任务域（需求悬赏）：企业端=需求方（买方），只发布 / 改 / 看审核结果，不验收 ---------------- */
// 后端：AppTradeDemandController。买方动作只有「填表提交 → 平台审核 → 审核通过后进入任务广场」，
// 逐轮验收、延时审批、关闭征集已收归管理端 /api/v1/admin/trade/demand；
// 托管与押金资金环节（pay/escrow*、dev-pass、deposit*）随后端硬下线，本端不再封装，也不得复活。
//
// 金额口径（以控制器实测为准，混用单位是这个域的历史包袱，改之前先读注释）：
//   入参 budget = 分；stages[].amount = 元（parseStages 原样入库，不做换算）；
//   出参 budget / stages[].amount = 分（控制器在返回前统一 元→分）。
const demandBase = '/api/v1/trade/demand'
const demandPath = demandId => demandBase + '/' + id(demandId)
const stagePath = (demandId, stageId) => `${demandPath(demandId)}/stage/${id(stageId)}`
// 我发布的任务：mine=published 走 clientId 过滤，这一分支才接受 status，且返回审核态全量
// （pending_review / rejected 也在这里，绝不能在外层再按 open 过滤掉，否则买方看不到驳回单）。
// mine 固定写死在本函数内，与 listInquiries/listOrders 的 role:'buyer' 同口径，避免调用方翻成别人的视角。
export async function listMyDemands({ status, genreId, taskType, keyword, sortBy, order, pageNum = 1, pageSize = 20 } = {}) {
  const result = await data(demandBase + '/list?' + qs({
    mine: 'published', status, genreId, taskType, keyword, sortBy, order, pageNum, pageSize
  }))
  return { total: Number(result?.total || 0), list: asList(result) }
}
// 详情：pending_review / rejected / 已过征集截止的 open 单只对当事人（需求方或接单创作者）开放，
// 其他人拿到 404；被驳回时出参带 auditRemark（审核意见）与 auditAt（审核时间）。
export const getDemand = demandId => data(demandPath(demandId))
// 发布：建单后 status=pending_review，不进任务广场。totalEpisodes 必填，缺失后端 400「请填写总集数」。
export const createDemand = form => data(demandBase, { method: 'POST', body: form })
// 编辑：仅需求方本人、且状态为 pending_review 或 rejected 时放行；改 rejected 单自动重新提交审核并清空审核意见。
// 已审核通过（open）的单后端 400「任务已通过审核，如需调整请联系平台客服」，本端不再前置隐藏，按后端文案提示。
export const updateDemand = (demandId, form) => data(demandPath(demandId), { method: 'PUT', body: form })
// 轮次进度（只读）：出参 amount 为分；非当事人只能拿到剥离交付字段的时间表。
export const demandStages = demandId => data(demandPath(demandId) + '/stages')
// 交付作品：买方只在「需求已完成（completed）+ 最后一轮 + 该轮已通过」时拿得到，
// 其余情形后端 400 给出口径文案（任务尚未完成验收 / 仅可查看最后一轮 / 最后一轮尚未验收通过），
// 页面必须原样展示这条 msg，不要替换成通用报错，否则用户不知道自己差在哪一步。
export const deliverableWork = (demandId, stageId) => data(stagePath(demandId, stageId) + '/deliverable-work')
// 发布分镜任务时的源剧本候选：本人未删除作品（不排除已上架，源剧本仅作参考）
export const sourceWorks = async () => asList(await data(demandBase + '/source-works'))
// 源剧本文件上传：走交易域端点（买方无创作者资格时 content/upload 会被拒），返回 { url(相对路径), fileName }
export const uploadSourceScript = file => {
  const form = new FormData()
  form.append('file', file, file.name || 'script.txt')
  return data(demandBase + '/upload-script', { method: 'POST', body: form })
}
// 查看源剧本：{ work?, chapters?, fileUrl?, fileName? }，接单前评估用，买方详情里复核
export const sourceScript = demandId => data(demandPath(demandId) + '/source-script')


// 与 App 使用同一询盘入口；身份及卖方由服务端确定。
export const createInquiry = body => data('/api/v1/trade/inquiry', { method: 'POST', body })
export const getWorkCopyrightStatus = workId => data('/api/v1/trade/inquiry/copyright-status?' + qs({ workId }))
