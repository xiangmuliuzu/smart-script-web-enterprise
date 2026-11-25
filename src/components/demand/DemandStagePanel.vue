<template>
  <section class="stage-panel">
    <LoadState :pending="pending" :error="error" :retry="reload" loading-text="正在加载验收轮次…" />
    <div v-if="!pending && !error && !stages.length" class="panel-note">该任务未配置逐轮验收：接单后按整单时限（{{ formatHours(demand.durationHours) }}）交付，验收通过后一次性结清。</div>
    <template v-else>
      <!-- 验收动作在管理端：本端只做进度播报，文案统一用「平台」作主语 -->
      <p v-if="allApproved" class="round-banner done">全部 {{ stages.length }} 轮已验收通过，任务已完成。</p>
      <p v-else-if="reviewable" class="round-banner wait">第 {{ reviewable.stageOrder }} 轮交付已提交，等待平台验收。</p>
      <p v-else-if="activeRound" class="round-banner" :data-urgent="countdown(activeRound.dueAt).urgent">第 {{ activeRound.stageOrder }} 轮进行中 · {{ countdown(activeRound.dueAt).text }}</p>

      <!-- 最终交付作品：只有整单完成（completed）后需求方才可查看，且只能看最后一轮 -->
      <div v-if="finalStage" class="final-work">
        <div class="fw-copy">
          <b>最终交付作品</b>
          <span v-if="canViewFinal">全部轮次验收通过，可查看第 {{ finalStage.stageOrder }} 轮（末轮）交付的完整作品。</span>
          <span v-else>任务完成后这里会开放最后一轮交付作品的查看入口。</span>
        </div>
        <button class="btn small" type="button" :disabled="!canViewFinal || workPending" @click="openFinalWork">{{ workPending ? '加载中…' : '查看最终作品' }}</button>
      </div>

      <article v-for="stage in stages" :key="stage.stageId" class="stage-card" :data-tone="stageTone(stage)">
        <div class="sc-head">
          <b>第 {{ stage.stageOrder }} 轮 · 验收到第 {{ stage.episodeTo }} 集</b>
          <span class="sc-amount">{{ money(stage.amount) }}</span>
          <span class="sc-status">{{ stageStatusLabel(stage) }}</span>
        </div>
        <p class="sc-meta">时限 {{ durationText(stage) }} · <span :class="dueClass(stage)">截止 {{ timeText(stage.dueAt) }}</span><template v-if="stage.startedAt"> · 开始于 {{ timeText(stage.startedAt) }}</template></p>
        <!-- 分镜类任务可以只交文件与说明（不关联作品），所以判断条件带 deliverableUrl -->
        <template v-if="stage.workId || stage.deliverableDesc || stage.deliverableUrl">
          <p class="sc-meta">
            <template v-if="stage.workId">交付作品：《{{ stage.workTitle || ('作品#' + stage.workId) }}》</template>
            <template v-else>交付分镜（未关联作品）</template>
            <template v-if="stage.submittedAt"> · 提交于 {{ timeText(stage.submittedAt) }}</template>
          </p>
          <!-- 交付内容只在整单完成后按末轮开放，进行中各轮只报状态，逐轮验收是平台的操作 -->
          <p v-if="!canViewFinal" class="sc-meta sc-muted">本轮正文、交付说明与文件在任务完成后统一查阅。</p>
          <p v-if="stage.deliverableDesc && canViewFinal" class="sc-desc">{{ stage.deliverableDesc }}</p>
          <a v-if="stage.deliverableUrl && canViewFinal" class="sc-link" :href="mediaUrl(stage.deliverableUrl)" target="_blank" rel="noopener">交付文件链接 ↗</a>
        </template>
        <p v-if="stage.aiScore != null" class="sc-meta">AI 审核 {{ stage.aiScore }} 分：{{ aiBrief(stage.aiResult) }}（{{ timeText(stage.aiReviewedAt) }}）</p>
        <p v-if="stage.status === 'ai_reviewing'" class="sc-meta sc-warn">创作者已提交，AI 正在审核，结果出来后进入平台验收。</p>
        <!-- 延时审批同样在管理端操作：本端只播报「有申请待处理」，不给同意/驳回按钮 -->
        <p v-if="stage.extendStatus === 'pending'" class="sc-meta sc-warn">本轮有延时申请待平台处理：申请 {{ extendAskOf(stage) }}<template v-if="stage.extendReason"> · 原因：{{ stage.extendReason }}</template>（提交于 {{ timeText(stage.extendAppliedAt) }}）</p>
        <p v-if="stage.status === 'rejected' && stage.rejectReason" class="sc-meta sc-danger">上次驳回原因：{{ stage.rejectReason }}</p>
        <p v-if="stage.reviewedAt" class="sc-meta">验收时间：{{ timeText(stage.reviewedAt) }}</p>
      </article>
    </template>

    <!-- 最终作品查阅：正文由 deliverable-work 端点一次性下发（末轮验收到总集数，全本可读），不逐章请求 -->
    <PortalLayer v-model="workVisible" :title="`最终交付作品 · 第 ${workStage?.stageOrder || ''} 轮`" wide>
      <div class="work-view">
        <LoadState :pending="workPending" :error="workError" :retry="() => loadWork(workStage)" loading-text="正在加载交付内容…" />
        <template v-if="!workPending && !workError && work">
          <h4 class="wv-title">{{ work.title ? '《' + work.title + '》' : '末轮交付（未关联作品）' }}</h4>
          <p v-if="work.chapters.length" class="sc-meta">{{ work.authorName ? '作者 ' + work.authorName + ' · ' : '' }}全 {{ work.episodeCount || 0 }} 集 · {{ work.wordCount || 0 }} 字 · 验收到第 {{ work.episodeTo || work.chapters.length }} 集</p>
          <p v-if="work.summary" class="wv-summary">{{ work.summary }}</p>
          <p v-if="work.deliverableDesc" class="sc-desc">交付说明：{{ work.deliverableDesc }}</p>
          <a v-if="work.deliverableUrl" class="sc-link" :href="mediaUrl(work.deliverableUrl)" target="_blank" rel="noopener">交付文件链接 ↗</a>
          <p v-if="!work.chapters.length" class="panel-note">末轮未关联剧本作品，交付内容以上面的文件链接与交付说明为准；分镜类任务不做 AI 剧本审核。</p>
          <ol v-if="work.chapters.length" class="wv-chapters">
            <li v-for="chapter in work.chapters" :key="chapter.chapterId" class="wv-chapter">
              <div class="wv-chapter-head">
                <b>第 {{ chapter.chapterNo }} 集 · {{ chapter.chapterTitle || ('章节#' + chapter.chapterId) }}</b>
                <span v-if="chapter.wordCount" class="wv-words">{{ chapter.wordCount }} 字</span>
                <span v-if="!chapter.readable" class="wv-off">该集未随本轮交付</span>
                <button v-else type="button" class="history-toggle" @click="toggleChapter(chapter)">{{ opened[chapter.chapterId] ? '收起 ▴' : '看正文 ▾' }}</button>
              </div>
              <div v-if="chapter.readable && opened[chapter.chapterId]" class="wv-content">
                <p v-for="(line, i) in chapterParagraphs(chapter)" :key="i">{{ line }}</p>
                <p v-if="!chapterParagraphs(chapter).length" class="sc-meta">该集暂无正文内容。</p>
              </div>
            </li>
          </ol>
        </template>
      </div>
    </PortalLayer>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../LoadState.vue'
