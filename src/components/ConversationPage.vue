<template>
  <section id="conversation-page" class="workspace-page conversation-page" :data-open="open" role="dialog" aria-modal="true">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>平台客服</h1>
        <p>向平台客服反馈问题与跟进处理进度（与作者的交易对话请在顶部「会话」中进行）</p>
      </div>
      <button class="workspace-page-close" type="button" data-page-close @click="$emit('close')">关闭</button>
    </header>
    <div class="workspace-page-body" data-page-body>
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
      <!-- 没有会话时保留原型的左右两栏结构，只在各自区域内给出空状态，不整体省略模块。 -->
      <div v-else class="conversation-layout">
        <aside class="conversation-sidebar">
          <div class="conversation-filter">
            <button type="button" class="btn light small" :disabled="starting" @click="startChat">{{ starting ? '发起中…' : '发起客服会话' }}</button>
            <button type="button" class="btn light small" :disabled="!unreadCount || marking" @click="markAllRead">全部标记为已读</button>
          </div>
          <div class="conversation-list">
            <button v-for="session in sessions" :key="session.sessionId" type="button" class="conversation-item"
                    :data-chat-session="session.sessionId" :data-active="String(session.sessionId === activeId)" data-hidden="false"
                    @click="select(session.sessionId)">
              <span class="conversation-item-main">
                <b>{{ session.peerName || '平台服务' }}</b>
                <i :style="{ display: session.unread ? 'inline-block' : 'none' }"></i>
              </span>
              <span class="conversation-item-preview">{{ session.businessName || session.lastMessage || '业务沟通' }}</span>
              <time>{{ relativeText(session.lastMessageTime || session.createdAt) }}</time>
            </button>
            <p v-if="!sessions.length" class="rights-note">还没有与平台客服的沟通记录，点击上方「发起客服会话」联系平台。</p>
          </div>
        </aside>

        <section class="conversation-main">
          <header class="conversation-head">
            <b>{{ active?.peerName || '—' }}</b>
            <span>{{ active?.businessName || active?.sessionType || '业务沟通' }}</span>
            <span>{{ active ? (active.status === 2 ? '已结束' : '沟通中') + ' · 最后更新 ' + relativeText(active.lastMessageTime || active.createdAt) : '尚未选择会话' }}</span>
          </header>
          <div class="conversation-messages">
            <div v-for="message in messages" :key="message.messageId" class="conversation-message" :class="[Number(message.senderId) === Number(user?.userId) ? 'me' : 'other', message.recalled ? 'recalled' : '']">
              <div v-if="message.recalled" class="conversation-recalled">{{ Number(message.senderId) === Number(user?.userId) ? '你撤回了一条消息' : '对方撤回了一条消息' }}</div>
              <template v-else>
                <button v-if="canQuote(message)" type="button" class="quote-action" :disabled="!!quoting" @click="startQuote(message)">引用</button>
                <button v-if="canRecall(message)" type="button" class="recall-action" :disabled="recalling" @click="recall(message)">撤回</button>
                <div class="conversation-bubble">
                  <div v-if="message.quoteMessageId" class="conversation-quote">{{ message.quoteRecalled ? '原消息已撤回' : (message.quoteSender || '引用') + '：' + (message.quoteText || '') }}</div>
                  {{ message.content }}<time>{{ relativeText(message.createdAt).replace(/^.*\s/, '') }}</time>
                </div>
              </template>
            </div>
            <p v-if="!messages.length" class="rights-note">{{ active ? '还没有消息记录。' : '请从左侧选择一个会话。' }}</p>
          </div>
          <form class="conversation-compose" @submit.prevent="send">
            <div v-if="quoting" class="conversation-quoting">
              <span>引用 {{ Number(quoting.senderId) === Number(user?.userId) ? '我' : quoting.senderName || '对方' }}：{{ quoting.content }}</span>
              <button type="button" @click="quoting = null">×</button>
            </div>
            <input v-model="draft" maxlength="500" :placeholder="quoting ? '回复引用消息' : '输入消息'" :disabled="!active || active.status === 2">
            <button class="btn" type="submit" :disabled="sending || !draft.trim() || !active || active.status === 2">{{ sending ? '发送中…' : '发送' }}</button>
          </form>
        </section>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { isRealtimeConnected, onRealtime } from '../utils/realtime-socket.js'
