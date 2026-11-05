<template>
  <div class="demand-page">
    <DemandTabs />
    <div class="hero">
      <div class="hero-item"><b>{{ stats.availableCount ?? '-' }}</b><span>在招任务</span></div>
      <div class="hero-item"><b>{{ prizePoolText }}</b><span>在途奖池</span></div>
      <div class="hero-item"><b>{{ stats.todayNewCount ?? '-' }}</b><span>今日新发布</span></div>
    </div>
    <p class="page-note">任务广场是市场行情，只读展示「征集中且发布者已完成托管付款」的任务。你要发起创作需求请在「我发布的」里发布任务。</p>

    <div class="chips">
      <button type="button" class="chip-genre" :data-on="!filters.genreId" @click="pickGenre(null)">全部题材<em>{{ genreCounts.all ?? 0 }}</em></button>
      <button v-for="option in genreOptions" :key="option.value" type="button" class="chip-genre" :data-on="Number(filters.genreId) === option.value" @click="pickGenre(option.value)">
        {{ option.label }}<em>{{ genreCounts[option.value] || 0 }}</em>
      </button>
    </div>

    <form class="filters" @submit.prevent="applyFilters">
      <label class="field">搜索<input v-model="filters.keyword" type="search" placeholder="标题或任务编号"></label>
      <label class="field">预算下限（元）<input v-model.number="filters.budgetMinYuan" type="number" min="0" placeholder="0"></label>
      <label class="field">预算上限（元）<input v-model.number="filters.budgetMaxYuan" type="number" min="0" placeholder="不限"></label>
      <label class="field">最少集数<input v-model.number="filters.episodesMin" type="number" min="0" placeholder="不限"></label>
      <label class="field">排序
        <select v-model="filters.sort">
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button class="btn small" type="submit">筛选</button>
      <button class="btn ghost small" type="button" @click="resetFilters">清空</button>
    </form>

    <LoadState :pending="pending" :error="error" :retry="load" />
    <p v-if="!pending && !error && !list.length" class="empty-text">当前条件下暂无在招任务</p>
    <DemandCard v-for="item in list" :key="item.demandId" :demand="item" mode="square" @open="goDetail">
      <button class="btn ghost small" @click.stop="goDetail(item.demandId)">查看</button>
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
import { money, genreOptions, SORT_OPTIONS } from '../../utils/demand.js'
const { api, handleError } = usePortal()
const router = useRouter()
const route = useRoute()
const PAGE_SIZE = 10
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pending = ref(false)
const error = ref('')
const stats = ref({})
const filters = reactive({ keyword: '', genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null, sort: 'created:desc' })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
// 奖池口径与列表一致（公开可接单），后端给的是分
const prizePoolText = computed(() => money(stats.value.prizePoolFen))
// 题材角标直接用后端的 genreCounts（按 genreId 聚合），字典只负责取名
const genreCounts = computed(() => {
  const map = { all: Number(stats.value.availableCount) || 0 }
  for (const row of stats.value.genreCounts || []) map[Number(row.genreId)] = Number(row.count) || 0
  return map
})
function goDetail(id) { router.push(`/demand/${id}`) }
async function load() {
  pending.value = true; error.value = ''
  const [sortBy, order] = String(filters.sort).split(':')
  // budgetMin/Max 后端按「分」接收后转元与库中预算比较，所以这里元 → 分
  const toFen = value => (Number(value) > 0 ? Math.round(Number(value) * 100) : undefined)
  try {
    const result = await api.value.listDemands({
      genreId: filters.genreId || undefined,
      keyword: filters.keyword?.trim() || undefined,
      sortBy, order,
      budgetMin: toFen(filters.budgetMinYuan), budgetMax: toFen(filters.budgetMaxYuan),
      episodesMin: Number(filters.episodesMin) > 0 ? Number(filters.episodesMin) : undefined,
      pageNum: pageNum.value, pageSize: PAGE_SIZE,
    })
    list.value = result.list; total.value = result.total
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadMeta() {
  try { stats.value = await api.value.demandStats() || {} } catch { stats.value = {} }
}
function applyFilters() { pageNum.value = 1; load() }
function pickGenre(genreId) { filters.genreId = genreId; applyFilters() }
function resetFilters() {
  Object.assign(filters, { keyword: '', genreId: null, budgetMinYuan: null, budgetMaxYuan: null, episodesMin: null, sort: 'created:desc' })
  applyFilters()
}
function turn(offset) {
  const next = pageNum.value + offset
  if (next < 1 || next > pageCount.value) return
  pageNum.value = next; load()
}
onMounted(async () => {
  // 顶栏页签切回广场时带上 keyword（如从详情页返回），沿用已填条件重查
  if (route.query.keyword) filters.keyword = String(route.query.keyword)
  await Promise.all([loadMeta(), load()])
})
</script>
<style scoped>
.demand-page { padding: 4px 0 24px }
.hero { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px }
.hero-item { flex: 1 1 150px; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 14px; background: #fff }
.hero-item b { display: block; font-size: 21px; color: #409eff }
.hero-item span { font-size: 12px; color: #909399 }
.page-note { margin: 0 0 12px; padding: 9px 12px; border-radius: 6px; background: #f5f7fa; color: #909399; font-size: 12.5px }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 4px }
.chip-genre { border: 1px solid #dcdfe6; background: #fff; border-radius: 14px; padding: 4px 12px; font-size: 12.5px; color: #606266; cursor: pointer }
.chip-genre em { font-style: normal; margin-left: 5px; color: #f56c6c; font-weight: 600 }
.chip-genre[data-on="true"] { border-color: #409eff; color: #409eff; background: #ecf5ff }
.filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin: 12px 0 14px }
.filters .field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #606266 }
.filters .field input, .filters .field select { padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; min-width: 120px }
.empty-text { font-size: 13px; color: #909399 }
.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px }
.pager-text { font-size: 12px; color: #909399 }
</style>
