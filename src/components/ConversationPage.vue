<template>
  <section id="conversation-page" class="workspace-page conversation-page" :data-open="open" role="dialog" aria-modal="true">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>平台客服</h1>
        <p>向平台客服反馈问题与跟进处理进度（与作者的交易对话请在交易中心的「会话」中进行）</p>
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
            <button type="button" class="btn ghost small" :disabled="!active || active.status === 2 || reopening" @click="toggleStatus">
              {{ active?.status === 2 ? '重新打开' : '结束会话' }}
            </button>
            <b>{{ active?.peerName || '—' }}</b>
            <span>{{ active?.businessName || active?.sessionType || '业务沟通' }}</span>
            <span>{{ active ? (active.status === 2 ? '已结束' : '沟通中') + ' · 最后更新 ' + relativeText(active.lastMessageTime || active.createdAt) : '尚未选择会话' }}</span>
          </header>
          <div class="conversation-messages">
            <div v-for="message in messages" :key="message.messageId" class="conversation-message" :class="Number(message.senderId) === Number(user?.userId) ? 'me' : 'other'">
              <div class="conversation-bubble">{{ message.content }}<time>{{ relativeText(message.createdAt).replace(/^.*\s/, '') }}</time></div>
            </div>
            <p v-if="!messages.length" class="rights-note">{{ active ? '还没有消息记录。' : '请从左侧选择一个会话。' }}</p>
          </div>
          <form class="conversation-compose" @submit.prevent="send">
            <input v-model="draft" maxlength="500" placeholder="输入消息" :disabled="!active || active.status === 2">
            <button class="btn" type="submit" :disabled="sending || !draft.trim() || !active || active.status === 2">{{ sending ? '发送中…' : '发送' }}</button>
          </form>
        </section>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
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
const reopening = ref(false)
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
  await loadMessages()
  const session = sessions.value.find(s => String(s.sessionId) === String(id))
  if (session?.unread) {
    try { await api.value.readChatSession(id); session.unread = 0; emit('read') } catch { /* 已读失败不打断阅读 */ }
  }
}
async function send() {
  if (sending.value || !draft.value.trim() || !activeId.value) return
  sending.value = true
  try {
    await api.value.sendChatMessage(activeId.value, draft.value.trim())
    draft.value = ''
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
async function toggleStatus() {
  if (!active.value) return
  reopening.value = true
  try {
    // 后端只接受 action=reopen；结束会话由平台流程处理，这里明确说明而不是伪造成功。
    if (active.value.status === 2) {
      await api.value.reopenChatSession(active.value.sessionId)
      await load()
      ElMessage.success('会话已重新打开')
    } else ElMessage.info('结束会话由平台流程处理，可发送消息向管理员说明诉求')
  } catch (failure) { handleError(failure) } finally { reopening.value = false }
}
// 会话打开期间轻量轮询，保证新消息可见；关闭时立刻停止。
// sessionId 变化（例如从另一个询盘点「打开沟通」）也要重新选会话，此时 open 可能已经是 true。
watch([() => props.open, () => props.sessionId], ([open]) => {
  if (open) { load(); poll = setInterval(() => { loadMessages() }, 20000) }
  else { clearInterval(poll); poll = null }
}, { immediate: true })
onBeforeUnmount(() => clearInterval(poll))
defineExpose({ sessions })
</script>
