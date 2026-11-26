<template>
  <div class="demand-detail">
    <button class="btn ghost small back" type="button" @click="goBack">← 返回我发布的</button>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <template v-if="!pending && !error && demand">
      <header class="dd-head">
        <div class="dd-title-wrap">
          <h2>{{ demand.title }}</h2>
          <div class="dd-tags">
            <span class="dd-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
            <span class="chip-lite chip-type" :data-type="taskTypeValue">{{ taskTypeLabel(demand.taskType) }}</span>
            <span class="chip-lite">{{ genreLabel(demand.genreId) }}</span>
            <span v-for="tag in tagList" :key="tag" class="chip-lite">{{ tag }}</span>
          </div>
        </div>
        <div class="dd-money"><b>{{ money(demand.budget) }}</b><span>任务预算</span></div>
      </header>

      <!-- 审核态是本页第一优先信息：待审核说明还没曝光，驳回必须把审核意见与时间摊开 -->
      <p v-if="demand.status === 'pending_review'" class="dd-audit dd-audit-wait">
        任务已提交平台审核，审核通过后才会出现在任务广场并对外可接单。审核期间不可被接单，无需重复提交。
      </p>
      <div v-else-if="demand.status === 'rejected'" class="dd-audit dd-audit-reject">
        <b>审核未通过{{ demand.auditAt ? ' · ' + timeText(demand.auditAt) : '' }}</b>
        <p class="dd-audit-remark">{{ demand.auditRemark || '审核方未填写原因，请联系平台客服确认' }}</p>
        <p class="dd-audit-tip">按审核意见修改后重新提交，任务会回到「待审核」，原审核意见随之清空。</p>
      </div>

      <dl class="dd-info">
        <div><dt>任务编号</dt><dd>{{ demand.demandNo }}</dd></div>
        <div><dt>任务类型</dt><dd>{{ taskTypeLabel(demand.taskType) }}</dd></div>
        <div><dt>接单截止</dt><dd>{{ dateText(demand.deadline) }}</dd></div>
        <div><dt>总集数</dt><dd>{{ isStaged ? demand.totalEpisodes + ' 集 · ' + (taskTypeValue === 'storyboard' ? '按源剧本逐轮出分镜' : '逐轮验收') : '未设定 · 整单时限 ' + formatHours(demand.durationHours) }}</dd></div>
        <div><dt>发布时间</dt><dd>{{ dateText(demand.createdAt) }}</dd></div>
        <div><dt>当前状态</dt><dd>{{ demandStatusLabel(demand.status) }}</dd></div>
        <div class="dd-span-2"><dt>交付要求</dt><dd>{{ taskTypeDeliverHint(demand.taskType) }}</dd></div>
        <div v-if="demand.acceptedCreatorId || demand.acceptedCreatorName" class="dd-span-2">
          <dt>接单人</dt>
          <dd>{{ demand.acceptedCreatorName || ('用户#' + demand.acceptedCreatorId) }}<template v-if="demand.acceptedAt"> · {{ timeText(demand.acceptedAt) }} 接单</template></dd>
        </div>
      </dl>

      <p v-if="demand.status === 'failed' && demand.failReason" class="dd-fail">{{ demand.failReason }}</p>

      <section class="dd-block">
        <h3>需求描述</h3>
        <p class="dd-requirement">{{ demand.requirement || '未填写需求描述' }}</p>
      </section>
      <!-- 分镜类任务的源剧本：创作者接单前要靠它评估工作量，这里复核自己关联的内容。
           「按创作者视角查看」走 source-script 端点，看到的就是对方接单前看到的。 -->
      <section v-if="taskTypeValue === 'storyboard'" class="dd-block">
        <div class="block-head">
          <h3>源剧本</h3>
          <button v-if="hasSource" class="btn light small" type="button" :disabled="sourcePending" @click="openSource">{{ sourcePending ? '加载中…' : '按创作者视角查看' }}</button>
        </div>
        <p class="dd-requirement">
          <template v-if="demand.sourceWorkTitle">关联作品《{{ demand.sourceWorkTitle }}》</template>
          <template v-if="demand.sourceScriptUrl"><span :class="{ 'src-split': demand.sourceWorkTitle }">剧本文件</span><a :href="mediaUrl(demand.sourceScriptUrl)" target="_blank" rel="noopener">{{ demand.sourceScriptName || '查看下载' }}</a></template>
          <template v-if="!hasSource"><span class="dd-warn">源剧本已失效，请编辑任务重新关联</span></template>
        </p>
      </section>
      <!-- 联系方式是自己填的，空值也要占一行显示「未填写」，否则需求方会误以为该字段不存在 -->
      <section class="dd-block">
        <h3>联系方式</h3>
        <p class="dd-requirement">{{ demand.contactInfo || '未填写' }}</p>
      </section>

      <!-- 买方动作只剩「编辑重交」：逐轮验收、延时审批、关闭征集与托管付款都在管理端由平台运营操作 -->
      <section class="dd-actions">
        <button v-if="canEdit" class="btn" @click="router.push(`/demand/${demandId}/edit`)">{{ demand.status === 'rejected' ? '按审核意见修改并重交' : '编辑任务' }}</button>
      </section>
      <p v-if="demand.status === 'pending_review'" class="note">审核通过后任务自动进入任务广场；如需撤回或调整已通过审核的内容，请联系平台客服。</p>
      <p v-else-if="demand.status === 'open'" class="note">任务已审核通过并在广场曝光，等待创作者接单。接单后的逐轮交付与验收由平台运营操作，本页只播报进度。</p>

      <h3 class="dd-section-title">验收轮次</h3>
      <DemandStagePanel ref="panel" :demand="demand" />

      <PortalLayer v-model="sourceVisible" title="源剧本（创作者接单前看到的口径）" wide>
        <div class="work-view">
          <LoadState :pending="sourcePending" :error="sourceError" :retry="loadSource" loading-text="正在加载源剧本…" />
          <template v-if="!sourcePending && !sourceError && source">
            <h4 class="wv-title">{{ source.work?.title ? '《' + source.work.title + '》' : (source.fileName || '源剧本文件') }}</h4>
            <p v-if="source.fileUrl" class="sc-meta"><a class="sc-link" :href="mediaUrl(source.fileUrl)" target="_blank" rel="noopener">剧本文件下载 ↗</a></p>
            <p v-if="!source.chapters?.length" class="panel-note">该任务以文件形式提供源剧本，无在线章节内容。</p>
            <ol v-else class="wv-chapters">
              <li v-for="chapter in source.chapters" :key="chapter.chapterId" class="wv-chapter">
                <div class="wv-chapter-head">
                  <b>第 {{ chapter.chapterNo }} 集 · {{ chapter.chapterTitle || ('章节#' + chapter.chapterId) }}</b>
                  <span v-if="chapter.wordCount" class="wv-words">{{ chapter.wordCount }} 字</span>
                  <button type="button" class="history-toggle" @click="toggleChapter(chapter)">{{ opened[chapter.chapterId] ? '收起 ▴' : '看正文 ▾' }}</button>
                </div>
                <div v-if="opened[chapter.chapterId]" class="wv-content">
                  <p v-for="(line, i) in chapterParagraphs(chapter)" :key="i">{{ line }}</p>
                  <p v-if="!chapterParagraphs(chapter).length" class="sc-meta">该集暂无正文内容。</p>
                </div>
              </li>
            </ol>
          </template>
        </div>
      </PortalLayer>
    </template>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandStagePanel from '../../components/demand/DemandStagePanel.vue'
