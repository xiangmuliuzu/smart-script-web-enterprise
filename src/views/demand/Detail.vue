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
            <span class="chip-lite">{{ genreLabel(demand.genreId) }}</span>
            <span v-for="tag in tagList" :key="tag" class="chip-lite">{{ tag }}</span>
          </div>
        </div>
        <div class="dd-money"><b>{{ money(demand.budget) }}</b><span>任务预算 · 托管{{ escrowStatusLabel(demand.escrowStatus) }}</span></div>
      </header>

      <dl class="dd-info">
        <div><dt>任务编号</dt><dd>{{ demand.demandNo }}</dd></div>
        <div><dt>投稿截止</dt><dd>{{ dateText(demand.deadline) }}</dd></div>
        <div><dt>总集数</dt><dd>{{ isStaged ? demand.totalEpisodes + ' 集 · 逐轮验收' : '未设定 · 整单时限 ' + (demand.durationHours || '-') + ' 小时' }}</dd></div>
        <div><dt>投稿数</dt><dd>{{ demand.submissionCount || 0 }}</dd></div>
        <div><dt>托管金额</dt><dd>{{ money(demand.escrowAmount) }} · {{ escrowStatusLabel(demand.escrowStatus) }}</dd></div>
        <div><dt>创作者押金</dt><dd>{{ depositStatusLabel(demand.depositStatus) }}<template v-if="Number(demand.depositAmount) > 0">（{{ money(demand.depositAmount) }}）</template></dd></div>
        <div v-if="demand.acceptedCreatorId || demand.acceptedCreatorName" class="dd-span-2">
          <dt>接单人</dt>
          <dd>{{ demand.acceptedCreatorName || ('用户#' + demand.acceptedCreatorId) }}<template v-if="demand.acceptedAt"> · {{ timeText(demand.acceptedAt) }} 付押金接单</template></dd>
        </div>
      </dl>

      <p v-if="demand.status === 'failed' && demand.failReason" class="dd-fail">{{ demand.failReason }}</p>

      <section class="dd-block">
        <h3>需求描述</h3>
        <p class="dd-requirement">{{ demand.requirement || '未填写需求描述' }}</p>
      </section>
      <!-- 联系方式是自己填的，空值也要占一行显示「未填写」，否则发布者会误以为该字段不存在 -->
      <section class="dd-block">
        <h3>联系方式</h3>
        <p class="dd-requirement">{{ demand.contactInfo || '未填写' }}</p>
      </section>

      <section class="dd-actions">
        <button v-if="canPayEscrow" class="btn" :disabled="busy" @click="openEscrowPay">支付托管 {{ money(demand.budget) }}</button>
        <button v-if="canEdit" class="btn light" :disabled="busy" @click="router.push(`/demand/${demandId}/edit`)">编辑任务</button>
        <button v-if="demand.status === 'open'" class="btn ghost danger" :disabled="busy" @click="doClose">关闭征集</button>
        <button v-if="demand.acceptedCreatorId" class="btn ghost" :disabled="busy" @click="openChat(demand.acceptedCreatorId)">联系接单人</button>
      </section>
      <p v-if="canPayEscrow" class="note">托管完成前任务不会出现在任务广场、也不可见于投稿与接单；预算全额进入平台第三方托管账户，逐轮验收通过时按轮次放出。</p>
      <p v-else-if="demand.status === 'open' && demand.escrowStatus === 'escrowed'" class="note">托管已到账，任务在广场曝光中。可等创作者付押金接单，也可在下方直接从投稿里选标。</p>

      <!-- ═══ 招标制：投稿管理 ═══ -->
      <section v-if="demand.status === 'open'" class="dd-block">
        <div class="block-head">
          <h3>投稿管理</h3>
          <button class="btn ghost small" type="button" :disabled="busy" @click="loadSubmissions">刷新</button>
        </div>
        <p class="note">选标会关闭征集并为中标者创建一条询盘，走「询盘→报价→合同」的整单成交，不占用逐轮放款；其余投稿会被自动拒掉。已有人付押金接单后请勿再选标。</p>
        <p v-if="!submissions.length" class="empty-text">暂无投稿</p>
        <article v-for="sub in submissions" :key="sub.submissionId" class="sub-card">
          <div class="sub-head">
            <b>《{{ sub.workTitle || ('作品#' + sub.workId) }}》</b>
            <span class="sub-status" :data-tone="submissionTone(sub.status)">{{ submissionStatusLabel(sub.status) }}</span>
          </div>
          <p class="sub-meta">{{ sub.submitterName || ('用户#' + sub.submitterId) }} · 投稿于 {{ timeText(sub.createdAt) }}</p>
          <p v-if="sub.submitMessage" class="sub-msg">{{ sub.submitMessage }}</p>
          <p v-if="sub.reviewRemark" class="sub-meta sub-remark">处理备注：{{ sub.reviewRemark }}<template v-if="sub.reviewedAt"> · {{ timeText(sub.reviewedAt) }}</template></p>
          <div v-if="['submitted', 'shortlisted'].includes(sub.status)" class="sub-actions">
            <button v-if="sub.status === 'submitted'" class="btn light small" :disabled="busy" @click="doShortlist(sub)">入围</button>
            <button class="btn small" :disabled="busy" @click="doAccept(sub)">选标（中标）</button>
            <button class="btn ghost small" :disabled="busy" @click="doReject(sub)">拒绝</button>
            <button class="btn ghost small" :disabled="busy" @click="openChat(sub.submitterId)">联系作者</button>
          </div>
        </article>
      </section>

      <!-- ═══ 接单制：逐轮验收与放款 ═══ -->
      <h3 class="dd-section-title">验收轮次</h3>
      <DemandStagePanel ref="panel" :demand="demand" @changed="load" />
    </template>

    <PortalLayer v-model="payVisible" title="支付托管款" modal>
      <div class="pay-body">
        <p class="dd-cost">金额 {{ money(payAmount) }}（预算全额，沙箱收款不产生真实资金）</p>
        <img v-if="payQr" :src="payQr" alt="支付宝沙箱托管收款二维码" width="220" height="220">
        <p v-if="payMessage" class="dd-cost pay-message">{{ payMessage }}</p>
        <button class="btn" :disabled="payChecking" @click="confirmEscrowPay">{{ payChecking ? '查询中…' : '我已完成支付' }}</button>
      </div>
    </PortalLayer>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import PortalLayer from '../../components/PortalLayer.vue'
