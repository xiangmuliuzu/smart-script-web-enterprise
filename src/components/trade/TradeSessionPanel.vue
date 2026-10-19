<template>
  <div class="session-layout">
    <div class="session-list-panel">
      <LoadState :pending="listPending" :error="listError" :retry="loadSessions" />
      <div v-if="!listPending && !sessions.length" class="load-state"><p>暂无交易会话</p></div>
      <div v-for="s in sessions" :key="s.sessionId" class="session-item" :class="{ active: chatSessionId === s.sessionId }" @click="select(s)">
        <div class="session-top"><b>{{ s.businessName || '会话#' + s.sessionId }}</b><span v-if="s.unread" class="unread-badge">{{ s.unread }}</span></div>
        <p class="session-peer cost">{{ s.peerName || '用户' + s.peerId }}</p>
        <p v-if="s.lastMessage" class="session-last">{{ s.lastMessage }}</p>
      </div>
    </div>
    <div class="session-chat-panel">
      <template v-if="chatSessionId">
        <div class="negotiation-bar">
          <span class="neg-amount">¥{{ negAmountYuan }}</span>
          <span class="neg-source cost">{{ negSource }}</span>
          <button v-if="canAcceptLatest" class="btn sm" @click="doAcceptLatest">接受报价</button>
          <span v-else-if="latestQuote && ['pending','pending_seller'].includes(latestQuote.status)" class="cost" style="font-size:12px">等待对方确认</span>
        </div>
        <div class="chat-messages" ref="chatBodyEl">
          <LoadState :pending="chatLoading" />
          <p v-if="chatError" class="cost">加载失败：{{ chatError }}</p>
          <template v-if="!chatLoading">
            <p v-if="!chatMessages.length" class="cost" style="text-align:center">暂无消息，开始沟通吧</p>
            <div v-for="msg in chatMessages" :key="msg.msgId || msg.messageId">
              <div v-if="isQuoteSysMsg(msg)" class="quote-sys-msg" :class="'qsys-' + parseQuoteSysMsg(msg.content).tag">{{ parseQuoteSysMsg(msg.content).label }}</div>
              <div v-else class="chat-bubble" :class="Number(msg.senderId) === userId ? 'me' : 'them'">
                <div v-if="Number(msg.senderId) !== userId" class="bubble-name cost">{{ msg.senderName || '用户' + msg.senderId }}</div>
                <div class="bubble-body">{{ msg.content }}<time>{{ dateText(msg.createTime || msg.createdAt).slice(5) }}</time></div>
              </div>
            </div>
          </template>
        </div>
        <div class="quote-input-card">
          <span class="yen-sign">¥</span>
          <input v-model="chatAmount" type="number" min="0" step="0.01" placeholder="出价金额" class="amount-input" :disabled="quoteLocked">
        </div>
        <form class="chat-input-row" @submit.prevent="doSend">
          <input v-model="chatText" maxlength="2000" placeholder="输入消息…" :disabled="sending">
          <button class="btn" type="submit" :disabled="sending || (!chatText.trim() && !amountChanged)">{{ sending ? '发送中…' : '发送' }}</button>
        </form>
      </template>
      <div v-else class="load-state"><p>选择一个会话开始沟通</p></div>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadState from '../LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { dateText, money } from '../../utils/enterprise.js'

const props = defineProps({ focusInquiryId: { type: [Number, String], default: null } })
const emit = defineEmits(['changed'])
const { api, user, handleError } = usePortal()
const userId = computed(() => Number(user.value?.userId))

const sessions = ref([])
const listPending = ref(false)
const listError = ref('')
const chatSessionId = ref(null)
const activeInquiryId = ref(null)
const chatMessages = ref([])
const chatLoading = ref(false)
const chatError = ref('')
const chatText = ref('')
const chatAmount = ref('')
const sending = ref(false)
const chatBodyEl = ref(null)
const latestQuote = ref(null)
const budgetCache = ref({})
let pollTimer = null
let lastSentAmountFen = null