import { demandStatusLabel, demandStatusTone, money, dateText, timeText, genreLabel, formatHours, taskTypeLabel, taskTypeDeliverHint, isAuditState } from '../../utils/demand.js'
import { mediaUrl } from '../../utils/enterprise.js'
const { api, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const demandId = computed(() => Number(route.params.id))
const demand = ref(null)
const panel = ref(null)
const pending = ref(true)
const error = ref('')
const isStaged = computed(() => Number(demand.value?.totalEpisodes) > 0)
const taskTypeValue = computed(() => demand.value?.taskType || 'script')
const tagList = computed(() => String(demand.value?.tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean))
const statusTone = computed(() => demandStatusTone(demand.value?.status))
const hasSource = computed(() => !!demand.value?.sourceWorkTitle || !!demand.value?.sourceScriptUrl)
// 编辑口径与后端 updateDemandByBuyer 一致：仅待审核、审核未通过两态放行
const canEdit = computed(() => isAuditState(demand.value?.status))
function goBack() { router.push('/demand/published') }
async function load() {
  if (!demandId.value) { error.value = '任务编号无效'; pending.value = false; return }
  pending.value = !demand.value; error.value = ''
  try {
    demand.value = await api.value.getDemand(demandId.value)
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
/* 源剧本复核：走 /demand/{id}/source-script，返回 { work?, chapters?, fileUrl?, fileName? } */
const sourceVisible = ref(false)
const source = ref(null)
const sourcePending = ref(false)
const sourceError = ref('')
const opened = reactive({})
// 正文按行分段渲染：后端已转纯文本，这里用文本插值而不是 v-html，不把创作者内容当 HTML 执行
const chapterParagraphs = chapter => String(chapter?.content || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
function toggleChapter(chapter) { opened[chapter.chapterId] = !opened[chapter.chapterId] }
async function loadSource() {
  sourcePending.value = true; sourceError.value = ''
  try { source.value = await api.value.sourceScript(demandId.value) }
  catch (failure) { source.value = null; sourceError.value = failure.message || '源剧本加载失败' }
  finally { sourcePending.value = false }
}
function openSource() {
  source.value = null
  sourceError.value = ''
  Object.keys(opened).forEach(key => delete opened[key])
  sourceVisible.value = true
  loadSource()
}
onMounted(load)
</script>
<style scoped>
.demand-detail { padding: 4px 0 24px; max-width: 900px }
.back { margin-bottom: 12px }
.dd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap }
.dd-title-wrap { flex: 1; min-width: 240px }
.dd-head h2 { margin: 0 0 8px; font-size: 19px }
.dd-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center }
.dd-status { padding: 1px 9px; border-radius: 10px; font-size: 12px; font-weight: 500; background: #f4f4f5; color: #909399 }
.dd-status[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.dd-status[data-tone="info"] { background: #ecf5ff; color: #409eff }
.dd-status[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.dd-status[data-tone="danger"] { background: #fef0f0; color: #f56c6c }
.chip-lite { padding: 1px 8px; border-radius: 10px; font-size: 11.5px; background: #f5f7fa; color: #909399 }
.chip-type { background: #ecf5ff; color: #409eff }
.chip-type[data-type="script_storyboard"] { background: #fdf6ec; color: #e6a23c }
.chip-type[data-type="storyboard"] { background: #f0f9eb; color: #67c23a }
.src-split { margin-left: 10px }
.dd-warn { color: #f56c6c }
.dd-money { text-align: right }
.dd-money b { display: block; font-size: 22px; color: #f56c6c }
.dd-money span { font-size: 12px; color: #909399 }
/* 审核条：待审核赭石、驳回红，与卡片同色系 */
.dd-audit { margin: 14px 0 0; padding: 10px 13px; border-radius: 6px; font-size: 12.5px; line-height: 1.7 }
.dd-audit-wait { border-left: 3px solid var(--gold); background: var(--goldsoft); color: #6b4e19 }
.dd-audit-reject { border-left: 3px solid var(--red); background: var(--redsoft); color: #7b3a33 }
.dd-audit-reject b { display: block; color: var(--red); margin-bottom: 4px }
.dd-audit-remark { margin: 0; white-space: pre-wrap }
.dd-audit-tip { margin: 5px 0 0; color: #909399 }
.dd-info { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin: 16px 0 0; padding: 12px 14px; border: 1px solid #ebeef5; border-radius: 6px; background: #fff }
.dd-info div { display: flex; gap: 8px; font-size: 13px }
.dd-info .dd-span-2 { grid-column: span 2 }
.dd-info dt { color: #909399; flex: none }
.dd-info dd { margin: 0; color: #303133 }
.dd-fail { margin: 12px 0 0; padding: 9px 12px; border-radius: 6px; background: #fef0f0; color: #f56c6c; font-size: 12.5px }
.dd-block { margin-top: 18px }
.block-head { display: flex; align-items: center; gap: 12px }
.dd-block h3, .dd-section-title { margin: 0 0 8px; font-size: 15px }
.dd-section-title { margin-top: 22px }
.dd-requirement { margin: 0; white-space: pre-wrap; font-size: 13px; color: #606266; line-height: 1.7 }
.dd-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px }
.note { margin: 8px 0 0; font-size: 12px; color: #909399; line-height: 1.6 }
.work-view { display: flex; flex-direction: column; gap: 8px }
.wv-title { margin: 0; font-size: 17px; color: #303133 }
.wv-chapters { list-style: none; margin: 6px 0 0; padding: 0 }
.wv-chapter { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; background: #fff }
.wv-chapter-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 12px; font-size: 13px; color: #303133 }
.wv-words { font-size: 12px; color: #909399 }
.wv-content { padding: 4px 14px 12px; border-top: 1px dashed #ebeef5; font-size: 14px; line-height: 1.9; color: #5c5850 }
.wv-content p { margin: 8px 0 0; white-space: pre-wrap }
.sc-meta { margin: 6px 0 0; font-size: 12px; color: #909399 }
.sc-link { display: inline-block; font-size: 12px; color: #409eff }
.panel-note { margin: 0; padding: 9px 12px; border-radius: 6px; background: #f5f7fa; color: #909399; font-size: 12.5px }
.history-toggle { border: 0; background: none; padding: 0; font-size: 12px; color: #409eff; cursor: pointer }
</style>
