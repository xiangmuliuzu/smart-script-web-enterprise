<template>
  <div id="drawer-trade" class="drawer-bg" :data-open="open" @click.self="closeOnBg">
    <aside class="drawer">
      <div class="drawer-head">
        <h2>交易中心</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="drawer-body">
        <p class="rights-note">询盘、报价、合同和线下谈判记录统一在交易中心管理；需要时可直接联系管理员或相关作品作者。</p>
        <div class="trade-tabs">
          <button v-for="tab in tabs" :key="tab.key" :data-trade="tab.key" :data-active="String(panel === tab.key)" @click="panel = tab.key">
            {{ tab.label }} <span v-if="tab.count" class="badge">{{ tab.count }}</span>
          </button>
        </div>

        <div class="trade-section" data-trade-panel="inquiry" :data-active="String(panel === 'inquiry')">
          <div class="section-panel">
            <div class="section-head">
              <h3>询盘与议价</h3>
              <span>问价格、讨价还价统一在这里完成</span>
            </div>
            <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
            <LoadState v-else-if="!inquiries.length" empty empty-text="暂无询盘。" />
            <ul v-else class="side-list">
              <li v-for="inquiry in inquiries" :key="inquiry.inquiryId">
                <b>《{{ inquiry.workTitle || inquiry.workId }}》 · {{ inquiry.sellerName || '作者待确认' }}</b>
                <span>{{ inquiryNote(inquiry) }}</span>
                <!-- 只有卖方已报价才允许买方议价，避免提交后端必然拒绝的请求。 -->
                <template v-if="latestOf(inquiry)">
                  <div class="field">
                    <label>发送报价或还价</label>
                    <input v-model="offers[inquiry.inquiryId]" :placeholder="'当前报价 ' + money(latestOf(inquiry).price) + '，输入你的还价'">
                  </div>
                  <button class="btn small" style="margin-top:8px" :disabled="busy === inquiry.inquiryId" @click="submitOffer(inquiry)">发送议价</button>
                  <button class="btn ghost small" style="margin-top:8px" @click="$emit('open-conversation', inquiry)">打开沟通</button>
                </template>
                <p v-else class="rights-note">作者尚未报价，可先打开沟通说明采购需求。</p>
              </li>
            </ul>
          </div>
        </div>

        <div class="trade-section" data-trade-panel="order" :data-active="String(panel === 'order')">
          <div class="section-panel">
            <div class="section-head">
              <h3>订单履行</h3>
              <span>跟进交付</span>
            </div>
            <LoadState v-if="!orders.length" empty empty-text="暂无采购订单。" />
            <ul v-else class="side-list">
              <li v-for="order in orders" :key="order.orderId">
                <b>{{ order.orderNo }} · 《{{ order.workTitle || order.workId }}》</b>
                <span>{{ money(order.amount) }} · {{ licenseLabel(order.licenseType) }} · {{ state(orderStatus, order.status).label }}</span>
                <button class="btn ghost small" style="margin-top:8px" @click="$emit('open-order', order)">查看订单</button>
              </li>
            </ul>
          </div>
        </div>

        <div class="trade-section" data-trade-panel="contract" :data-active="String(panel === 'contract')">
          <div class="section-panel">
            <div class="section-head">
              <h3>合同管理</h3>
              <span>合同信息与签署流程</span>
            </div>
            <!-- 后端没有用户侧合同接口：只呈现订单能确证的信息，签署入口按未开放处理。 -->
            <LoadState v-if="!orders.length" empty empty-text="暂无合同，订单生成后可在此查看。" />
            <ul v-else class="side-list">
              <li v-for="order in orders" :key="order.orderId" class="interactive-side-item" tabindex="0">
                <b>{{ order.orderNo }} · 《{{ order.workTitle || order.workId }}》</b>
                <span>合同金额：{{ money(order.amount) }} · {{ licenseLabel(order.licenseType) }}</span>
                <span>授权期限：待确认</span>
                <span><span class="tag" :class="state(orderStatus, order.status).tone">{{ state(orderStatus, order.status).label }}</span> {{ NOT_OPEN }}</span>
                <button class="btn ghost small" style="margin-top:8px" @click="$emit('open-contract', order)">查看合同详情</button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { NOT_OPEN, NOT_OPEN_NOTE, licenseLabel, money, orderStatus, state } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean, panel: { type: String, default: 'inquiry' } })
defineEmits(['close', 'open-order', 'open-contract', 'open-conversation', 'read'])
const { api, handleError } = usePortal()
const pending = ref(true)
const error = ref('')
const orders = ref([])
const inquiries = ref([])
const quotes = ref({})
const offers = ref({})
const busy = ref(null)
// 报价页签在原型最终态已被脚本删除，这里保持询盘/订单/合同三项。
const local = ref(props.panel)
const panel = computed({ get: () => local.value, set: value => { local.value = value } })
const tabs = computed(() => [
  { key: 'inquiry', label: '询盘', count: inquiries.value.length || 0 },
  { key: 'order', label: '订单' },
  { key: 'contract', label: '合同' }
])
const latestOf = inquiry => quotes.value[inquiry.inquiryId] || null

function inquiryNote(inquiry) {
  const quote = latestOf(inquiry)
  if (quote) return `当前报价：${money(quote.price)} · ${licenseLabel(quote.licenseType)} · ${state({ pending: { label: '待作者确认' }, pending_seller: { label: '待你确认' }, accepted: { label: '已接受' } }, quote.status, '进行中').label}`
  return inquiry.message || '已提交采购需求，等待作者报价'
}
async function load() {
  pending.value = true
  error.value = ''
  try {
    const [orderResult, inquiryResult] = await Promise.all([
      api.value.listOrders({ pageSize: 50 }),
      api.value.listInquiries({ pageSize: 50 })
    ])
    orders.value = orderResult.list
    inquiries.value = inquiryResult.list
    const pairs = await Promise.all(inquiries.value.map(async inquiry => [inquiry.inquiryId, await api.value.latestQuote(inquiry.inquiryId).catch(() => null)]))
    quotes.value = Object.fromEntries(pairs.filter(([, quote]) => quote))
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载交易数据失败'
  } finally { pending.value = false }
}
// 买方议价：POST /counter-offer。界面按「元」输入，交易域接口已统一以「分」收发。
async function submitOffer(inquiry) {
  const price = Number(offers.value[inquiry.inquiryId])
  if (!price || price <= 0) { ElMessage.warning('请输入有效的还价金额'); return }
  busy.value = inquiry.inquiryId
  try {
    await api.value.counterOffer({ inquiryId: inquiry.inquiryId, price: Math.round(price * 100), licenseType: inquiry.licenseType, description: offers.value[inquiry.inquiryId] })
    ElMessage.success('还价已提交，等待作者确认')
    offers.value[inquiry.inquiryId] = ''
    await load()
  } catch (failure) { handleError(failure) } finally { busy.value = null }
}
function closeOnBg() { /* 原型 closeOnBg 是空实现：点击遮罩不关闭。 */ }
watch(() => props.panel, value => { local.value = value })
watch(() => props.open, open => { if (open) { local.value = props.panel; load() } }, { immediate: true })
defineExpose({ load })
</script>
