<template>
  <div class="demand-page">
    <DemandTabs />
    <LoadState v-if="isEdit && (pending || error)" :pending="pending" :error="error" :retry="loadOrigin" loading-text="正在加载待编辑的任务…" />
    <template v-else>
      <div class="page-head">
        <h2 class="page-title">{{ isEdit ? '编辑任务' : '发布任务' }}</h2>
        <p class="page-note">{{ isEdit ? '任务已被接单或已完成托管付款后不可编辑，只能关闭后重新发布。总集数必填，最后一轮验收自动生成并验收到总集数，金额自动取预算余额。' : '发布后需要用支付宝沙箱扫码把预算全额付入平台第三方托管账户，托管完成前任务不会出现在广场、也不可被接单。总集数必填，最后一轮验收自动生成。' }}</p>
      </div>

      <form class="pub-form" @submit.prevent="submit">
        <div class="form-grid">
          <label class="field span-2">任务标题 *<input v-model="form.title" maxlength="100" placeholder="例如：24 集都市甜宠短剧编剧招募"></label>
          <label class="field">题材 *
            <select v-model.number="form.genreId">
              <option v-for="option in genreOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="field">预算金额（元）*<input v-model.number="form.budgetYuan" type="number" min="1" step="0.01" placeholder="5000"></label>
          <label class="field">截止日期 *<input v-model="form.deadline" type="date" :min="today"></label>
          <label class="field">总集数 *<input v-model.number="form.totalEpisodes" type="number" min="1" placeholder="必填，例如 24"></label>
          <label class="field">标签<input v-model="form.tags" placeholder="短剧,都市,竖屏（逗号分隔）"></label>
          <label class="field">联系方式<input v-model="form.contactInfo" placeholder="手机号/微信，仅对接单者可见"></label>
        </div>
        <label class="field span-2">需求描述 *<textarea v-model="form.requirement" rows="5" placeholder="题材定位、人物小传要求、交付格式、每集字数与时长…"></textarea></label>

        <div class="block">
          <div class="block-head">
            <b>验收轮次</b>
            <button class="btn ghost small" type="button" @click="addStage">+ 添加一轮</button>
          </div>
          <p class="block-note">中间轮次可选；最后一轮验收会自动生成（验收到总集数，金额 = 预算余额），不添加中间轮次也可直接发布。每轮时限统一按小时填写，展示时自动折算为天。</p>
          <div v-for="(stage, index) in form.stages" :key="index" class="stage-row">
            <span class="stage-no">第 {{ index + 1 }} 轮</span>
            <label class="field tiny">验收到第（集）<input v-model.number="stage.episodeTo" type="number" min="1" placeholder="8"></label>
            <label class="field tiny">金额（元）<input v-model.number="stage.amountYuan" type="number" min="0" step="0.01" placeholder="1000"></label>
            <label class="field tiny">时限（小时）<input v-model.number="stage.durationHours" type="number" min="1" placeholder="168"></label>
            <button class="btn ghost small" type="button" @click="form.stages.splice(index, 1)">删除</button>
          </div>
          <div v-if="Number(form.totalEpisodes) > 0" class="last-stage">
            <p class="lock-note">🔒 最后一轮自动生成（集数与金额不可改）：验收到第 {{ form.totalEpisodes }} 集（=总集数） · 金额 {{ money(lastStageAmountFen) }}（=预算 − 已填写轮次之和）</p>
            <label class="field tiny">最后一轮时限（小时）<input v-model.number="form.lastDurationHours" type="number" min="1" placeholder="72"></label>
          </div>
          <p v-else class="block-note">填写总集数后，这里会直接出现最后一轮验收。</p>
        </div>

        <div class="form-foot">
          <button class="btn ghost" type="button" @click="goBack">取消</button>
          <button class="btn" type="submit" :disabled="submitting">{{ submitting ? '提交中…' : (isEdit ? '保存修改' : '确认发布') }}</button>
        </div>
      </form>
    </template>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import LoadState from '../../components/LoadState.vue'
