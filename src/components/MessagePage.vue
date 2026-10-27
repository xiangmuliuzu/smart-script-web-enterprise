<template>
  <!-- 消息改为右侧抽屉：原型的消息入口本来就是 #drawer-messages 抽屉（prototype.css 已带它的几何样式），
       这里复用同一套抽屉契约，与创作者端的消息入口保持一致。 -->
  <div id="drawer-messages" class="drawer-bg" :data-open="open" @click.self="closeOnBg">
    <aside class="drawer">
      <div class="drawer-head">
        <h2>消息</h2>
        <button class="close" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="drawer-body">
        <div class="notice-toolbar">
          <button type="button" class="btn light small" :disabled="!unreadCount || marking" @click="markAll">{{ marking ? '处理中…' : '全部标记为已读' }}</button>
        </div>
        <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
        <p v-else-if="!list.length" class="rights-note">暂无消息。</p>
        <div v-else class="notice-list">
          <article v-for="item in list" :key="item.messageId" class="notice-card" role="button" tabindex="0"
                   :data-unread="String(!item.isRead)" :data-open="String(expanded === item.messageId)"
                   @click="toggle(item)" @keydown.enter.prevent="toggle(item)" @keydown.space.prevent="toggle(item)">
            <div class="notice-card-head">
              <b><span v-if="!item.isRead" class="notice-dot"></span>{{ item.title }}</b>
              <span>{{ relativeText(item.createTime) }}</span>
            </div>
            <p>{{ item.content }}</p>
            <p v-if="detail[item.messageId]" class="notice-detail">{{ detail[item.messageId] }}</p>
            <button v-if="tradeJumpOf(item)" class="notice-link" type="button" @click.stop="jumpTrade(item)">{{ tradeJumpOf(item).label }}</button>
          </article>
        </div>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { relativeText } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'open-trade', 'read'])
const { api, handleError } = usePortal()
// 交易域通知（TRANSACTION）按 businessType 映射到 Cooperation 对应 Tab 与按钮文案；
// 后端通知仅携带 INQUIRY/ORDER/CONTRACT 三类业务主键，会话需从询盘进入故不单独映射。
const TRADE_JUMP = {
  INQUIRY: { tab: 'inquiry', label: '查看询盘' },
  ORDER: { tab: 'order', label: '查看订单' },
  CONTRACT: { tab: 'contract', label: '查看合同' },
}
function tradeJumpOf(item) {
  return item && item.type === 'TRANSACTION' && item.businessId ? TRADE_JUMP[item.businessType] : null
}
function jumpTrade(item) {
  const jump = tradeJumpOf(item)
  if (jump) emit('open-trade', { tab: jump.tab, bizId: item.businessId })
}
const pending = ref(false)
const error = ref('')
const marking = ref(false)
const list = ref([])
const detail = reactive({})
const expanded = ref(null)
const unreadCount = computed(() => list.value.filter(item => !item.isRead).length)

async function load() {
  pending.value = true
  error.value = ''
  try {
    // 列表接口的 summary 是压平截断后的摘要，展开时再取单条正文。
    const result = await api.value.listMessages({ pageSize: 50, includeAnnouncements: true })
    list.value = result.list
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载消息失败'
  } finally { pending.value = false }
}
async function toggle(item) {
  const next = expanded.value === item.messageId ? null : item.messageId
  expanded.value = next
  if (!next) return
  if (!detail[item.messageId]) {
    try { detail[item.messageId] = (await api.value.getMessage(item.messageId))?.content || '' } catch { detail[item.messageId] = item.content || '' }
  }
  if (!item.isRead) {
    try { await api.value.readMessage(item.messageId); item.isRead = true; emit('read') } catch { /* 标记失败不打断阅读 */ }
  }
}
async function markAll() {
  if (marking.value) return
  marking.value = true
  try {
    await api.value.readAllMessages()
    list.value.forEach(item => { item.isRead = true })
    emit('read')
  } catch (failure) { handleError(failure) } finally { marking.value = false }
}
// 原型 closeOnBg 是空实现：点击遮罩不关闭。
function closeOnBg() {}
watch(() => props.open, open => { if (open) load() }, { immediate: true })
</script>