const chatAmountFen = computed(() => {
  const v = parseFloat(chatAmount.value)
  return isNaN(v) || v <= 0 ? null : Math.round(v * 100)
})
const amountChanged = computed(() => chatAmountFen.value !== null && chatAmountFen.value !== lastSentAmountFen)
// 作者已报价（pending）或已达成时报价条锁定语义由后端裁决；这里仅在询盘关闭/拒绝后禁输入。
const quoteLocked = computed(() => false)
const budgetLicenseType = computed(() => latestQuote.value?.licenseType || null)
const negAmountYuan = computed(() => {
  if (latestQuote.value) return money(latestQuote.value.price)
  return money(budgetCache.value[activeInquiryId.value] || 0)
})
const negSource = computed(() => {
  if (!latestQuote.value) return '预算金额'
  return latestQuote.value.quoterRole === 'seller' ? '作者报价' : '我的出价'
})
const canAcceptLatest = computed(() => {
  if (!latestQuote.value) return false
  const isMine = Number(latestQuote.value.quoterId) === userId.value
  return !isMine && ['pending', 'pending_seller'].includes(latestQuote.value.status)
})

function isQuoteSysMsg(msg) {
  if (!msg.isSystem && msg.msgType !== 'SYSTEM') return false
  const c = msg.content || ''
  return c.startsWith('[报价]') || c.startsWith('[议价]') || c.startsWith('[接受]') || c.startsWith('[拒绝]')
}
function parseQuoteSysMsg(content) {
  const bracketEnd = content.indexOf(']')
  if (bracketEnd < 0) return { tag: 'default', label: content }
  const tag = content.substring(1, bracketEnd)
  const detail = content.substring(bracketEnd + 1).trim()
  return { tag, label: `[${tag}] ${detail}` }
}

async function loadSessions() {
  listPending.value = true; listError.value = ''
  try {
    sessions.value = await api.value.listChatSessions({ sessionType: 'TRADE' })
    const target = props.focusInquiryId && sessions.value.find(s => String(s.inquiryId) === String(props.focusInquiryId))
    if (target) await select(target)
    else if (!sessions.value.some(s => String(s.sessionId) === String(chatSessionId.value))) chatSessionId.value = null
  } catch (failure) { listError.value = failure.message }
  finally { listPending.value = false }
}

async function select(s) {
  stopPoll()
  chatSessionId.value = s.sessionId
  activeInquiryId.value = s.inquiryId || null
  latestQuote.value = null
  if (s.inquiryId && budgetCache.value[s.inquiryId] === undefined) {
    try { budgetCache.value[s.inquiryId] = (await api.value.getInquiry(s.inquiryId))?.budget || 0 } catch { budgetCache.value[s.inquiryId] = 0 }
  }
  await loadMessages()
  await loadLatestQuote()
  if (s.unread) {
    try { await api.value.readChatSession(s.sessionId); s.unread = 0 } catch { /* 已读失败不打断阅读 */ }
  }
  await nextTick()
  scrollBottom()
  startPoll()
}

