<template>
  <div id="drawer-trade" class="drawer-bg" :data-open="open" @click.self="closeOnBg">
    <aside class="drawer">
      <div class="drawer-head">
        <h2>交易中心</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="trade-tabs">
        <button v-for="tab in tabs" :key="tab.key" :data-trade="tab.key" :data-active="String(panel === tab.key)" @click="switchPanel(tab.key)">
          {{ tab.label }} <span v-if="tab.count" class="badge">{{ tab.count }}</span>
        </button>
      </div>
      <div class="drawer-body">
        <!-- 询盘：手风琴列表，展开即详情（对齐卖方端「我的合作」） -->
        <InquiryPanel v-show="panel === 'inquiry'" ref="inquiryPanel" class="panel-host" @open-session="openSessionForInquiry" @changed="onTradeChanged" />
        <!-- 会话：分屏聊天，报价议价在会话内完成（对齐卖方端） -->
        <TradeSessionPanel v-show="panel === 'session'" ref="sessionPanel" class="panel-host" :focus-inquiry-id="focusInquiryId" @changed="onTradeChanged" />
        <!-- 订单：平铺卡片，付款/收货等买方动作直接在卡片上完成 -->
        <OrderPanel v-show="panel === 'order'" ref="orderPanel" class="panel-host" @changed="onTradeChanged" />
        <!-- 合同：后端没有用户侧合同接口，维持占位 -->
        <section v-show="panel === 'contract'" class="trade-section panel-host" data-trade-panel="contract" :data-active="String(panel === 'contract')">
          <div class="section-panel">
            <div class="section-head">
              <h3>合同管理</h3>
              <span>合同信息与签署流程</span>
            </div>
            <LoadState v-if="!contractOrders.length" empty empty-text="暂无合同，订单生成后可在此查看。" />
            <ul v-else class="side-list">
              <li v-for="order in contractOrders" :key="order.orderId" class="interactive-side-item" tabindex="0">
                <b>{{ order.orderNo }} · 《{{ order.workTitle || order.workId }}》</b>
                <span>合同金额：{{ money(order.amount) }} · {{ licenseLabel(order.licenseType) }}</span>
                <span>授权期限：待确认</span>
                <span><span class="tag" :class="state(orderStatus, order.status).tone">{{ state(orderStatus, order.status).label }}</span> {{ NOT_OPEN }}</span>
                <button class="btn ghost small" style="margin-top:8px" @click="$emit('open-contract', order)">查看合同详情</button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import InquiryPanel from './trade/InquiryPanel.vue'
import TradeSessionPanel from './trade/TradeSessionPanel.vue'
import OrderPanel from './trade/OrderPanel.vue'
import { usePortal } from '../utils/portal.js'
import { NOT_OPEN, licenseLabel, money, orderStatus, state } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, panel: { type: String, default: 'inquiry' } })
const emit = defineEmits(['close', 'open-order', 'open-contract', 'open-conversation', 'read'])
const { api, handleError } = usePortal()
const local = ref(props.panel)
const panel = computed({ get: () => local.value, set: value => { local.value = value } })
const inquiryPanel = ref(null)
const sessionPanel = ref(null)
const orderPanel = ref(null)
const focusInquiryId = ref(null)
const contractOrders = ref([])
const tabs = computed(() => [
  { key: 'inquiry', label: '询盘' },
  { key: 'session', label: '会话' },
  { key: 'order', label: '订单' },
  { key: 'contract', label: '合同' }
])

function switchPanel(key) {
  panel.value = key
  loadPanel(key)
}

function loadPanel(key) {
  if (key === 'inquiry') inquiryPanel.value?.load()
  else if (key === 'order') orderPanel.value?.load()
  else if (key === 'contract') loadContractOrders()
  // session 面板自管理：打开 Tab 时由 focusInquiryId 或既有逻辑加载
}

async function loadContractOrders() {
  if (contractOrders.value.length) return
  try { contractOrders.value = (await api.value.listOrders({ pageSize: 50 })).list } catch { contractOrders.value = [] }
}

// 询盘展开区「进入/创建交易会话」：无会话先创建，再切到会话 Tab 定位该询盘。
async function openSessionForInquiry(inq) {
  try {
    if (!inq._hasSession) {
      await api.value.createInquiryChatSession(inq.inquiryId)
      inq._hasSession = true
    }
    focusInquiryId.value = inq.inquiryId
    panel.value = 'session'
    await sessionPanel.value?.load()
  } catch (failure) { await handleError(failure) }
}

// 会话内接受报价生成订单 / 订单付款收货后：联动刷新询盘与订单列表。
function onTradeChanged() {
  inquiryPanel.value?.load()
  orderPanel.value?.load()
}

function closeOnBg() { /* 原型 closeOnBg 是空实现：点击遮罩不关闭。 */ }
watch(() => props.panel, value => { local.value = value })
watch(() => props.open, open => {
  if (open) {
    local.value = props.panel
    loadPanel(local.value)
    if (local.value === 'session') sessionPanel.value?.load()
  }
}, { immediate: true })
defineExpose({ load: () => loadPanel(local.value) })
</script>
<style scoped>
/* 抽屉改 flex 列布局：Tabs 固定，面板区撑满剩余高度并各自滚动（对齐卖方端）。 */
.drawer { display: flex; flex-direction: column; overflow: hidden }
.drawer-body { flex: 1; min-height: 0; padding: 16px 20px; overflow: hidden; display: flex; flex-direction: column }
.panel-host { flex: 1; min-height: 0 }
.panel-host.panel-host { overflow-y: auto }
.drawer-body :deep(.session-layout) { height: 100% }
</style>
