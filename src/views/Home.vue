<template>
  <div ref="homeScroll" class="market-home">
    <section class="market-hero" aria-labelledby="market-title">
      <div class="hero-copy">
        <div class="market-kicker"><span></span> 剧云策 · 版权采购</div>
        <p class="hero-pretitle">让好故事，走向下一程。</p>
        <h1 id="market-title">发现好剧本，<br />让<span>合作</span>开始。</h1>
        <p class="hero-description">
          从一段故事的心动，到一个项目的起点。<br />先读作品，再与作者沟通用途、价格和授权范围。
        </p>
        <form class="market-search" role="search" @submit.prevent="search">
          <label class="sr-only" for="market-keyword">搜索作品名称或关键词</label
          ><span aria-hidden="true">⌕</span
          ><input
            id="market-keyword"
            v-model="keyword"
            type="search"
            maxlength="100"
            placeholder="搜索作品名称或故事关键词"
          /><button type="submit">搜索作品 ↗</button>
        </form>
        <button class="browse-link" @click="browse">浏览推荐作品 <span>↓</span></button>
        <div class="hero-foot">
          <span>01 / 发现作品</span><i></i><span>02 / 章节试读</span><i></i
          ><span>03 / 询盘洽谈</span>
        </div>
      </div>
      <div class="hero-selection">
        <div class="selection-heading"><span>POPULAR STORIES · 热门榜</span><b>本期推荐</b></div>
        <LoadState
          v-if="hotPending || hotError"
          :pending="hotPending"
          :error="hotError"
          :retry="loadHot"
        />
        <div v-else-if="hot.length" class="hero-books">
          <button
            v-for="(work, index) in hot.slice(0, 3)"
            :key="work.workId"
            class="hero-book"
            @click="open(work)"
          >
            <MarketCover :work="work"
              ><span class="book-number">{{
                String(work.rankNo || index + 1).padStart(2, '0')
              }}</span></MarketCover
            ><span class="hero-book-title">{{ work.title }}</span
            ><small
              >热门榜第 {{ work.rankNo || index + 1 }} 名 ·
              {{ work.authorName || '平台创作者' }}</small
            >
          </button>
        </div>
        <div v-else class="hero-empty">
          推荐作品即将呈现<br /><small>也可以搜索感兴趣的故事。</small>
        </div>
        <div class="selection-note">
          <span>按浏览量排序，精选热门榜前三名。</span><b>READ. CONNECT. CREATE.</b>
        </div>
      </div>
    </section>
    <section ref="catalog" class="market-catalog" aria-labelledby="catalog-title">
      <header class="catalog-heading">
        <div>
          <p class="market-kicker">CURATED STORIES · 作品选集</p>
          <h2 id="catalog-title">
            {{ catalogTitle }}
          </h2>
          <p>
            {{ catalogDescription }}
          </p>
        </div>
        <button v-if="submittedKeyword || sort" class="reset-search" @click="resetSearch">
          返回推荐作品 ↗</button
        ><span v-else class="catalog-label"
          >推荐作品 /
          {{ total }} 部</span
        >
      </header>
      <form class="catalog-filter" @submit.prevent="search">
        <input
          v-model="keyword"
          type="search"
          maxlength="100"
          aria-label="搜索作品"
          placeholder="输入作品名称或关键词"
        /><button class="btn" type="submit">搜索</button
        ><label
          >排序<select v-model="sort" @change="changeSort">
            <option value="">
              {{ submittedKeyword ? '默认排序' : '精选顺序' }}
            </option>
            <option value="latest">最新发布</option>
          </select></label
        >
      </form>
      <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="loadWorks" />
      <div v-else-if="works.length" class="market-grid">
        <article v-for="work in works" :key="work.workId" class="market-card">
          <button class="card-cover-button" :aria-label="'查看' + work.title" @click="open(work)">
            <MarketCover :work="work" />
          </button>
          <div class="card-copy">
            <p class="work-genre">
              {{ workGenre(work) }}<span v-if="work.episodeCount">{{ work.episodeCount }} 集</span>
            </p>
            <h3>
              <button @click="open(work)">{{ work.title }}</button>
            </h3>
            <p class="work-author">{{ work.authorName || '平台创作者' }}</p>
            <p class="work-summary">{{ work.summary || '作者暂未填写简介，点击查看作品详情。' }}</p>
            <div class="card-actions">
              <button @click="open(work)">查看 · 试读 <span>↗</span></button
              ><button @click="open(work, 'inquiry')">发起询盘</button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="market-empty">
        <span>⌕</span>
        <h3>{{ submittedKeyword ? '暂未找到相关作品' : '暂无推荐作品' }}</h3>
        <p>
          {{
            submittedKeyword
              ? '试试其他关键词，或返回推荐作品浏览。'
              : '平台发布推荐后将在这里展示。'
          }}
        </p>
        <button v-if="submittedKeyword || sort" class="btn" @click="resetSearch">查看推荐</button>
      </div>
      <el-pagination
        v-if="submittedKeyword && total > pageSize && !pending && !error"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="loadWorks"
      />
      <footer class="catalog-footer">
        <strong>剧云策</strong
        ><span>先试读，后洽谈。授权范围与价格，以双方确认的交易信息为准。</span
        ><button @click="toTop">回到顶部 ↑</button>
      </footer>
    </section>
    <MarketWorkDialog
      v-if="activeWorkId"
      :key="activeWorkId + ':' + initialAction"
      :work-id="activeWorkId"
      :initial-action="initialAction"
      @close="closeWork"
      @created="created"
    />
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoadState from '../components/LoadState.vue'
import MarketCover from '../components/MarketCover.vue'
import MarketWorkDialog from '../components/MarketWorkDialog.vue'
import { usePortal } from '../utils/portal.js'
import { workGenre, marketWorksQuery, recommendedWorks } from '../utils/market.js'
const emit = defineEmits(['inquiry-created'])
const { api } = usePortal(),
  route = useRoute(),
  router = useRouter()
