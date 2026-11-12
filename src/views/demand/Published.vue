<template>
  <div class="demand-page">
    <DemandTabs />
    <div class="page-head">
      <p class="page-note">这里是你发布的任务。任务仅支持接单制：创作者付押金接单后，在详情页逐轮验收放款。</p>
      <router-link class="btn" to="/demand/create">发布任务</router-link>
    </div>

    <div class="filters">
      <label class="field">状态
        <select v-model="filters.status" @change="applyFilters">
          <option value="">全部状态</option>
          <option v-for="option in demandStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="field">任务类型
        <select v-model="filters.taskType" @change="applyFilters">
          <option value="">全部类型</option>
          <option v-for="option in taskTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="field">搜索<input v-model="filters.keyword" type="search" placeholder="标题或任务编号" @keyup.enter="applyFilters"></label>
      <button class="btn small" type="button" @click="applyFilters">筛选</button>
      <button class="btn ghost small" type="button" @click="resetFilters">清空</button>
    </div>

    <LoadState :pending="pending" :error="error" :retry="load" />
    <p v-if="!pending && !error && !list.length" class="empty-text">你还没有发布过任务，点右上角「发布任务」发起一个创作需求。</p>
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" mode="published" @open="goDetail">
      <button class="btn ghost small" @click.stop="goDetail(item.demandId)">管理</button>
      <button v-if="canEdit(item)" class="btn light small" @click.stop="goEdit(item.demandId)">编辑</button>
      <button v-if="canPayEscrow(item)" class="btn small" @click.stop="goPayEscrow(item)">去付托管 {{ money(item.budget) }}</button>
      <button v-if="item.status === 'open'" class="btn ghost small danger" @click.stop="closeDemand(item)">关闭</button>
    </DemandCard>
    <div v-if="total > PAGE_SIZE" class="pager">
      <button class="btn ghost small" :disabled="pageNum <= 1" @click="turn(-1)">上一页</button>
      <span class="pager-text">第 {{ pageNum }} / {{ pageCount }} 页 · 共 {{ total }} 条</span>
      <button class="btn ghost small" :disabled="pageNum >= pageCount" @click="turn(1)">下一页</button>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import DemandCard from '../../components/demand/DemandCard.vue'
import { money, demandStatusOptions, taskTypeOptions } from '../../utils/demand.js'
const { api, handleError } = usePortal()
const router = useRouter()
const route = useRoute()
// 分页口径与 APP 及 API 默认值一致
const PAGE_SIZE = 20
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pending = ref(false)
const error = ref('')
const filters = reactive({ status: '', taskType: '', keyword: '' })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
// 编辑口径与后端 updateDemand 一致：仅征集中、且托管款尚未付出（已付的要关闭重发）
const canEdit = item => item.status === 'open' && !['escrowed', 'released'].includes(item.escrowStatus)
const canPayEscrow = item => item.status === 'open' && item.escrowStatus === 'pending_payment'
function goDetail(id) { router.push(`/demand/${id}`) }
function goEdit(id) { router.push(`/demand/${id}/edit`) }
// 托管付款只在详情页做（沙箱扫码为主、一键直通为备），列表只负责跳过去
function goPayEscrow(item) { router.push(`/demand/${item.demandId}`) }
async function load() {
  pending.value = true; error.value = ''
  try {
    const result = await api.value.listDemands({
      mine: 'published',
      status: filters.status || undefined,
      taskType: filters.taskType || undefined,
      keyword: filters.keyword?.trim() || undefined,
      pageNum: pageNum.value, pageSize: PAGE_SIZE,
    })
    list.value = result.list; total.value = result.total
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function closeDemand(item) {
  try {
    await ElMessageBox.confirm(
      '关闭后该任务停止征集且不可恢复，已付出的托管款不会自动退回（需联系客服走人工退款），押金由平台按规则退还创作者。确认关闭？',
      '关闭任务', { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '再想想' })
  } catch { return }
  try {
    await api.value.closeDemand(item.demandId)
    ElMessage.success('已关闭')
    await load()
  } catch (failure) { await handleError(failure) }
}
function applyFilters() { pageNum.value = 1; load() }
function resetFilters() { Object.assign(filters, { status: '', taskType: '', keyword: '' }); applyFilters() }
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
onMounted(() => {
  // 详情页支付完成返回列表时保留原有筛选条件
  if (route.query.status) filters.status = String(route.query.status)
  load()
})
</script>
<style scoped>
.demand-page { padding: 0 0 30px }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 18px 0 4px }
/* 提示条沿用用户端 .note 的赭石色系，不再用灰底圆角 */
.page-note { margin: 0; flex: 1; padding: 10px 14px; border-left: 3px solid var(--gold); background: var(--goldsoft); color: #6b4e19; font-size: 12.5px; line-height: 1.7 }
.page-head .btn { flex: none }
.filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin: 16px 0 14px }
.filters .field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted) }
.filters .field input, .filters .field select { padding: 7px 10px; border: 1px solid #c9c4b8; border-radius: var(--r); font-size: 13.5px; background: transparent; color: var(--ink); min-width: 140px }
.filters .btn { height: 34px }
.empty-text { font-size: 13px; color: var(--muted) }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px }
.pager-text { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
.btn.danger { color: var(--red); border-color: #e3c3be }
</style>
