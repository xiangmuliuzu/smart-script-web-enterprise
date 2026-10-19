<template>
  <div class="panel-wrap">
    <div class="filter-bar">
      <select v-model="statusFilter" class="filter-select" @change="pageNum = 1; load()">
        <option value="">全部状态</option>
        <option value="confirmed">已确认</option>
        <option value="escrow_pending">已托管</option>
        <option value="delivering">交割中</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
        <option value="refunded">已退款</option>
      </select>
    </div>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <div v-if="!pending && !error && !orders.length" class="load-state"><p>暂无采购订单</p></div>
    <div v-for="o in orders" :key="o.orderId" class="order-card">
      <div class="order-cover">
        <img v-if="o.workCover" :src="o.workCover" alt="" />
        <span v-else class="glyph">{{ (o.workTitle || '订').slice(0, 1) }}</span>
      </div>
      <div class="order-body">
        <div class="order-top">
          <b>{{ o.workTitle || '订单#' + o.orderId }}</b>
          <span class="status-tag" :class="'tag-' + o.status">{{ state(orderStatus, o.status).label }}</span>
        </div>
        <p class="order-meta">订单号：{{ o.orderNo || '#' + o.orderId }} · 作者：{{ o.sellerName || o.sellerId }}</p>
        <p class="order-meta">金额：{{ money(o.amount) }} · 授权：{{ licenseLabel(o.licenseType) }}</p>
        <p v-if="o.status === 'cancelled' && o.remark" class="order-meta">取消原因：{{ o.remark }}</p>
        <div class="order-progress">
          <div v-for="(step, i) in steps" :key="step.key" class="progress-step" :class="{ active: progressIndex(o) >= i, current: progressIndex(o) === i, terminated: isTerminal(o) && progressIndex(o) < i }">
            <span class="progress-dot"></span>
            <span class="progress-label">{{ step.label }}</span>
          </div>
        </div>
        <div v-if="isTerminal(o)" class="terminal-bar">{{ terminalLabel(o) }}</div>
        <div class="order-foot">
          <span class="cost">创建于 {{ dateText(o.createdAt) }}</span>
          <span class="foot-actions">
            <button v-if="o.status === 'confirmed'" class="btn sm" :disabled="busy === o.orderId" @click="doPay(o)">付款到托管</button>
            <button v-if="o.status === 'confirmed'" class="btn sm ghost" :disabled="busy === o.orderId" @click="doCancel(o)">取消订单</button>
            <button v-if="o.status === 'delivering'" class="btn sm" :disabled="busy === o.orderId" @click="doComplete(o)">确认收货</button>
          </span>
        </div>
      </div>
    </div>
    <div v-if="total > PAGE_SIZE" class="pagination-bar">
      <button class="btn sm ghost" :disabled="pageNum <= 1" @click="pageNum--; load()">上一页</button>
      <span class="cost">第 {{ pageNum }} 页 / 共 {{ Math.ceil(total / PAGE_SIZE) }} 页</span>
      <button class="btn sm ghost" :disabled="pageNum * PAGE_SIZE >= total" @click="pageNum++; load()">下一页</button>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadState from '../LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { dateText, licenseLabel, money, orderStatus, state } from '../../utils/enterprise.js'

const PAGE_SIZE = 10
const emit = defineEmits(['changed'])
const { api, handleError } = usePortal()
const pending = ref(true)
const error = ref('')
const orders = ref([])
const statusFilter = ref('')
const pageNum = ref(1)
const total = ref(0)
const busy = ref(null)

const steps = [
  { key: 'confirmed', label: '已确认' },
  { key: 'escrow_pending', label: '已托管' },
  { key: 'delivering', label: '交割中' },
  { key: 'completed', label: '已完成' }
]
function progressIndex(o) {
  if (!o?.status) return -1
  return steps.findIndex(s => s.key === o.status)
}
function isTerminal(o) { return ['cancelled', 'refunded'].includes(o?.status) }
function terminalLabel(o) {
  if (o.status === 'cancelled') return '订单已取消' + (o.remark ? '：' + o.remark : '')
  if (o.status === 'refunded') return '订单已退款'
  return ''
}

async function load() {
  pending.value = true; error.value = ''
  try {
    const params = { pageNum: pageNum.value, pageSize: PAGE_SIZE }
    if (statusFilter.value) params.status = statusFilter.value
    const result = await api.value.listOrders(params)
    orders.value = result.list
    total.value = result.total
  } catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { pending.value = false }
}