const hot = ref([]),
  hotPending = ref(false),
  hotError = ref('')
const works = ref([]),
  pending = ref(false),
  error = ref(''),
  total = ref(0),
  page = ref(1),
  pageSize = 12
const keyword = ref(''),
  submittedKeyword = ref(''),
  sort = ref(''),
  catalog = ref(null)
const homeScroll = ref(null)
const activeWorkId = ref(null),
  initialAction = ref('')
const catalogTitle = computed(() =>
  submittedKeyword.value ? '寻找与你契合的故事' : '值得一读，值得合作。'
)
const catalogDescription = computed(() =>
  submittedKeyword.value
    ? '“' + submittedKeyword.value + '” 的搜索结果，共 ' + total.value + ' 部作品'
    : sort.value
      ? '首页热门精选最多展示 20 部，按最新发布时间排列，点开即可试读。'
      : '精选首页热门作品，最多展示 20 部，点开即可了解故事与试读章节。'
)
let hotRun = 0,
  worksRun = 0
function browse() {
  const target = catalog.value,
    container = homeScroll.value
  if (!target || !container) return
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  if (container.scrollHeight > container.clientHeight) {
    container.scrollTo({ top: target.offsetTop - container.offsetTop, behavior })
  } else target.scrollIntoView({ behavior, block: 'start' })
}
function toTop() {
  document.querySelector('.market-home')?.scrollTo({ top: 0, behavior: 'smooth' })
}
async function loadHot() {
  const run = ++hotRun
  hotPending.value = true
  hotError.value = ''
  try {
    const result = await api.value.listHotRankings()
    if (run === hotRun) hot.value = result
  } catch (failure) {
    if (run === hotRun) hotError.value = failure.message
  } finally {
    if (run === hotRun) hotPending.value = false
  }
}
async function loadWorks() {
  const run = ++worksRun
  pending.value = true
  error.value = ''
  try {
    const result = await api.value.listWorks(
      marketWorksQuery({
        keyword: submittedKeyword.value,
        sort: sort.value,
        page: page.value,
        pageSize
      })
    )
    if (run !== worksRun) return
    works.value = submittedKeyword.value
      ? result.list
      : recommendedWorks(result.list, { sort: sort.value })
    total.value = submittedKeyword.value ? result.total : works.value.length
  } catch (failure) {
    if (run === worksRun) error.value = failure.message
  } finally {
    if (run === worksRun) pending.value = false
  }
}
function search() {
  submittedKeyword.value = keyword.value.trim()
  page.value = 1
  loadWorks()
  browse()
}
function resetSearch() {
  keyword.value = ''
  submittedKeyword.value = ''
  sort.value = ''
  page.value = 1
  loadWorks()
  browse()
}
function changeSort() {
  page.value = 1
  loadWorks()
}
function open(work, action = '') {
  router.replace({
    path: '/',
    query: { ...route.query, workId: String(work.workId), action: action || undefined }
  })
}
function closeWork() {
  const { workId, action, ...query } = route.query
  activeWorkId.value = null
  initialAction.value = ''
  router.replace({ path: '/', query })
}
function created(result) {
  closeWork()
  emit('inquiry-created', result)
}
watch(
  () => [route.query.workId, route.query.action],
  ([id, action]) => {
    activeWorkId.value = /^\d+$/.test(String(id || '')) ? String(id) : null
    initialAction.value = action === 'inquiry' ? 'inquiry' : ''
  },
  { immediate: true }
)
onMounted(() => {
  loadHot()
  loadWorks()
})
onBeforeUnmount(() => {
  ++hotRun
  ++worksRun
})
</script>
<style scoped>
.market-home {
  height: calc(100svh - 56px);
  overflow-y: auto;
  scroll-snap-type: y proximity;
  scroll-behavior: smooth;
  background: #f8f7f1;
  color: #26483f;
  scrollbar-color: #9eafa3 #f1f0e8;
}
.market-home button {
  cursor: pointer;
}
.market-hero {
  min-height: calc(100svh - 56px);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(26px, 4vw, 70px);
  padding: clamp(36px, 5vw, 80px) clamp(26px, 5vw, 90px) 30px;
  align-items: center;
  scroll-snap-align: start;
  background:
    radial-gradient(ellipse at 90% 25%, #e2ecdd 0, transparent 55%),
    linear-gradient(135deg, #f8f6ed, #f0f3e8);
}
.market-kicker {
  font-size: 12px;
  letter-spacing: 0.15em;
  color: #61776c;
  display: flex;
  gap: 10px;
  align-items: center;
}
.market-kicker > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8b9c65;
}
.hero-pretitle {
  font-size: 18px;
  margin: 35px 0 16px;
  color: #607064;
}
.market-hero h1 {
  font: 500 clamp(42px, 4.8vw, 78px)/1.22 var(--serif);
  letter-spacing: -0.04em;
  margin: 0 0 25px;
}
.market-hero h1 span {
  color: #a87935;
}
.hero-description {
  font-size: 17px;
  color: #5d7066;
  line-height: 1.9;
  margin-bottom: 30px;
}
.market-search {
  display: flex;
  align-items: center;
  background: #fffefa;
  border: 1px solid #b5c3b5;
  box-shadow: 0 10px 25px #344b3610;
  border-radius: 6px;
  padding: 7px;
  max-width: 620px;
}
.market-search > span {
  font-size: 30px;
  padding: 0 12px;
  color: #6a7d70;
}
.market-search input {
  width: 0;
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 16px;
  padding: 10px 0;
  color: #26483f;
}
.market-search:focus-within {
  outline: 2px solid #638674;
  outline-offset: 3px;
}
.market-search button {
  background: #2c5147;
  color: #fff;
  border: 0;
  border-radius: 3px;
  padding: 17px 22px;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
}
.browse-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  width: min(100%, 350px);
  min-height: 74px;
  padding: 17px 24px;
  margin-top: 24px;
  border: 1px solid #b17d35;
  border-radius: 6px;
  background: linear-gradient(120deg, #b78035, #cd9c51);
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  box-shadow: 0 9px 22px #a8793530;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.browse-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 13px 28px #a8793545;
}
.browse-link:focus-visible {
  outline: 3px solid #365b49;
  outline-offset: 4px;
}
.browse-link span {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid #ffffff70;
  border-radius: 50%;
  font-size: 24px;
}
.hero-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: #748272;
  margin-top: clamp(30px, 5vh, 65px);
}
.hero-foot i {
  height: 1px;
  flex: 1;
  background: #c8d0bd;
  max-width: 40px;
}
.hero-selection {
  min-width: 0;
  padding: 25px 0;
}
.selection-heading {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border-top: 1px solid #a8b8a5;
  padding-top: 18px;
  align-items: center;
  margin-bottom: 35px;
}
.selection-heading > span {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #6e806b;
}
.selection-heading > b {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}
.hero-books {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(12px, 1.5vw, 24px);
  padding-top: 15px;
  align-items: start;
}
.hero-book {
  border: 0;
  padding: 0;
  text-align: left;
  background: transparent;
  color: inherit;
  min-width: 0;
  transition: transform 0.25s;
}
.hero-book:nth-child(2) {
  margin-top: 38px;
}
.hero-book:nth-child(3) {
  margin-top: 76px;
}
.hero-book:hover {
  transform: translateY(-8px);
}
.hero-book .market-cover {
  box-shadow: 5px 15px 25px #38452b20;
}
.hero-book-title {
  display: block;
  margin-top: 16px;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-book > small {
  display: block;
  font-size: 12px;
  color: #78816e;
  margin-top: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-number {
  position: absolute;
  right: 9px;
  bottom: 9px;
  background: #fcf9efed;
  border-radius: 2px;
  padding: 4px 8px;
  font: 12px Georgia;
  color: #47604b;
}
.selection-note {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  border-top: 1px solid #c3cdb8;
  padding-top: 20px;
  margin-top: 40px;
  font-size: 12px;
  color: #78816e;
}
.selection-note b {
  font-size: 9px;
  letter-spacing: 0.12em;
  font-weight: 400;
}
.hero-empty {
  padding: 90px 20px;
  line-height: 2;
  text-align: center;
  color: #7d8870;
}
.market-catalog {
  scroll-snap-align: start;
  min-height: calc(100svh - 56px);
  padding: 55px clamp(26px, 5vw, 90px) 0;
  scroll-margin-top: 56px;
}
.catalog-heading {
  display: flex;
  justify-content: space-between;
  gap: 25px;
  align-items: flex-end;
}
.catalog-heading h2 {
  font: 500 clamp(28px, 3vw, 44px)/1.4 var(--serif);
  margin: 14px 0;
}
.catalog-heading p:last-child {
  font-size: 15px;
  color: #778074;
  line-height: 1.8;
}
.catalog-label {
  font-size: 13px;
  white-space: nowrap;
  color: #7e8b75;
  padding-bottom: 20px;
}
.reset-search {
  border: 0;
  background: transparent;
  color: #2c5147;
  font-size: 15px;
  white-space: nowrap;
  padding: 16px 0;
}
.catalog-filter {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 25px 0 30px;
  padding: 18px 0;
  border-top: 1px solid #d7ddcf;
  border-bottom: 1px solid #d7ddcf;
}
.catalog-filter input {
  font-size: 15px;
  max-width: 360px;
  min-width: 120px;
  width: 100%;
  background: white;
  border: 1px solid #d0d7c9;
  border-radius: 3px;
  padding: 12px;
}
.catalog-filter label {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #7a8573;
  white-space: nowrap;
}
.catalog-filter select {
  padding: 11px 16px;
  background: #f8f7f1;
  border: 1px solid #cdd5c4;
  color: #365748;
  font-size: 14px;
  border-radius: 3px;
}
.market-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}
.market-card {
  display: flex;
  gap: 20px;
  min-width: 0;
  padding: 20px;
  background: #fffef9;
  border: 1px solid #dce1d3;
  border-radius: 5px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.market-card:hover {
  border-color: #99b29e;
  box-shadow: 0 8px 22px #38452b0c;
}
.card-cover-button {
  flex: 0 0 32%;
  align-self: flex-start;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
}
.card-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.work-genre {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: #8b764f;
  margin: 1px 0 8px;
}
.market-card h3 {
  margin: 0;
  font: 600 20px/1.45 var(--serif);
  overflow: hidden;
}
.market-card h3 button {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: left;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  padding: 0;
}
.work-author {
  font-size: 12px;
  color: #858775;
  margin: 7px 0 10px;
}
.work-summary {
  font-size: 14px;
  color: #778071;
  line-height: 1.8;
  margin: 0 0 20px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-actions {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 13px;
  border-top: 1px solid #e8eadf;
}
.card-actions button {
  padding: 0;
  background: transparent;
  border: 0;
  color: #3e6552;
  font-size: 13px;
  white-space: nowrap;
}
.card-actions button:last-child {
  color: #947346;
}
.card-actions span {
  margin-left: 8px;
}
.catalog-footer {
  margin-top: 55px;
  border-top: 1px solid #d7ddcf;
  padding: 28px 0;
  display: flex;
  align-items: center;
  gap: 25px;
  color: #808775;
  font-size: 12px;
}
.catalog-footer strong {
  font: 22px var(--serif);
  color: #355b49;
}
.catalog-footer button {
  margin-left: auto;
  white-space: nowrap;
  background: none;
  border: 0;
  color: #355b49;
  font-size: 13px;
}
.market-empty {
  text-align: center;
  padding: 65px 15px;
  color: #78816e;
}
.market-empty > span {
  font-size: 50px;
}
.market-empty h3 {
  font-size: 22px;
  color: #365748;
}
.market-empty p {
  font-size: 15px;
  line-height: 1.8;
}
.market-catalog :deep(.el-pagination) {
  justify-content: center;
  margin-top: 35px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (min-width: 1550px) {
  .market-hero {
    gap: 100px;
  }
  .market-card {
    padding: 26px;
    gap: 26px;
  }
  .work-summary {
    font-size: 15px;
  }
  .market-card h3 {
    font-size: 23px;
  }
}
@media (max-width: 1150px) {
  .market-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .market-hero {
    padding: 38px 30px 25px;
    gap: 30px;
  }
  .selection-heading > span {
    max-width: 150px;
    line-height: 1.6;
  }
  .market-search button {
    padding: 15px;
  }
  .hero-books {
    gap: 12px;
  }
  .hero-description {
    font-size: 16px;
  }
}
@media (max-width: 760px) {
  .market-home {
    height: auto;
    overflow: visible;
    scroll-snap-type: none;
  }
  .market-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    gap: 15px;
  }
  .market-hero h1 {
    font-size: 48px;
  }
  .hero-pretitle {
    margin-top: 25px;
  }
  .hero-selection {
    max-width: 600px;
    width: 100%;
    margin: auto;
  }
  .hero-book:nth-child(2) {
    margin-top: 20px;
  }
  .hero-book:nth-child(3) {
    margin-top: 40px;
  }
  .selection-note {
    margin-top: 25px;
  }
  .market-grid {
    grid-template-columns: 1fr;
  }
  .catalog-heading {
    display: block;
  }
  .catalog-label {
    display: none;
  }
  .catalog-filter {
    flex-wrap: wrap;
  }
  .catalog-filter input {
    max-width: none;
    flex: 1;
  }
  .catalog-filter label {
    width: 100%;
    margin-left: 0;
  }
  .catalog-footer {
    flex-wrap: wrap;
    gap: 15px;
  }
  .catalog-footer span {
    width: 75%;
    line-height: 1.8;
  }
  .market-card {
    gap: 22px;
  }
  .market-card h3 {
    font-size: 23px;
  }
  .hero-foot {
    font-size: 11px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .market-home {
    scroll-behavior: auto;
  }
  .hero-book {
    transition: none;
  }
}
</style>