import DemandStagePanel from '../../components/demand/DemandStagePanel.vue'
import { demandStatusLabel, escrowStatusLabel, depositStatusLabel, submissionStatusLabel, money, dateText, timeText, genreLabel } from '../../utils/demand.js'
const { api, openTrade, handleError } = usePortal()
const route = useRoute()
const router = useRouter()
const demandId = computed(() => Number(route.params.id))
const demand = ref(null)
const submissions = ref([])
const panel = ref(null)
const pending = ref(true)
const error = ref('')
const busy = ref(false)
const payVisible = ref(false)
const payQr = ref('')
const payMessage = ref('')
const payChecking = ref(false)
const payAmount = ref(0)
const isStaged = computed(() => Number(demand.value?.totalEpisodes) > 0)
const tagList = computed(() => String(demand.value?.tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean))
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[demand.value?.status] || 'off'))
// 与后端 updateDemand / payEscrow 的前置条件对齐，避免点了才吃 400
const canEdit = computed(() => demand.value?.status === 'open' && !['escrowed', 'released'].includes(demand.value?.escrowStatus))
const canPayEscrow = computed(() => demand.value?.status === 'open' && demand.value?.escrowStatus === 'pending_payment')
const submissionTone = status => ({ submitted: 'off', shortlisted: 'info', accepted: 'ok', rejected: 'off' }[status] || 'off')
function goBack() { router.push('/demand/published') }
async function load() {
  if (!demandId.value) { error.value = '任务编号无效'; pending.value = false; return }
  pending.value = !demand.value; error.value = ''
  try {
    demand.value = await api.value.getDemand(demandId.value)
    if (demand.value.status === 'open') await loadSubmissions()
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
async function loadSubmissions() {
  try { submissions.value = await api.value.listDemandSubmissions(demandId.value) || [] }
  catch (failure) { submissions.value = []; await handleError(failure, { silent: true }) }
}
async function doShortlist(sub) {
  busy.value = true
  try { await api.value.shortlistSubmission(sub.submissionId); ElMessage.success('已标记入围'); await loadSubmissions() }
  catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function doAccept(sub) {
  try {
    await ElMessageBox.confirm(
      `确认选用《${sub.workTitle || '该作品'}》？选标后征集立即关闭，其余投稿自动拒掉，并生成一条询盘走合同成交；本任务不再逐轮交付。`,
      '选标确认', { type: 'warning', confirmButtonText: '确认选标', cancelButtonText: '再想想' })
  } catch { return }
  busy.value = true
  try {
    await api.value.acceptSubmission(sub.submissionId)
    ElMessage.success('已选标，可在「询盘」中继续推进合同')
    await load()
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function doReject(sub) {
  let remark
  try {
    const result = await ElMessageBox.prompt('拒绝理由会同步给创作者（可留空）', '拒绝投稿', { inputType: 'textarea', inputPlaceholder: '例如：题材匹配度不足，建议改投悬疑类征集' })
    remark = String(result.value || '').trim() || undefined
  } catch { return }
  busy.value = true
  try { await api.value.rejectSubmission(sub.submissionId, remark); ElMessage.success('已拒绝'); await loadSubmissions() }
  catch (failure) { await handleError(failure) } finally { busy.value = false }
}
// 发布者发起会话必须显式指定对方（后端按 发布者+创作者+任务 幂等建会话）
async function openChat(targetUserId) {
  if (!targetUserId) { ElMessage.warning('该记录缺少创作者身份，无法发起会话'); return }
  busy.value = true
  try {
    await api.value.demandChatSession(demandId.value, targetUserId)
    openTrade('session')
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function openEscrowPay() {
  busy.value = true
  try {
    const result = await api.value.payEscrow(demandId.value)
    if (!result?.sandbox || !result.qrCode) throw new Error('获取沙箱支付二维码失败')
    payQr.value = await QRCode.toDataURL(result.qrCode, { width: 220, margin: 2 })
    payAmount.value = Number(result.amount) || Number(demand.value.budget) || 0
    payMessage.value = ''
    payVisible.value = true
  } catch (failure) { await handleError(failure) } finally { busy.value = false }
}
async function confirmEscrowPay() {
  if (payChecking.value) return
  payChecking.value = true
  try {
    const result = await api.value.confirmEscrow(demandId.value)
    if (result?.paid) {
      payVisible.value = false
      ElMessage.success('托管已到账，任务已对外曝光')
      await load()
    } else payMessage.value = result?.reason || '尚未查询到支付成功，请完成扫码支付后重试'
  } catch (failure) { payMessage.value = failure.message || '查询失败，请稍后重试' }
  finally { payChecking.value = false }
}
async function doClose() {
  try {
    await ElMessageBox.confirm(
      '关闭后该任务停止征集且不可恢复，已付出的托管款不会自动退回（需联系客服走人工退款）。确认关闭？',
      '关闭征集', { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '再想想' })
  } catch { return }
  busy.value = true
  try { await api.value.closeDemand(demandId.value); ElMessage.success('已关闭'); await load() }
  catch (failure) { await handleError(failure) } finally { busy.value = false }
}
onMounted(async () => {
  await load()
  // 从「我发布的」点「支付托管」进来时直接拉起沙箱扫码面板
  if (route.query.pay === 'escrow' && canPayEscrow.value) await openEscrowPay()
})
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
.dd-money { text-align: right }
.dd-money b { display: block; font-size: 22px; color: #f56c6c }
.dd-money span { font-size: 12px; color: #909399 }
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
.empty-text { font-size: 13px; color: #909399 }
.sub-card { border: 1px solid #ebeef5; border-radius: 6px; padding: 11px 14px; margin-top: 10px; background: #fff }
.sub-head { display: flex; align-items: center; gap: 10px; font-size: 14px }
.sub-status { margin-left: auto; padding: 1px 9px; border-radius: 10px; font-size: 11.5px; background: #f4f4f5; color: #909399 }
.sub-status[data-tone="info"] { background: #ecf5ff; color: #409eff }
.sub-status[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.sub-meta { margin: 6px 0 0; font-size: 12px; color: #909399 }
.sub-remark { color: #e6a23c }
.sub-msg { margin: 6px 0 0; white-space: pre-wrap; font-size: 12.5px; color: #606266; line-height: 1.6 }
.sub-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px }
.dd-cost { margin: 0; font-size: 13px; color: #606266 }
.pay-body { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center }
.pay-message { color: #e6a23c }
.btn.danger { color: #f56c6c; border-color: #fbc4c4 }
</style>