import { relativeText } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, sessionId: { type: [Number, String], default: null } })
const emit = defineEmits(['close', 'read'])
const { api, user, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const sessions = ref([])
const messages = ref([])
const activeId = ref(null)
const draft = ref('')
const sending = ref(false)
const marking = ref(false)
const starting = ref(false)
let poll = null

const active = computed(() => sessions.value.find(s => String(s.sessionId) === String(activeId.value)) || null)
const unreadCount = computed(() => sessions.value.reduce((total, s) => total + (s.unread ? 1 : 0), 0))

async function load() {
  pending.value = true
  error.value = ''
  try {
    // 沟通页只保留与平台管理员的交流记录；与作者的 TRADE 会话归属交易中心「会话」Tab。
    sessions.value = await api.value.listChatSessions({ sessionType: 'ADMIN' })
    // 优先打开调用方指定的会话（例如带 sessionId 直达沟通页的入口）。
    const target = props.sessionId && sessions.value.find(s => String(s.sessionId) === String(props.sessionId))
    if (target) activeId.value = target.sessionId
    else if (!sessions.value.some(s => String(s.sessionId) === String(activeId.value))) activeId.value = sessions.value[0]?.sessionId || null
    await loadMessages()
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载沟通会话失败'
  } finally { pending.value = false }
}
async function loadMessages() {
  if (!activeId.value) { messages.value = []; return }
  try { messages.value = await api.value.listChatMessages(activeId.value) } catch { messages.value = [] }
}
async function startChat() {
  if (starting.value) return
  starting.value = true
  try {
    const session = await api.value.openPlatformChat()
    await load()
    const target = session?.sessionId && sessions.value.find(s => String(s.sessionId) === String(session.sessionId))
    if (target) await select(target.sessionId)
  } catch (failure) { handleError(failure) } finally { starting.value = false }
}
async function select(id) {
  activeId.value = id
  quoting.value = null
  await loadMessages()
  const session = sessions.value.find(s => String(s.sessionId) === String(id))
  if (session?.unread) {
    try { await api.value.readChatSession(id); session.unread = 0; emit('read') } catch { /* 已读失败不打断阅读 */ }
  }
}
// 引用/撤回：口径与创作者端 PlatformChat 一致（仅未撤回的普通消息可引用；撤回限本人 2 分钟内文本）。
const quoting = ref(null)
const recalling = ref(false)
const RECALL_WINDOW_MS = 120000
function canQuote(message) { return !message.recalled && message.msgType !== 'SYSTEM' }
function startQuote(message) { quoting.value = message }
function canRecall(message) {
  if (message.recalled || Number(message.senderId) !== Number(user.value?.userId)) return false
  if (message.msgType === 'SYSTEM') return false
  const time = new Date(String(message.createdAt || '').replace('T', ' ').replace(/-/g, '/')).getTime()
  return !Number.isNaN(time) && Date.now() - time <= RECALL_WINDOW_MS
}
async function recall(message) {
  if (recalling.value) return
  recalling.value = true
  try {
    await api.value.recallChatMessage(activeId.value, message.messageId)
    await loadMessages()
  } catch (failure) { handleError(failure) } finally { recalling.value = false }
}
async function send() {
  if (sending.value || !draft.value.trim() || !activeId.value) return
  sending.value = true
  try {
    await api.value.sendChatMessage(activeId.value, draft.value.trim(), quoting.value?.messageId)
    draft.value = ''
    quoting.value = null
    await loadMessages()
  } catch (failure) { handleError(failure) } finally { sending.value = false }
}
async function markAllRead() {
  if (marking.value) return
  marking.value = true
  try {
    await Promise.all(sessions.value.filter(s => s.unread).map(s => api.value.readChatSession(s.sessionId).catch(() => null)))
    sessions.value.forEach(s => { s.unread = 0 })
    emit('read')
  } finally { marking.value = false }
}
// 长连接在线时轮询只作兜底（60s）；连接不可用时退回 5s，保证行为不依赖单条链路。
const POLL_CONNECTED_MS = 60000
const POLL_DISCONNECTED_MS = 5000
let realtimeOff = []
function restartPoll() {
  clearInterval(poll)
  poll = props.open ? setInterval(() => { loadMessages() }, isRealtimeConnected() ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS) : null
}
// 会话打开期间保持刷新；sessionId 变化（例如从另一个询盘点「打开沟通」）也要重新选会话。
watch([() => props.open, () => props.sessionId], ([open]) => {
  if (open) load()
  restartPoll()
}, { immediate: true })
onMounted(() => {
  realtimeOff = [
    onRealtime('connected', restartPoll),
    onRealtime('disconnected', restartPoll),
    onRealtime('reconnect', () => { load(); loadMessages() }),
    onRealtime('chat', frame => { if (!props.open) return; if (frame?.sessionId && String(frame.sessionId) !== String(activeId.value)) load(); else loadMessages() })
  ]
})
onBeforeUnmount(() => { realtimeOff.forEach(off => off()); realtimeOff = []; clearInterval(poll) })
defineExpose({ sessions })
</script>
<style scoped>
/* 撤回/引用样式对齐创作者端 PlatformChat（全局 CSS 无这些类），沿用全局主题变量。 */
.conversation-recalled { margin: 0 auto; color: var(--muted, #716b61); font-size: 11px; background: var(--soft, #edeae2); border-radius: 2px; padding: 3px 10px; }
.conversation-message.recalled { justify-content: center; }
.quote-action, .recall-action { align-self: center; margin-right: 6px; border: 1px solid var(--line, #dcd8ce); background: var(--bg, #f6f4ef); color: var(--muted, #716b61); border-radius: 2px; padding: 3px 8px; font-size: 11px; display: none; cursor: pointer; }
.conversation-message:hover .quote-action, .conversation-message.me:hover .recall-action { display: block; }
.quote-action:hover, .recall-action:hover { color: var(--brand, #2c4a52); border-color: var(--brand, #2c4a52); }
.conversation-quote { border-left: 2px solid #c3d1cf; background: #ffffff88; border-radius: 2px; padding: 3px 8px; margin-bottom: 5px; color: var(--muted, #716b61); font-size: 11px; line-height: 1.5; max-height: 44px; overflow: hidden; }
.conversation-message.me .conversation-quote { border-left-color: #ffffffb0; background: #ffffff30; color: #eef4f3; }
.conversation-compose { flex-wrap: wrap; }
.conversation-quoting { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-left: 2px solid var(--brand, #2c4a52); background: var(--soft, #edeae2); border-radius: 2px; padding: 5px 9px; font-size: 11px; color: var(--muted, #716b61); }
.conversation-quoting span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversation-quoting button { border: 0; background: transparent; color: var(--muted, #716b61); font-size: 14px; line-height: 1; cursor: pointer; }
.conversation-quoting button:hover { color: var(--red, #b03a2e); }
</style>