import PortalLayer from '../PortalLayer.vue'
import { money, timeText, countdown, durationText, stageStatusLabel, stageTone, isActiveStage, lastStageOf, aiBrief, dueTone, formatHours } from '../../utils/demand.js'
import { mediaUrl } from '../../utils/enterprise.js'
const props = defineProps({ demand: { type: Object, required: true } })
// 只读面板：验收/延时/关闭都在管理端，父页只需要在详情刷新时带上本面板一起重拉
const { api, handleError } = usePortal()
const stages = ref([])
const pending = ref(false)
const error = ref('')
// 最终作品查阅抽屉：一次拉全末轮集数，逐集展开只切本地开关
const workVisible = ref(false)
const workStage = ref(null)
const work = ref(null)
const workPending = ref(false)
const workError = ref('')
const opened = reactive({})
// 倒计时每分钟翻一次用的心跳值（与定时器 id 分离，避免把 id 当成响应式变量写回）
const tick = ref(0)
let clockTimer = null
let syncTimer = null

const sorted = computed(() => stages.value.slice().sort((a, b) => a.stageOrder - b.stageOrder))
const finalStage = computed(() => lastStageOf(sorted.value))
const activeRound = computed(() => { void tick.value; return sorted.value.find(stage => isActiveStage(stage)) || null })
const reviewable = computed(() => sorted.value.find(stage => stage.status === 'submitted') || null)
const allApproved = computed(() => sorted.value.length > 0 && sorted.value.every(stage => stage.status === 'approved'))
// 查看资格与后端 selectDeliverableWorkForViewer 同口径：整单 completed + 末轮已通过。
// 不满足时按钮只置灰不隐藏，用户才知道「最终作品」这一栏是留给谁的。
const canViewFinal = computed(() => props.demand.status === 'completed' && finalStage.value?.status === 'approved')
// 轮次表里的 extend* 字段由平台在管理端维护，这里只读展示待处理申请量，不提供处理入口
// 待处理申请量：统一按总小时折算展示
const extendAskOf = stage => formatHours((Number(stage.extendDays) || 0) * 24 + (Number(stage.extendHours) || 0))
// 截止时间颜色跟阶段走（逾期红/临期橙/其余中性），不再无条件标红
const dueClass = stage => ['sc-due', dueTone(stage) === 'danger' ? 'sc-danger' : dueTone(stage) === 'warn' ? 'sc-warn' : '']
async function loadStages() {
  pending.value = true; error.value = ''
  try { stages.value = await api.value.demandStages(props.demand.demandId) || [] }
  catch (failure) { error.value = failure.message || '轮次加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function reload() { await loadStages() }
// 正文按行分段渲染：后端已转纯文本，这里用文本插值而不是 v-html，不把创作者内容当 HTML 执行
const chapterParagraphs = chapter => String(chapter?.content || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
function toggleChapter(chapter) { opened[chapter.chapterId] = !opened[chapter.chapterId] }
async function loadWork(stage) {
  if (!stage) return
  workPending.value = true; workError.value = ''
  try {
    const result = await api.value.deliverableWork(props.demand.demandId, stage.stageId)
    // chapters 可能缺列（后端无章节时），补齐空数组，下面直接取 .length
    work.value = { ...result, chapters: result?.chapters || [] }
  } catch (failure) {
    work.value = null
    // 后端的 400 文案就是口径答案（尚未完成验收 / 仅末轮可看 / 末轮未通过），原样透出，不换通用报错
    if (!handleError(failure, { silent: true })) workError.value = failure.message || '交付内容加载失败'
  } finally { workPending.value = false }
}
function openFinalWork() {
  if (!canViewFinal.value) return
  workStage.value = finalStage.value
  work.value = null
  workError.value = ''
  Object.keys(opened).forEach(key => delete opened[key])
  workVisible.value = true
  loadWork(finalStage.value)
}
onMounted(async () => {
  await reload()
  clockTimer = setInterval(() => { tick.value++ }, 60000)
  // 验收在平台侧进行，本页没有本地动作可推动状态，定时同步轮次与审核结论
  syncTimer = setInterval(reload, 30000)
})
onUnmounted(() => { clearInterval(clockTimer); clearInterval(syncTimer) })
defineExpose({ reload })
</script>
<style scoped>
.stage-panel { margin-top: 16px }
.panel-note { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #f5f7fa; color: #909399; font-size: 12.5px }
.round-banner { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #ecf5ff; color: #409eff; font-size: 13px; font-weight: 600 }
.round-banner[data-urgent="true"] { background: #fef0f0; color: #f56c6c }
.round-banner.wait { background: #fdf6ec; color: #e6a23c }
.round-banner.done { background: #f0f9eb; color: #67c23a }
.final-work { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 0 12px; padding: 11px 14px; border: 1px solid #d5e8d4; border-left: 3px solid #67c23a; border-radius: 6px; background: #f6fbf4 }
.fw-copy { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 240px }
.fw-copy b { font-size: 13.5px; color: #3f7a3f }
.fw-copy span { font-size: 12px; color: #909399 }
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
.sc-muted { color: #c0c4cc }
.sc-warn { color: #e6a23c }
.sc-danger { color: #f56c6c }
.sc-desc { margin: 6px 0 0; white-space: pre-wrap; font-size: 13px; color: #606266 }
.sc-link { display: inline-block; margin-top: 4px; font-size: 12px; color: #409eff }
/* 最终作品抽屉 */
.work-view { display: flex; flex-direction: column; gap: 8px }
.wv-title { margin: 0; font-size: 17px; color: #303133 }
.wv-summary { margin: 0; font-size: 13px; line-height: 1.7; color: #606266 }
.wv-chapters { list-style: none; margin: 6px 0 0; padding: 0 }
.wv-chapter { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; background: #fff }
.wv-chapter-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 12px; font-size: 13px; color: #303133 }
.wv-words { font-size: 12px; color: #909399 }
.wv-off { font-size: 11.5px; color: #c0c4cc }
.wv-content { padding: 4px 14px 12px; border-top: 1px dashed #ebeef5; font-size: 14px; line-height: 1.9; color: #5c5850 }
.wv-content p { margin: 8px 0 0; white-space: pre-wrap }
.history-toggle { border: 0; background: none; padding: 0; font-size: 12px; color: #409eff; cursor: pointer }
</style>
