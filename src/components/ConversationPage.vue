<template>
  <section id="conversation-page" class="workspace-page conversation-page" :data-open="open" role="dialog" aria-modal="true">
    <header class="workspace-page-head">
      <div class="page-head-copy">
        <h1>沟通</h1>
        <p>与平台管理员或关联作品作者进行业务沟通</p>
      </div>
      <button class="workspace-page-close" type="button" data-page-close @click="$emit('close')">关闭</button>
    </header>
    <div class="workspace-page-body" data-page-body>
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
      <!-- 没有会话时保留原型的左右两栏结构，只在各自区域内给出空状态，不整体省略模块。 -->
      <div v-else class="conversation-layout">
        <aside class="conversation-sidebar">
          <div class="conversation-filter">
            <select v-model="filters.type">
              <option value="all">全部联系人</option>
              <option value="admin">管理员</option>
              <option value="author">作者</option>
            </select>
            <select v-model="filters.business">
              <option value="all">全部作品</option>
              <option v-for="name in businesses" :key="name" :value="name">{{ name }}</option>
            </select>
            <button type="button" class="btn light small" :disabled="!unreadCount || marking" @click="markAllRead">全部标记为已读</button>
          </div>
          <div class="conversation-list">
            <button v-for="session in visibleSessions" :key="session.sessionId" type="button" class="conversation-item"
                    :data-chat-session="session.sessionId" :data-active="String(session.sessionId === activeId)" data-hidden="false"
                    @click="select(session.sessionId)">
              <span class="conversation-item-main">
                <b>{{ session.peerName || '平台服务' }}</b>
                <i :style="{ display: session.unread ? 'inline-block' : 'none' }"></i>
              </span>
              <span class="conversation-item-preview">{{ session.businessName || session.lastMessage || '业务沟通' }}</span>
              <time>{{ relativeText(session.lastMessageTime || session.createdAt) }}</time>
            </button>
            <p v-if="!visibleSessions.length" class="rights-note">暂无沟通会话，在作品详情发起询盘后可在这里与作者继续沟通。</p>
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
const filters = ref({ type: 'all', business: 'all' })
let poll = null

const active = computed(() => sessions.value.find(s => String(s.sessionId) === String(activeId.value)) || null)
const unreadCount = computed(() => sessions.value.reduce((total, s) => total + (s.unread ? 1 : 0), 0))
const businesses = computed(() => [...new Set(sessions.value.map(s => s.businessName).filter(Boolean))])
const visibleSessions = computed(() => sessions.value.filter(session => {
  const isAuthor = String(session.sessionType || '').toUpperCase() === 'TRADE'
  if (filters.value.type === 'admin' && isAuthor) return false
  if (filters.value.type === 'author' && !isAuthor) return false
  return filters.value.business === 'all' || session.businessName === filters.value.business
}))

async function load() {
  pending.value = true
  error.value = ''
  try {
    sessions.value = await api.value.listChatSessions({ sessionType: 'TRADE' })
    // 优先打开调用方指定的会话（例如从作品详情「联系作者」进入）。
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
    } else ElMessage.info('结束会话由平台流程处理，可在「消息」中联系平台运营')
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