async function loadMessages() {
  if (!chatSessionId.value) return
  chatLoading.value = true; chatError.value = ''
  try { chatMessages.value = await api.value.listChatMessages(chatSessionId.value) } catch (e) { chatError.value = e.message }
  finally { chatLoading.value = false }
}
async function loadLatestQuote() {
  if (!activeInquiryId.value) return
  try { latestQuote.value = await api.value.latestQuote(activeInquiryId.value) } catch { latestQuote.value = null }
}
function scrollBottom() {
  const el = chatBodyEl.value
  if (el) el.scrollTop = el.scrollHeight
}
function startPoll() {
  stopPoll()
  pollTimer = setInterval(() => { if (chatSessionId.value) loadMessages().then(scrollBottom) }, 30000)
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// 买方发送：金额变化 → counter-offer（买方通用出价端点，作者未报价时也可出价）；
// 金额未变化 → 只发普通消息，对齐卖方端「金额不变不发报价记录」的口径。
async function doSend() {
  if (sending.value || !chatSessionId.value) return
  const text = chatText.value.trim()
  const amountFen = chatAmountFen.value
  if (!text && !amountFen) return
  sending.value = true
  try {
    if (amountFen !== null && amountFen !== lastSentAmountFen) {
      const inqId = activeInquiryId.value
      if (!inqId) throw new Error('当前会话未关联询盘，无法出价')
      const latest = latestQuote.value
      await api.value.counterOffer({
        inquiryId: inqId,
        price: amountFen,
        licenseType: latest?.licenseType || budgetLicenseType.value || 'exclusive',
        description: text || undefined
      })
      lastSentAmountFen = amountFen
      await loadLatestQuote()
    } else if (text) {
      await api.value.sendChatMessage(chatSessionId.value, text)
    }
    chatText.value = ''
    await loadMessages()
    await nextTick()
    scrollBottom()
  } catch (e) { await handleError(e) }
  finally { sending.value = false }
}

async function doAcceptLatest() {
  if (!latestQuote.value) return
  try {
    await ElMessageBox.confirm('接受报价后将直接生成采购订单，确定吗？', '确认接受报价', { type: 'warning' })
    const r = await api.value.acceptQuote(latestQuote.value.quoteId)
    ElMessage.success('已接受报价' + (r?.orderId ? '，订单已生成' : ''))
    await loadLatestQuote()
    await loadMessages()
    emit('changed')
  } catch (e) { if (e !== 'cancel') await handleError(e) }
}

watch(() => props.focusInquiryId, value => { if (value) loadSessions() })
onBeforeUnmount(() => stopPoll())
defineExpose({ load: loadSessions })
</script>
<style scoped>
.session-layout { display: flex; gap: 0; flex: 1; min-height: 0; height: 100%; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden }
.session-list-panel { width: 220px; flex-shrink: 0; border-right: 1px solid #ebeef5; overflow-y: auto; background: #fafafa }
.session-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background .12s }
.session-item:hover { background: #f0f2f5 }
.session-item.active { background: #ecf5ff; border-left: 3px solid #409eff }
.session-top { display: flex; align-items: center; justify-content: space-between; gap: 4px }
.session-top b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.unread-badge { background: #f56c6c; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center }
.session-peer { font-size: 12px; margin: 2px 0 }
.session-last { font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 2px 0 0 }
.session-chat-panel { flex: 1; display: flex; flex-direction: column; padding: 0; overflow: hidden }
.negotiation-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #ebeef5; background: #fbfdff }
.neg-amount { font-size: 17px; font-weight: 700; color: #303133 }
.chat-messages { flex: 1; overflow-y: auto; padding: 12px; background: #fafafa; display: flex; flex-direction: column; gap: 8px }
.chat-bubble { max-width: 78%; display: flex; flex-direction: column }
.chat-bubble.me { align-self: flex-end; align-items: flex-end }
.chat-bubble.them { align-self: flex-start; align-items: flex-start }
.bubble-name { font-size: 11px; margin-bottom: 2px }
.bubble-body { background: #fff; border: 1px solid #ebeef5; padding: 7px 11px; border-radius: 8px; font-size: 13px; line-height: 1.55; word-break: break-word }
.chat-bubble.me .bubble-body { background: #ecf5ff; border-color: #d9ecff }
.bubble-body time { display: block; font-size: 10.5px; color: #c0c4cc; margin-top: 3px }
.quote-sys-msg { align-self: center; padding: 5px 14px; border-radius: 10px; font-size: 12px; max-width: 84%; line-height: 1.5 }
.qsys-报价 { background: #ecf5ff; color: #409eff }
.qsys-议价 { background: #fdf6ec; color: #e6a23c }
.qsys-接受 { background: #f0f9eb; color: #67c23a }
.qsys-拒绝 { background: #fef0f0; color: #f56c6c }
.quote-input-card { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 12px; background: #fff; border-top: 1px solid #ebeef5 }
.yen-sign { font-size: 16px; font-weight: 600; color: #606266 }
.amount-input { border: none; text-align: center; font-size: 16px; font-weight: 600; width: 120px; outline: none; background: transparent }
.amount-input::placeholder { color: #c0c4cc }
.chat-input-row { display: flex; gap: 8px; padding: 8px; border-top: 1px solid #ebeef5 }
.chat-input-row input { flex: 1; padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px }
.cost { color: #909399; font-size: 12px }
.load-state { padding: 24px 0; text-align: center; color: #909399; font-size: 13px }
</style>