// 付款到托管：confirmed → escrow_pending，资金进入平台托管账户。
async function doPay(o) {
  try {
    await ElMessageBox.confirm('付款后资金将进入平台托管，作者交割且你确认收货后才会释放给作者。确定付款吗？', '确认付款', { type: 'warning' })
    busy.value = o.orderId
    await api.value.payOrder(o.orderId)
    ElMessage.success('付款成功，资金已进入托管')
    o.status = 'escrow_pending'
    emit('changed')
  } catch (e) { if (e !== 'cancel') await handleError(e) }
  finally { busy.value = null }
}

// 确认收货：delivering → completed，托管资金释放给作者并写入作者收益。
async function doComplete(o) {
  try {
    await ElMessageBox.confirm('确认收货后托管资金将释放给作者，请确保已完成作品授权交付验收。确定吗？', '确认收货', { type: 'warning' })
    busy.value = o.orderId
    await api.value.completeOrder(o.orderId)
    ElMessage.success('已确认收货，订单完成')
    o.status = 'completed'
    emit('changed')
  } catch (e) { if (e !== 'cancel') await handleError(e) }
  finally { busy.value = null }
}

async function doCancel(o) {
  try {
    const { value } = await ElMessageBox.prompt('取消后订单将终止，托管中的资金将退回。可填写取消原因：', '取消订单', { type: 'warning', inputPlaceholder: '选填' })
    busy.value = o.orderId
    await api.value.cancelOrder(o.orderId, value || undefined)
    ElMessage.success('订单已取消')
    o.status = 'cancelled'
    o.remark = value || ''
    emit('changed')
  } catch (e) { if (e !== 'cancel') await handleError(e) }
  finally { busy.value = null }
}

defineExpose({ load })
</script>
<style scoped>
.panel-wrap { display: flex; flex-direction: column; min-height: 0 }
.filter-bar { display: flex; gap: 8px; margin-bottom: 10px }
.filter-select { padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff }
/* 订单平铺卡片：左封面右信息，常态展示全部内容 */
.order-card { display: flex; gap: 12px; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fff; transition: box-shadow .15s }
.order-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.order-cover { width: 108px; height: 146px; flex-shrink: 0; align-self: flex-start; border-radius: 4px; overflow: hidden; background: linear-gradient(160deg, #E9E5DA 0%, #DAD5C7 100%); display: grid; place-items: center; border: 1px solid #ebeef5 }
.order-cover img { width: 100%; height: 100%; object-fit: cover }
.order-cover .glyph { font-size: 32px; color: rgba(27,26,24,.18); font-weight: 600 }
.order-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.order-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.order-top b { font-size: 14px }
.order-meta { font-size: 12.5px; color: #606266; margin: 0 }
.order-progress { display: flex; align-items: center; gap: 0; margin: 10px 0 0; padding: 0 4px }
.progress-step { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative }
.progress-step:not(:last-child)::after { content: ''; position: absolute; top: 7px; left: 50%; width: 100%; height: 2px; background: #e4e7ed; z-index: 0 }
.progress-step.active:not(:last-child)::after { background: #409eff }
.progress-dot { width: 14px; height: 14px; border-radius: 50%; background: #e4e7ed; border: 2px solid #fff; z-index: 1; transition: background .2s }
.progress-step.active .progress-dot { background: #409eff }
.progress-step.current .progress-dot { background: #409eff; box-shadow: 0 0 0 3px rgba(64,158,255,.2) }
.progress-step.terminated .progress-dot { background: #e4e7ed }
.progress-label { font-size: 11.5px; color: #909399; margin-top: 5px }
.progress-step.active .progress-label { color: #409eff }
.terminal-bar { background: #fef0f0; color: #f56c6c; border-radius: 4px; padding: 8px 12px; font-size: 13px; margin-top: 8px }
.order-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px }
.order-foot .cost { font-size: 12px; color: #909399 }
.foot-actions { display: flex; gap: 8px }
.pagination-bar { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px }
.cost { color: #909399; font-size: 12px }
.load-state { padding: 24px 0; text-align: center; color: #909399; font-size: 13px }
.tag-confirmed, .tag-escrow_pending, .tag-delivering { background: #fdf6ec; color: #e6a23c }
.tag-completed { background: #f0f9eb; color: #67c23a }
.tag-cancelled, .tag-refunded { background: #fef0f0; color: #f56c6c }
</style>
