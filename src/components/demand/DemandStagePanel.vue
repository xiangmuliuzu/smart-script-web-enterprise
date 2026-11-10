<template>
  <section class="stage-panel">
    <LoadState :pending="pending" :error="error" :retry="reload" loading-text="正在加载验收轮次…" />
    <div v-if="!pending && !error && !stages.length" class="panel-note">该任务未配置逐轮验收：接单后按整单时限（{{ formatHours(demand.durationHours) }}）交付，验收通过即一次性放款。</div>
    <template v-else>
      <p v-if="activeRound" class="round-banner" :data-urgent="countdown(activeRound.dueAt).urgent">第 {{ activeRound.stageOrder }} 轮进行中 · {{ countdown(activeRound.dueAt).text }}</p>
      <p v-else-if="reviewable" class="round-banner wait">第 {{ reviewable.stageOrder }} 轮交付已提交，等待你验收（通过后即放出该轮 {{ money(reviewable.amount) }}）</p>
      <p v-else-if="pendingExtend" class="round-banner wait">有轮次提交了延时申请待你处理，超过 24 小时将自动驳回</p>
      <p v-else-if="stages.length && stages.every(s => s.status === 'approved')" class="round-banner done">全部 {{ stages.length }} 轮已验收通过，款项已逐轮放出</p>

      <article v-for="stage in stages" :key="stage.stageId" class="stage-card" :data-tone="stageTone(stage)">
        <div class="sc-head">
          <b>第 {{ stage.stageOrder }} 轮 · 验收到第 {{ stage.episodeTo }} 集</b>
          <span class="sc-amount">{{ money(stage.amount) }}</span>
          <span class="sc-status">{{ stageStatusLabel(stage) }}</span>
        </div>
        <p class="sc-meta">时限 {{ durationText(stage) }}<template v-if="extendedHoursOf(stage) > 0"> · 已延时 {{ formatHours(extendedHoursOf(stage)) }}</template> · <span :class="dueClass(stage)">截止 {{ timeText(stage.dueAt) }}</span><template v-if="stage.startedAt"> · 开始于 {{ timeText(stage.startedAt) }}</template></p>
        <template v-if="stage.workId || stage.deliverableDesc">
          <p class="sc-meta">交付作品：《{{ stage.workTitle || ('作品#' + stage.workId) }}》<template v-if="stage.submittedAt"> · 提交于 {{ timeText(stage.submittedAt) }}</template></p>
          <!-- 验收前得能读到创作者交的剧本正文，否则只能凭一句交付说明拍板 -->
          <button v-if="stage.workId" class="btn light small wv-open" type="button" @click="openWork(stage)">查看交付内容</button>
          <p v-if="stage.deliverableDesc" class="sc-desc">{{ stage.deliverableDesc }}</p>
          <a v-if="stage.deliverableUrl" class="sc-link" :href="stage.deliverableUrl" target="_blank" rel="noopener">交付物链接 ↗</a>
        </template>
        <p v-if="stage.aiScore != null" class="sc-meta">AI 审核 {{ stage.aiScore }} 分：{{ aiBrief(stage.aiResult) }}（{{ timeText(stage.aiReviewedAt) }}）</p>
        <p v-if="stage.status === 'ai_reviewing'" class="sc-meta sc-warn">创作者已提交，AI 正在审核，本轮计时已暂停，结果出来后进入你的验收。</p>
        <p v-if="stage.status === 'rejected' && stage.rejectReason" class="sc-meta sc-danger">上次驳回原因：{{ stage.rejectReason }}</p>
        <p v-if="Number(stage.releaseFlag) === 1" class="sc-meta sc-ok">已放款 {{ money(stage.amount) }}</p>
        <p v-if="stage.reviewedAt" class="sc-meta">验收时间：{{ timeText(stage.reviewedAt) }}</p>

        <!-- 待我处理：延时申请（只处理当前待处理那条，既往记录永久保留） -->
        <div v-if="stage.extendStatus === 'pending'" class="sc-extend">
          <p class="sc-meta sc-warn">创作者申请延时 {{ extendAskOf(stage) }}<template v-if="stage.extendReason">：{{ stage.extendReason }}</template>（申请于 {{ timeText(stage.extendAppliedAt) }}）</p>
          <div class="sc-actions">
            <button class="btn small" :disabled="busy" @click="decide(stage, true)">同意延时</button>
            <button class="btn ghost small" :disabled="busy" @click="decide(stage, false)">驳回</button>
          </div>
        </div>

        <div v-if="canAct(stage)" class="sc-actions">
          <button v-if="stage.status === 'submitted'" class="btn small" :disabled="busy" @click="review(stage, true)">验收通过并放款</button>
          <button v-if="stage.status === 'submitted'" class="btn ghost small" :disabled="busy" @click="review(stage, false)">驳回</button>
          <button v-if="isActiveStage(stage)" class="btn light small" :disabled="busy" @click="openSelfExtend(stage)">自主延时</button>
        </div>

        <div class="sc-history">
          <button class="history-toggle" type="button" @click="toggleHistory(stage)">延时记录（{{ historyOf(stage.stageId).length }} 条）<span v-if="historyOpen[stage.stageId]"> ▴</span><span v-else> ▾</span></button>
          <ul v-if="historyOpen[stage.stageId]" class="history-list">
            <li v-if="!historyOf(stage.stageId).length" class="sc-meta">本轮暂无延时记录</li>
            <li v-for="row in historyOf(stage.stageId)" :key="row.applyId" class="history-row">
              <span class="sc-meta">{{ extendTypeLabel(row.applyType) }} · {{ formatHours((Number(row.days) || 0) * 24 + (Number(row.hours) || 0)) }}</span>
              <span v-if="row.reason" class="sc-meta">原因：{{ row.reason }}</span>
              <span class="tone" :data-tone="extendTone(row.status, row.applyType)">{{ extendStatusLabel(row.status, row.applyType) }}</span>
              <span class="sc-meta">{{ timeText(row.appliedAt || row.createdAt) }}</span>
              <span v-if="row.dueAfter" class="sc-meta">顺延至 {{ timeText(row.dueAfter) }}</span>
            </li>
          </ul>
        </div>
      </article>
    </template>

    <PortalLayer v-model="selfVisible" :title="`自主延时 - 第 ${current?.stageOrder || ''} 轮`" modal>
      <div class="dialog-body">
        <div class="field-row">
          <label class="field">延长小时数<input v-model.number="selfForm.hours" type="number" min="1" max="720" placeholder="例如 24"></label>
        </div>
        <p class="dialog-note">自主延时不经创作者申请、立即生效并顺延本轮截止时间，同时写入一条延时记录。当前截止：{{ timeText(current?.dueAt) }}</p>
        <div class="dialog-foot">
          <button class="btn ghost" type="button" @click="selfVisible = false">取消</button>
          <button class="btn" :disabled="busy" @click="doSelfExtend">{{ busy ? '提交中…' : '确认顺延' }}</button>
        </div>
      </div>
    </PortalLayer>

    <!-- 验收查阅交付作品：正文由 deliverable-work 端点一次性下发（只含本轮集数），不再逐章请求 -->
    <PortalLayer v-model="workVisible" :title="`第 ${workStage?.stageOrder || ''} 轮 · 交付作品`" wide>
      <div class="work-view">
        <LoadState :pending="workPending" :error="workError" :retry="() => loadWork(workStage)" loading-text="正在加载交付内容…" />
        <template v-if="!workPending && !workError && work">
          <h4 class="wv-title">《{{ work.title || '未命名作品' }}》</h4>
          <p class="sc-meta">{{ work.authorName ? '作者 ' + work.authorName + ' · ' : '' }}全 {{ work.episodeCount || 0 }} 集 · {{ work.wordCount || 0 }} 字 · 本轮验收到第 {{ work.episodeTo || work.chapters.length }} 集</p>
          <p v-if="work.summary" class="wv-summary">{{ work.summary }}</p>
          <p v-if="work.deliverableDesc" class="sc-desc">交付说明：{{ work.deliverableDesc }}</p>
          <a v-if="work.deliverableUrl" class="sc-link" :href="work.deliverableUrl" target="_blank" rel="noopener">交付物链接 ↗</a>
          <p class="wv-scope">当前可见 {{ work.readableCount }} 集正文{{ work.episodeTo ? '' : '（该轮未限定集数，全本可见）' }}。未交付集数只列出标题，读不到内容。</p>
          <ol class="wv-chapters">
            <li v-for="chapter in work.chapters" :key="chapter.chapterId" class="wv-chapter">
              <div class="wv-chapter-head">
                <b>第 {{ chapter.chapterNo }} 集 · {{ chapter.chapterTitle || ('章节#' + chapter.chapterId) }}</b>
                <span v-if="chapter.wordCount" class="wv-words">{{ chapter.wordCount }} 字</span>
                <span v-if="!chapter.readable" class="wv-off">后续轮次交付</span>
                <button v-else type="button" class="history-toggle" @click="toggleChapter(chapter)">{{ opened[chapter.chapterId] ? '收起 ▴' : '看正文 ▾' }}</button>
              </div>
              <div v-if="chapter.readable && opened[chapter.chapterId]" class="wv-content">
                <p v-for="(line, i) in chapterParagraphs(chapter)" :key="i">{{ line }}</p>
                <p v-if="!chapterParagraphs(chapter).length" class="sc-meta">该集暂无正文内容。</p>
              </div>
            </li>
            <li v-if="!work.chapters.length" class="sc-meta">该作品暂无章节目录。</li>
          </ol>
        </template>
      </div>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../LoadState.vue'
