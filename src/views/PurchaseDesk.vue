<template>
  <section class="view" id="view-dashboard" data-active="true">
    <div class="split">
      <section class="section-panel purchase-panel" id="purchase-section" data-grouped="true">
        <div class="section-head">
          <div>
            <h2>作品采购</h2>
            <span>购买中的作品优先展示，按交易日期排序</span>
          </div>
        </div>
        <div class="purchase-filter">
          <input id="purchase-search" v-model="filters.search" placeholder="搜索作品名称">
          <select id="purchase-auth-filter" v-model="filters.auth">
            <option value="all">全部授权类型</option>
            <option value="独家">独家授权</option>
            <option value="非独家">非独家授权</option>
          </select>
          <select id="purchase-status-filter" v-model="filters.status">
            <option value="all">全部购买状态</option>
            <option value="购买中">购买中</option>
            <option value="已购买">已购买</option>
          </select>
          <select id="purchase-genre-filter" v-model="filters.genre">
            <option value="all">全部作品类型</option>
            <option v-for="name in genres" :key="name" :value="name">{{ name }}</option>
          </select>
          <select id="purchase-sort" v-model="filters.sort">
            <option value="newest">交易日期：最新</option>
            <option value="oldest">交易日期：最早</option>
          </select>
          <span class="filter-count" id="purchase-filter-count">当前显示 {{ visibleCount }} 部作品</span>
        </div>
        <div class="purchase-view" data-purchase-view="all" data-active="true">
          <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
          <LoadState v-else-if="!cards.length" empty empty-text="暂无采购记录，询盘或订单生成后会出现在这里。" />
          <div v-else class="purchase-groups">
            <!-- 空分组由原型 CSS 的 .purchase-group[data-empty=true]{display:none} 隐藏，不重复控制。 -->
            <section v-for="group in visibleGroups" :key="group.key" class="purchase-group" :data-group="group.key" :data-empty="String(!group.cards.length)">
              <div class="purchase-group-head">
                <h3>{{ group.title }}</h3>
                <span>{{ group.note }}</span>
              </div>
              <div class="purchase-grid">
                <article v-for="card in group.cards" :key="card.key" class="purchase-card" role="button" tabindex="0"
                         :data-title="card.title" :data-genre="card.genre" :data-auth="card.auth" :data-status="card.status" :data-date="card.date"
                         @click="$emit('open-work', card)"
                         @keydown.enter.prevent="$emit('open-work', card)" @keydown.space.prevent="$emit('open-work', card)">
                  <div class="purchase-card-top">
                    <div class="purchase-cover-area">
                      <img v-if="card.cover && !brokenCovers[card.cover]" :src="card.cover" alt="" @error="brokenCovers[card.cover] = true">
                      <div v-else class="work-avatar">{{ card.mark }}</div>
                      <span class="purchase-status" :class="{ pending: card.status === '购买中' }">{{ card.status }}</span>
                    </div>
                    <div class="purchase-summary">
                      <h3>{{ card.title }}</h3>
                      <div class="work-type">{{ card.workType }}</div>
                      <p>{{ card.summary }}</p>
                    </div>
                  </div>
                  <div class="purchase-card-foot">
                    <span>{{ card.dateLabel }}</span>
                    <strong>{{ card.foot }}</strong>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </section>

      <aside>
        <div class="side-panel">
          <div class="side-head">
            <h3>待处理事项</h3>
            <span v-if="!todoPending && !todoError" class="tag red">{{ todos.length }} 项</span>
          </div>
          <LoadState :pending="todoPending" :error="todoError" :retry="loadTodo" />
          <ul v-if="!todoError" class="side-list">
            <li v-for="order in todos" :key="order.orderId" class="interactive-side-item order-todo" role="button" tabindex="0"
                @click="$emit('open-order', order.orderId)" @keydown.enter.prevent="$emit('open-order', order.orderId)" @keydown.space.prevent="$emit('open-order', order.orderId)">
              <div class="todo-order-head"><b>《{{ order.workTitle || '订单#' + order.orderId }}》</b><em>{{ state(orderStatus, order.status).label }}</em></div>
              <span>订单号：{{ order.orderNo || '#' + order.orderId }} · {{ money(order.amount) }}</span>
              <div class="todo-progress"><span v-for="(step, i) in orderSteps" :key="step" :class="{ active: orderStepIndex(order.status) >= i }">{{ step }}</span></div>
            </li>
          </ul>
          <p v-if="!todoPending && !todoError && !todos.length" class="todo-empty">暂无待处理订单。</p>
        </div>
        <details class="side-panel activity activity-list">
          <summary class="side-head">
            <h3>采购动态</h3>
            <span>最近 7 天</span>
          </summary>
          <ul class="side-list">
            <li v-for="item in activities" :key="item.key" class="interactive-side-item" tabindex="0"
                @click="$emit('open-trade', item.tab || 'order')" @keydown.enter.prevent="$emit('open-trade', item.tab || 'order')">
              <b>{{ item.title }}</b>
              <span>{{ item.note }}</span>
            </li>
          </ul>
        </details>
      </aside>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import LoadState from '../components/LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { avatarText, avatarUrl, inquiryProgressText, licenseLabel, money, relativeText, state, inquiryStatus, orderStatus } from '../utils/enterprise.js'
