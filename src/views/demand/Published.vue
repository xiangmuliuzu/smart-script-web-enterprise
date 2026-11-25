<template>
  <div class="demand-page">
    <DemandTabs />
    <div class="page-head">
      <p class="page-note">
        这里是你发布的任务。任务提交后先进入平台审核，审核通过才出现在任务广场并可被接单；
        审核未通过会附带审核意见，改完重新提交即可回到待审核。
        逐轮验收、延时与停止征集都由平台运营在管理端操作，本端只提供进度查看与最终交付物查阅。
      </p>
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
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" @open="goDetail">
      <button class="btn ghost small" @click.stop="goDetail(item.demandId)">查看详情</button>
      <!-- 编辑重交只在审核阶段开放：审核通过（open）后单子归平台运营处理，后端也会 400 拒绝 -->
      <button v-if="canEdit(item)" class="btn light small" @click.stop="goEdit(item.demandId)">
        {{ item.status === 'rejected' ? '修改并重新提交' : '编辑' }}
      </button>
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
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import DemandCard from '../../components/demand/DemandCard.vue'
import { demandStatusOptions, taskTypeOptions, isAuditState } from '../../utils/demand.js'
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
// 编辑口径与后端 updateDemandByBuyer 一致：待审核可改，审核未通过改完自动重交；
// 审核通过（open）及之后一律不可编辑，本端不给入口，避免点了才吃 400。
const canEdit = item => isAuditState(item.status)
function goDetail(id) { router.push(`/demand/${id}`) }
function goEdit(id) { router.push(`/demand/${id}/edit`) }
async function load() {
  pending.value = true; error.value = ''
  try {
    // listMyDemands 内部固定 mine=published，返回审核态全量；这里绝不再按 open 过滤
    const result = await api.value.listMyDemands({
      status: filters.status || undefined,
      taskType: filters.taskType || undefined,
      keyword: filters.keyword?.trim() || undefined,
      pageNum: pageNum.value, pageSize: PAGE_SIZE,
    })
    list.value = result.list; total.value = result.total
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
function applyFilters() { pageNum.value = 1; load() }
function resetFilters() { Object.assign(filters, { status: '', taskType: '', keyword: '' }); applyFilters() }
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
onMounted(() => {
  // 详情页返回列表时保留原有筛选条件
  if (route.query.status) filters.status = String(route.query.status)
  load()
})
</script>
<style scoped>
.demand-page { padding: 0 0 30px }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 18px 0 4px }
/* 提示条沿用全站赭石色系 note，与采购工作台同口径 */
.page-note { margin: 0; flex: 1; padding: 10px 14px; border-left: 3px solid var(--gold); background: var(--goldsoft); color: #6b4e19; font-size: 12.5px; line-height: 1.7 }
.page-head .btn { flex: none }
.filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin: 16px 0 14px }
.filters .field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted) }
.filters .field input, .filters .field select { padding: 7px 10px; border: 1px solid #c9c4b8; border-radius: var(--r); font-size: 13.5px; background: transparent; color: var(--ink); min-width: 140px }
.filters .btn { height: 34px }
.empty-text { font-size: 13px; color: var(--muted) }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px }
.pager-text { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
</style>