import PortalLayer from '../PortalLayer.vue'
import { money, timeText, countdown, durationText, stageStatusLabel, stageTone, isActiveStage, extendTypeLabel, extendStatusLabel, extendTone, aiBrief, dueTone, formatHours } from '../../utils/demand.js'
const props = defineProps({ demand: { type: Object, required: true } })
// 验收/延期动作会连带改变整单状态（completed / failed），父页需要重拉任务详情
const emit = defineEmits(['changed'])
const { api, handleError } = usePortal()
const stages = ref([])
const history = ref([])
const pending = ref(false)
const error = ref('')
const busy = ref(false)
const historyOpen = reactive({})
const current = ref(null)
const selfVisible = ref(false)
const selfForm = reactive({ hours: null })
// 验收查阅交付作品（抽屉）：一次拉全该轮可见集数，逐集展开只切本地开关
const workVisible = ref(false)
const workStage = ref(null)
const work = ref(null)
const workPending = ref(false)
const workError = ref('')
const opened = reactive({})
// 倒计时每分钟翻一次用的心跳值（与定时器 id 分离，避免把 id 当成响应式变量写回）
const tick = ref(0)
let clockTimer = null
let pollTimer = null
let syncTimer = null

const activeRound = computed(() => { void tick.value; return stages.value.find(stage => isActiveStage(stage)) || null })
const reviewable = computed(() => stages.value.find(stage => stage.status === 'submitted') || null)
const pendingExtend = computed(() => stages.value.find(stage => stage.extendStatus === 'pending') || null)
const historyOf = stageId => history.value.filter(row => String(row.stageId) === String(stageId))
// 已生效延时累计（申请通过 + 自主延时）：时限本身不变，界面直接标明已顺延多少
const extendedHoursOf = stage => historyOf(stage.stageId)
  .filter(row => row.status === 'approved')
  .reduce((sum, row) => sum + (Number(row.days) || 0) * 24 + (Number(row.hours) || 0), 0)
