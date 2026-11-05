<template>
  <section class="stage-panel">
    <LoadState :pending="pending" :error="error" :retry="reload" loading-text="正在加载验收轮次…" />
    <div v-if="!pending && !error && !stages.length" class="panel-note">该任务未配置逐轮验收：接单后按整单时限（{{ demand.durationHours || '-' }} 小时）交付，验收通过即一次性放款。</div>
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
        <p class="sc-meta">时限 {{ durationText(stage) }} · <span :class="dueClass(stage)">截止 {{ timeText(stage.dueAt) }}</span><template v-if="stage.startedAt"> · 开始于 {{ timeText(stage.startedAt) }}</template></p>
        <template v-if="stage.workId || stage.deliverableDesc">
          <p class="sc-meta">交付作品：《{{ stage.workTitle || ('作品#' + stage.workId) }}》<template v-if="stage.submittedAt"> · 提交于 {{ timeText(stage.submittedAt) }}</template></p>
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
          <p class="sc-meta sc-warn">创作者申请延时 {{ stage.extendDays || 0 }} 天 {{ stage.extendHours || 0 }} 小时<template v-if="stage.extendReason">：{{ stage.extendReason }}</template>（申请于 {{ timeText(stage.extendAppliedAt) }}）</p>
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
              <span class="sc-meta">{{ extendTypeLabel(row.applyType) }} · {{ row.days || 0 }} 天 {{ row.hours || 0 }} 小时</span>
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
          <label class="field">延长天数<input v-model.number="selfForm.days" type="number" min="0" max="30"></label>
          <label class="field">延长小时<input v-model.number="selfForm.hours" type="number" min="0" max="72"></label>
        </div>
        <p class="dialog-note">自主延时不经创作者申请、立即生效并顺延本轮截止时间，同时写入一条延时记录。当前截止：{{ timeText(current?.dueAt) }}</p>
        <div class="dialog-foot">
          <button class="btn ghost" type="button" @click="selfVisible = false">取消</button>
          <button class="btn" :disabled="busy" @click="doSelfExtend">{{ busy ? '提交中…' : '确认顺延' }}</button>
        </div>
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
import { money, timeText, countdown, durationText, stageStatusLabel, stageTone, isActiveStage, extendTypeLabel, extendStatusLabel, extendTone, aiBrief, dueTone } from '../../utils/demand.js'
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
const selfForm = reactive({ days: null, hours: null })
// 倒计时每分钟翻一次用的心跳值（与定时器 id 分离，避免把 id 当成响应式变量写回）
const tick = ref(0)
let clockTimer = null
let pollTimer = null

const activeRound = computed(() => { void tick.value; return stages.value.find(stage => isActiveStage(stage)) || null })
const reviewable = computed(() => stages.value.find(stage => stage.status === 'submitted') || null)
const pendingExtend = computed(() => stages.value.find(stage => stage.extendStatus === 'pending') || null)
const historyOf = stageId => history.value.filter(row => String(row.stageId) === String(stageId))
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
  try { await ElMessageBox.confirm(approved ? `同意本轮延时 ${stage.extendDays || 0} 天 ${stage.extendHours || 0} 小时？截止时间将同步顺延。` : '驳回该延时申请？本轮截止时间不变，逾期将失败终止。', '处理延时申请', { type: 'warning' }) }
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
  Object.assign(selfForm, { days: null, hours: null })
  selfVisible.value = true
}
async function doSelfExtend() {
  const days = Number(selfForm.days) || 0
  const hours = Number(selfForm.hours) || 0
  if (days + hours <= 0) { ElMessage.warning('延长时长必须大于 0'); return }
  busy.value = true
  try {
    await api.value.selfExtendStage(props.demand.demandId, current.value.stageId, { days, hours })
    selfVisible.value = false
    ElMessage.success('已顺延本轮截止时间')
    await reload()
    emit('changed')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
onMounted(async () => {
  await reload()
  clockTimer = setInterval(() => { tick.value++ }, 60000)
  // 有轮次卡在 AI 审核中时按 5 秒轮询取结果（与 APP 同口径）
  pollTimer = setInterval(() => { if (stages.value.some(stage => stage.status === 'ai_reviewing')) reload() }, 5000)
})
onUnmounted(() => { clearInterval(clockTimer); clearInterval(pollTimer) })
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