import DemandTabs from '../../components/demand/DemandTabs.vue'
import { genreOptions, money } from '../../utils/demand.js'
const { api, handleError } = usePortal()
const router = useRouter()
const route = useRoute()
const isEdit = computed(() => route.name === 'demand-edit')
const demandId = computed(() => Number(route.params.id))
const pending = ref(false)
const error = ref('')
const submitting = ref(false)
const today = new Date().toISOString().slice(0, 10)
const form = reactive({
  title: '', genreId: 1, budgetYuan: null, deadline: '', totalEpisodes: null, tags: '', contactInfo: '', requirement: '',
  stages: [], lastDurationHours: null,
})
// 历史数据可能按天+小时存储，回填与展示统一折算成小时
function hoursOf(round) {
  return (Number(round?.durationDays) || 0) * 24 + (Number(round?.durationHours) || 0)
}
// 最后一轮验收金额 = 预算 − 已填写轮次之和：全程按分算，规避浮点误差，负数按 0 展示
// 展示走全站同一个 money()，避免本页出现 ¥700.00 、列表出现 ¥600 两种格式
const lastStageAmountFen = computed(() => {
  const budgetFen = Math.round((Number(form.budgetYuan) || 0) * 100)
  let sumFen = 0
  for (const stage of form.stages) sumFen += Math.round((Number(stage.amountYuan) || 0) * 100)
  return Math.max(budgetFen - sumFen, 0)
})
function addStage() { form.stages.push({ episodeTo: null, amountYuan: null, durationHours: null }) }
function goBack() { router.push('/demand/published') }
// 编辑回填：预算/轮次金额出参都是「分」，入参里 budget 要「分」、stages[].amount 要「元」，各自换算
async function loadOrigin() {
  if (!isEdit.value) return
  if (!demandId.value) { error.value = '任务编号无效'; return }
  pending.value = true; error.value = ''
  try {
    const [demand, stages] = await Promise.all([api.value.getDemand(demandId.value), api.value.demandStages(demandId.value)])
    Object.assign(form, {
      title: demand.title || '',
      genreId: Number(demand.genreId) || 1,
      budgetYuan: (Number(demand.budget) || 0) / 100,
      deadline: String(demand.deadline || '').slice(0, 10),
      totalEpisodes: Number(demand.totalEpisodes) || null,
      tags: demand.tags || '',
      contactInfo: demand.contactInfo || '',
      requirement: demand.requirement || '',
    })
    const rounds = (stages || []).slice().sort((a, b) => a.stageOrder - b.stageOrder)
    if (rounds.length) {
      const last = rounds[rounds.length - 1]
      form.lastDurationHours = hoursOf(last) || null
      form.stages = rounds.slice(0, -1).map(stage => ({
        episodeTo: stage.episodeTo,
        amountYuan: (Number(stage.amount) || 0) / 100,
        durationHours: hoursOf(stage) || null,
      }))
    } else if (Number(demand.durationHours) > 0) {
      // 历史整单任务无轮次数据时，用整单时限回填最后一轮，避免编辑时必须重填
      form.lastDurationHours = Number(demand.durationHours)
    }
  } catch (failure) { error.value = failure.message || '任务加载失败'; await handleError(failure) }
  finally { pending.value = false }
}
// 轮次校验与后端 validateStages 同口径：总集数必填、集数严格递增且小于总集数、金额>0、时限(小时)>0、含最后一轮合计恰等于预算
function buildStages() {
  const totalEpisodes = Number(form.totalEpisodes || 0)
  if (!totalEpisodes || totalEpisodes <= 0) { ElMessage.warning('请输入总集数'); return null }
  const stages = form.stages
  let sumFen = 0
  let prevEpisode = 0
  const payload = []
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    const episodeTo = Number(stage.episodeTo || 0)
    const amountFen = Math.round((Number(stage.amountYuan) || 0) * 100)
    const hours = Number(stage.durationHours || 0)
    if (episodeTo <= prevEpisode) { ElMessage.warning(`第${i + 1}轮集数必须大于上一轮`); return null }
    if (episodeTo >= totalEpisodes) { ElMessage.warning(`第${i + 1}轮集数必须小于总集数（最后一轮固定验收到总集数）`); return null }
    if (amountFen <= 0) { ElMessage.warning(`第${i + 1}轮金额必须大于0`); return null }
    if (hours <= 0) { ElMessage.warning(`第${i + 1}轮验收时限（小时）必须大于0`); return null }
    prevEpisode = episodeTo
    sumFen += amountFen
    payload.push({ stageOrder: i + 1, episodeTo, amount: amountFen / 100, durationDays: 0, durationHours: hours })
  }
  const budgetFen = Math.round(Number(form.budgetYuan) * 100)
  if (sumFen > budgetFen) { ElMessage.warning('各轮金额之和不能超过预算'); return null }
  const lastHours = Number(form.lastDurationHours || 0)
  if (lastHours <= 0) { ElMessage.warning('请填写最后一轮验收时限（小时）'); return null }
  payload.push({ stageOrder: stages.length + 1, episodeTo: totalEpisodes, amount: (budgetFen - sumFen) / 100, durationDays: 0, durationHours: lastHours })
  return payload
}
async function submit() {
  if (!form.title?.trim()) { ElMessage.warning('请输入标题'); return }
  if (!form.totalEpisodes || form.totalEpisodes <= 0) { ElMessage.warning('请输入总集数'); return }
  if (!form.budgetYuan || form.budgetYuan <= 0) { ElMessage.warning('请输入有效预算'); return }
  if (!form.deadline) { ElMessage.warning('请选择截止日期'); return }
  if (!form.requirement?.trim()) { ElMessage.warning('请填写需求描述'); return }
  const stages = buildStages()
  if (stages === null) return
  const body = {
    title: form.title.trim(),
    genreId: form.genreId || 1,
    // budget 入参按「分」，后端 fenToYuan 后入库
    budget: Math.round(Number(form.budgetYuan) * 100),
    deadline: form.deadline,
    requirement: form.requirement.trim(),
    contactInfo: form.contactInfo?.trim() || undefined,
    tags: form.tags?.trim() || undefined,
    totalEpisodes: Number(form.totalEpisodes),
    stages,
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      await api.value.updateDemand(demandId.value, body)
      ElMessage.success('已保存修改')
      router.push(`/demand/${demandId.value}`)
      return
    }
    const created = await api.value.createDemand(body)
    ElMessage.success('任务已发布，请完成托管付款')
    router.push(created?.demandId ? { path: `/demand/${created.demandId}`, query: { pay: 'escrow' } } : '/demand/published')
  } catch (failure) { await handleError(failure) } finally { submitting.value = false }
}
onMounted(loadOrigin)
</script>
<style scoped>
.demand-page { padding: 4px 0 24px; max-width: 900px }
.page-head { margin-bottom: 14px }
.page-title { margin: 0 0 6px; font-size: 18px }
.page-note { margin: 0; padding: 9px 12px; border-radius: 6px; background: #f5f7fa; color: #909399; font-size: 12.5px; line-height: 1.6 }
.pub-form { display: flex; flex-direction: column; gap: 14px }
.form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #606266 }
.field.span-2 { grid-column: span 2 }
.pub-form > .field { display: flex; flex-direction: column }
.field input, .field select, .field textarea { padding: 7px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; font-family: inherit }
.field textarea { resize: vertical }
.field.tiny { min-width: 110px; flex: none }
.block { border: 1px solid #ebeef5; border-radius: 6px; padding: 12px 14px; background: #fff }
.block-head { display: flex; align-items: center; gap: 12px }
.block-head b { font-size: 13.5px }
.block-note { margin: 6px 0 0; font-size: 12px; color: #909399; line-height: 1.6 }
.stage-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-bottom: 4px }
.stage-no { font-size: 12.5px; color: #409eff; font-weight: 600; align-self: center; width: 58px }
.last-stage { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 10px; padding: 9px 12px; border: 1px dashed #b3d8ff; border-radius: 6px; background: #f0f7ff }
.lock-note { margin: 0; flex: 1; min-width: 240px; font-size: 12px; color: #409eff }
.form-foot { display: flex; justify-content: flex-end; gap: 8px }
</style>