// 待处理申请量：统一按总小时折算展示
const extendAskOf = stage => formatHours((Number(stage.extendDays) || 0) * 24 + (Number(stage.extendHours) || 0))
// 只有已开始的轮次才需要发布者操作（未开始的轮次无可验收内容）
const canAct = stage => !!stage.startedAt || stage.status === 'submitted'
// 截止时间颜色跟阶段走（逾期红/临期橙/其余中性），不再无条件标红
const dueClass = stage => ['sc-due', dueTone(stage) === 'danger' ? 'sc-danger' : dueTone(stage) === 'warn' ? 'sc-warn' : '']
async function loadStages() {
  pending.value = true; error.value = ''
  try { stages.value = await api.value.demandStages(props.demand.demandId) || [] }
  catch (failure) { error.value = failure.message || '轮次加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadHistory() {
  try { history.value = await api.value.demandExtendHistory(props.demand.demandId) || [] }
  catch { history.value = [] } // 历史为空属正常，不打断面板
}
async function reload() { await Promise.all([loadStages(), loadHistory()]) }
function toggleHistory(stage) { historyOpen[stage.stageId] = !historyOpen[stage.stageId] }
async function review(stage, approved) {
  let rejectReason
  if (approved) {
    try { await ElMessageBox.confirm(`确认第 ${stage.stageOrder} 轮验收通过？通过后立即放出 ${money(stage.amount)} 给创作者，并开始下一轮计时。`, '验收通过', { type: 'warning' }) }
    catch { return }
  } else {
    try {
      const result = await ElMessageBox.prompt('请填写驳回原因，创作者会收到并据此修改', '驳回本轮交付', { inputType: 'textarea', inputValidator: value => (value && value.trim()) ? true : '驳回原因不能为空' })
      rejectReason = result.value.trim()
    } catch { return }
  }
  busy.value = true
  try {
    await api.value.reviewStage(props.demand.demandId, stage.stageId, { approved, rejectReason })
    ElMessage.success(approved ? '本轮已通过，款项已放出' : '已驳回，本轮计时恢复并顺延审核耗时')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function decide(stage, approved) {
  try { await ElMessageBox.confirm(approved ? `同意本轮延时 ${formatHours((Number(stage.extendDays) || 0) * 24 + (Number(stage.extendHours) || 0))}？截止时间将同步顺延。` : '驳回该延时申请？本轮截止时间不变，逾期将失败终止。', '处理延时申请', { type: 'warning' }) }
  catch { return }
  busy.value = true
  try {
    await api.value.decideExtend(props.demand.demandId, stage.stageId, approved)
    ElMessage.success(approved ? '已同意，截止时间已顺延' : '已驳回')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
function openSelfExtend(stage) {
  current.value = stage
  Object.assign(selfForm, { hours: null })
  selfVisible.value = true
}
async function doSelfExtend() {
  const hours = Number(selfForm.hours) || 0
  if (hours <= 0) { ElMessage.warning('延长小时数必须大于 0'); return }
  busy.value = true
  try {
    await api.value.selfExtendStage(props.demand.demandId, current.value.stageId, { days: 0, hours })
    selfVisible.value = false
    ElMessage.success('已顺延本轮截止时间')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
// 正文按行分段渲染：后端已转纯文本，这里用文本插值而不是 v-html，不把创作者内容当 HTML 执行
const chapterParagraphs = chapter => String(chapter?.content || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
function toggleChapter(chapter) { opened[chapter.chapterId] = !opened[chapter.chapterId] }
async function loadWork(stage) {
  if (!stage || !stage.workId) { workError.value = '本轮尚未交付作品'; return }
  workPending.value = true; workError.value = ''
  try {
    const result = await api.value.deliverableWork(props.demand.demandId, stage.stageId)
    // chapters 可能缺列（后端无章节时），补齐空数组，下面直接取 .length
    work.value = { ...result, chapters: result?.chapters || [] }
  } catch (failure) {
    work.value = null
    if (!handleError(failure, { silent: true })) workError.value = failure.message || '交付内容加载失败'
  } finally { workPending.value = false }
}
function openWork(stage) {
  workStage.value = stage
  work.value = null
  workError.value = ''
  Object.keys(opened).forEach(key => delete opened[key])
  workVisible.value = true
  loadWork(stage)
}
onMounted(async () => {
  await reload()
  clockTimer = setInterval(() => { tick.value++ }, 60000)
  // 有轮次卡在 AI 审核中时按 5 秒轮询取结果（与 APP 同口径）
  pollTimer = setInterval(() => { if (stages.value.some(stage => stage.status === 'ai_reviewing')) reload() }, 5000)
  // 创作者申请延时/对方端状态变化后，定时同步截止时间，避免页面停留在旧时间
  syncTimer = setInterval(() => { if (!busy.value) reload() }, 30000)
})
onUnmounted(() => { clearInterval(clockTimer); clearInterval(pollTimer); clearInterval(syncTimer) })
defineExpose({ reload })
</script>
<style scoped>
.stage-panel { margin-top: 16px }
.panel-note { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #f5f7fa; color: #909399; font-size: 12.5px }
.round-banner { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #ecf5ff; color: #409eff; font-size: 13px; font-weight: 600 }
.round-banner[data-urgent="true"] { background: #fef0f0; color: #f56c6c }
.round-banner.wait { background: #fdf6ec; color: #e6a23c }
.round-banner.done { background: #f0f9eb; color: #67c23a }
.stage-card { border: 1px solid #ebeef5; border-left-width: 3px; border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: #fff }
.stage-card[data-tone="ok"] { border-left-color: #67c23a }
.stage-card[data-tone="warn"] { border-left-color: #e6a23c }
.stage-card[data-tone="danger"] { border-left-color: #f56c6c }
.stage-card[data-tone="info"] { border-left-color: #409eff }
.stage-card[data-tone="off"] { border-left-color: #dcdfe6 }
.sc-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px }
.sc-amount { color: #f56c6c; font-weight: 600 }
.sc-status { margin-left: auto; padding: 1px 9px; border-radius: 10px; font-size: 12px; background: #f4f4f5; color: #909399 }
.sc-meta { margin: 6px 0 0; font-size: 12px; color: #909399 }
/* 基类不再写死红色：具体色调由 dueClass 按逾期/临期判定追加 sc-danger / sc-warn */
.sc-due { color: inherit }
.sc-warn { color: #e6a23c }
.sc-danger { color: #f56c6c }
.sc-ok { color: #67c23a }
.sc-desc { margin: 6px 0 0; white-space: pre-wrap; font-size: 13px; color: #606266 }
.sc-link { display: inline-block; margin-top: 4px; font-size: 12px; color: #409eff }
/* 验收查阅抽屉 */
.wv-open { margin-left: 6px }
.work-view { display: flex; flex-direction: column; gap: 8px }
.wv-title { margin: 0; font-size: 17px; color: #303133 }
.wv-summary { margin: 0; font-size: 13px; line-height: 1.7; color: #606266 }
.wv-scope { margin: 0; padding: 8px 11px; border-radius: 6px; background: #fdf6ec; color: #e6a23c; font-size: 12px }
.wv-chapters { list-style: none; margin: 6px 0 0; padding: 0 }
.wv-chapter { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; background: #fff }
.wv-chapter-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 12px; font-size: 13px; color: #303133 }
.wv-words { font-size: 12px; color: #909399 }
.wv-off { font-size: 11.5px; color: #c0c4cc }
.wv-content { padding: 4px 14px 12px; border-top: 1px dashed #ebeef5; font-size: 14px; line-height: 1.9; color: #5c5850 }
.wv-content p { margin: 8px 0 0; white-space: pre-wrap }
.sc-extend { margin-top: 10px; padding: 9px 12px; border: 1px dashed #e6a23c; border-radius: 6px; background: #fdf6ec }
.sc-extend .sc-meta { margin-top: 0 }
.sc-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap }
.sc-history { margin-top: 8px }
.history-toggle { border: 0; background: none; padding: 0; font-size: 12px; color: #409eff; cursor: pointer }
.history-list { list-style: none; margin: 6px 0 0; padding: 0 0 0 10px; border-left: 2px solid #ebeef5 }
.history-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 4px 0; font-size: 12px }
.history-row .sc-meta { margin: 0 }
.tone { padding: 0 8px; border-radius: 9px; font-size: 11.5px; background: #f4f4f5; color: #909399 }
.tone[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.tone[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.dialog-body { display: flex; flex-direction: column; gap: 12px }
.dialog-body .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #606266 }
.dialog-body .field input, .dialog-body .field textarea { padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px }
.field-row { display: flex; gap: 12px }
.field-row .field { flex: 1 }
.dialog-note { margin: 0; font-size: 12px; color: #e6a23c }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px }
</style>