import { loadTodoOrders, orderSteps, orderStepIndex } from '../utils/orderTodo.js'
defineEmits(['open-work', 'open-trade', 'open-order'])
const { api, handleError } = usePortal()
const pending = ref(true)
const error = ref('')
const orders = ref([])
const inquiries = ref([])
const quotes = ref([])
const todos = ref([])
const todoPending = ref(true)
const todoError = ref('')
const works = ref({})
const brokenCovers = reactive({})
const filters = reactive({ search: '', auth: 'all', status: 'all', genre: 'all', sort: 'newest' })

const genres = computed(() => [...new Set(Object.values(works.value).map(w => w.genreName).filter(Boolean))])
// 卡片只写入能从接口确证的字段；缺失的按占位显示，不用演示数据补。
function buildCards() {
  const cards = []
  for (const order of orders.value) {
    const work = works.value[order.workId] || {}
    const amount = money(order.amount)
    cards.push({
      key: 'order-' + order.orderId, workId: order.workId, title: order.workTitle || '作品 #' + order.workId,
      mark: avatarText(order.workTitle), cover: avatarUrl(order.workCover || work.cover),
      genre: work.genreName || '题材待确认', auth: order.licenseType === 'exclusive' ? '独家' : '非独家',
      status: '已购买', date: (order.createdAt || '').slice(0, 10), source: 'order', id: order.orderId,
      licenseType: order.licenseType, amount: order.amount, order, orderStatus: order.status,
      hasQuote: quotes.value.some(q => String(q.inquiryId) === String(order.inquiryId)),
      workType: [work.genreName, licenseLabel(order.licenseType)].filter(Boolean).join(' · '),
      summary: work.summary || '已生成采购订单，可在订单中查看状态与交付进度。',
      dateLabel: '交易日期：' + (order.createdAt || '').slice(0, 10),
      foot: amount
    })
  }
  for (const inquiry of inquiries.value) {
    const work = works.value[inquiry.workId] || {}
    const quote = quotes.value.find(q => String(q.inquiryId) === String(inquiry.inquiryId) && q.status !== 'rejected')
    cards.push({
      key: 'inquiry-' + inquiry.inquiryId, workId: inquiry.workId, title: inquiry.workTitle || '作品 #' + inquiry.workId,
      mark: avatarText(inquiry.workTitle), cover: avatarUrl(inquiry.workCover || work.cover),
      genre: work.genreName || '题材待确认', auth: inquiry.licenseType === 'exclusive' ? '独家' : '非独家',
      status: '购买中', date: (inquiry.createdAt || '').slice(0, 10), source: 'inquiry', id: inquiry.inquiryId,
      licenseType: inquiry.licenseType, amount: quote?.price, hasQuote: !!quote,
      workType: [work.genreName, licenseLabel(inquiry.licenseType)].filter(Boolean).join(' · '),
      summary: work.summary || inquiry.message || '已提交合作询盘，正在与作者确认采购条件。',
      dateLabel: '交易发起日期：' + (inquiry.createdAt || '').slice(0, 10),
      foot: quote ? money(quote.price) : inquiryProgressText(inquiry.status)
    })
  }
  return cards
}
const cards = ref([])
const visibleGroups = computed(() => {
  const all = cards.value
  const query = filters.search.trim().toLowerCase()
  const filtered = all.filter(card =>
    (!query || card.title.toLowerCase().includes(query)) &&
    (filters.auth === 'all' || card.auth === filters.auth) &&
    (filters.status === 'all' || card.status === filters.status) &&
    (filters.genre === 'all' || card.genre === filters.genre))
  // 原型：购买中优先，组内按交易日期排序。
  const order = (a, b) => filters.sort === 'oldest' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date))
  const group = (key, title, note) => ({ key, title, note, cards: filtered.filter(c => (key === 'pending') === (c.status === '购买中')).sort(order) })
  return [group('pending', '购买中', '正在确认报价、合同或交付'), group('purchased', '已购买作品', '已完成授权的作品')]
})
const visibleCount = computed(() => visibleGroups.value.reduce((total, group) => total + group.cards.length, 0))

async function loadTodo() {
  todoPending.value = true; todoError.value = ''
  try { todos.value = await loadTodoOrders(api.value) }
  catch (failure) { if (!handleError(failure, { silent: true })) todoError.value = failure.message || '订单加载失败' }
  finally { todoPending.value = false }
}
const activities = computed(() => {
  const rows = [
    ...orders.value.map(o => ({ at: o.updatedAt || o.createdAt, kind: 'order', title: '《' + (o.workTitle || o.orderNo) + '》订单状态更新', note: state(orderStatus, o.status).label })),
    ...inquiries.value.map(i => ({ at: i.updatedAt || i.createdAt, kind: 'inquiry', title: '《' + (i.workTitle || i.workId) + '》询盘状态更新', note: state(inquiryStatus, i.status).label }))
  ].filter(row => row.at)
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3)
    .map((row, index) => ({ key: row.kind + '-' + index, tab: row.kind === 'order' ? 'order' : 'inquiry', title: row.title, note: relativeText(row.at) + ' · ' + row.note }))
})
async function load() {
  pending.value = true
  error.value = ''
  try {
    const [orderResult, inquiryResult, workResult] = await Promise.all([
      api.value.listOrders({ pageSize: 50 }),
      api.value.listInquiries({ pageSize: 50 }),
      api.value.listWorks({ pageSize: 50 }).catch(() => ({ list: [] }))
    ])
    orders.value = orderResult.list
    inquiries.value = inquiryResult.list
    works.value = Object.fromEntries(workResult.list.map(work => [work.workId, work]))
    // 报价按询盘逐个取最新一条，避免列表接口没有批量入口。
    const quotesResult = await Promise.all(inquiries.value.map(i => api.value.latestQuote(i.inquiryId).catch(() => null)))
    quotes.value = quotesResult.filter(Boolean)
    cards.value = buildCards()
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载采购数据失败'
  } finally { pending.value = false }
}
onMounted(() => { load(); loadTodo() })
defineExpose({ load, loadTodo })
</script>
<style scoped>
.activity-list summary { cursor: pointer; list-style: none; }
.activity-list summary::-webkit-details-marker { display: none; }
.activity-list summary span { margin-left: auto; }
.activity-list summary::after { content: '⌄'; color: var(--muted); font-size: 16px; }
.activity-list[open] summary::after { transform: rotate(180deg); }
.activity-list summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.todo-order-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.todo-order-head b { min-width: 0; overflow-wrap: anywhere; }
.todo-order-head em { flex: none; border-radius: 10px; padding: 2px 7px; background: #ecf5ff; color: #409eff; font-size: 12px; font-style: normal; }
.todo-progress { display: flex; gap: 3px; margin-top: 10px; }
.todo-progress span { flex: 1; margin: 0; border-top: 2px solid #e4e7ed; padding-top: 4px; text-align: center; font-size: 10px; color: #909399; }
.todo-progress span.active { border-color: #409eff; color: #409eff; }
.todo-empty { color: var(--muted); font-size: 13px; }
</style>
