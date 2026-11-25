<template>
  <article class="demand-card" role="button" tabindex="0" @click="$emit('open', demand.demandId)" @keydown.enter.prevent="$emit('open', demand.demandId)">
    <div class="dc-head">
      <h3 class="dc-title">{{ demand.title }}</h3>
      <!-- 任务类型是接单决策的第一信息，放在状态之前 -->
      <span class="dc-type" :data-type="taskTypeValue">{{ taskTypeLabel(demand.taskType) }}</span>
      <span class="dc-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
    </div>
    <!-- 审核态是本端最要紧的一行：待审核=还没曝光，审核未通过=要改重交。
         审核意见只有后端给了才显示，占位文案会让买方以为单子被驳回了原因不明。 -->
    <p v-if="demand.status === 'pending_review'" class="dc-audit">
      已提交平台审核，通过后自动进入任务广场，在此之前不可被接单。
    </p>
    <p v-else-if="demand.status === 'rejected'" class="dc-audit dc-audit-reject">
      <b>审核未通过<template v-if="demand.auditAt"> · {{ timeText(demand.auditAt) }}</template></b>
      <span class="dc-audit-remark">{{ demand.auditRemark || '审核方未填写原因，请联系平台客服确认' }}</span>
      <span class="dc-audit-tip">修改后可重新提交审核。</span>
    </p>
    <p class="dc-meta">
      编号 {{ demand.demandNo }} · 预算 {{ money(demand.budget) }} · 截止 {{ dateText(demand.deadline) }}
      <template v-if="Number(demand.totalEpisodes) > 0"> · {{ demand.totalEpisodes }} 集 · 逐轮验收</template>
      <template v-else> · 整单时限 {{ formatHours(demand.durationHours) }}</template>
    </p>
    <p class="dc-meta">
      {{ genreLabel(demand.genreId) }}
      <template v-if="taskTypeValue === 'storyboard'"> · 我方提供源剧本</template>
      <!-- 标签必须带前缀：否则「玄幻 · 11 / 22」会被读成集数进度 -->
      <template v-if="tagList.length"> · 标签 {{ tagList.join(' / ') }}</template>
    </p>
    <!-- 托管与履约押金已随资金环节下线：这里不再显示任何资金状态，只报接单人 -->
    <p v-if="demand.acceptedCreatorId || demand.acceptedCreatorName" class="dc-meta">
      接单人：{{ demand.acceptedCreatorName || ('用户#' + demand.acceptedCreatorId) }}<template v-if="demand.acceptedAt"> · {{ timeText(demand.acceptedAt) }} 接单</template>
    </p>
    <!-- 只有进行中的单才该有轮次倒计时：已完成/已关闭/已失败仍显示「剩余 N 天」会被读成还没结清 -->
    <p v-if="demand.status === 'in_progress' && demand.dueAt" class="dc-meta">
      当前轮截止：{{ timeText(demand.dueAt) }}
      <span v-if="roundCountdown.overdue" class="dc-danger">已逾期</span>
      <span v-else class="dc-count" :class="{ 'dc-urgent': roundCountdown.urgent }">{{ roundCountdown.text }}</span>
    </p>
    <p v-if="demand.status === 'completed'" class="dc-meta dc-ok">全部轮次已验收通过，可在详情页查看最终交付作品。</p>
    <p v-if="demand.status === 'failed' && demand.failReason" class="dc-meta dc-danger">{{ demand.failReason }}</p>
    <p class="dc-req">{{ brief }}</p>
    <div class="dc-foot">
      <span class="dc-cost">发布于 {{ dateText(demand.createdAt) }}</span>
      <div class="dc-actions" @click.stop><slot :demand="demand" /></div>
    </div>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { demandStatusLabel, demandStatusTone, money, dateText, timeText, countdown, genreLabel, formatHours, taskTypeLabel } from '../../utils/demand.js'
// open 统一回传 demandId，页面直接用它跳详情
const props = defineProps({ demand: { type: Object, required: true } })
defineEmits(['open'])
const taskTypeValue = computed(() => props.demand.taskType || 'script')
const tagList = computed(() => String(props.demand.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 4))
const brief = computed(() => {
  const text = String(props.demand.requirement || '').replace(/\s+/g, ' ').trim()
  return text.length > 96 ? text.slice(0, 96) + '…' : (text || '未填写需求描述')
})
const statusTone = computed(() => demandStatusTone(props.demand.status))
// 倒计时只算一次：剩余时间充裕时用常态灰字，只有临期/逾期才上橙、红，避免满屏告警色
const roundCountdown = computed(() => countdown(props.demand.dueAt))
</script>
<style scoped>
/* 纸感任务单：透明底 + 细线外框 + 左侧书脊高亮，与采购卡的 hover 语言一致 */
.demand-card { position: relative; margin-bottom: 10px; padding: 16px 18px 14px; background: transparent; border: 1px solid var(--line); border-radius: var(--r); cursor: pointer; transition: border-color .15s, background .15s }
.demand-card::before { content: ""; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 2px; background: transparent; transition: background .15s }
.demand-card:hover { border-color: var(--brand2); background: #f1eee6 }
.demand-card:hover::before { background: var(--brand) }
.demand-card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px }
.dc-head { display: flex; align-items: baseline; gap: 12px }
.dc-title { margin: 0; min-width: 0; font-family: var(--serif); font-size: 16px; font-weight: 600; letter-spacing: .01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.dc-status { flex: none; padding: 1px 7px; border: 1px solid currentColor; border-radius: var(--r); font-size: 11.5px; font-weight: 500; color: var(--muted); background: none }
.dc-type { flex: none; padding: 1px 7px; border-radius: var(--r); font-size: 11.5px; font-weight: 500; white-space: nowrap; color: var(--brand); background: var(--brandsoft) }
.dc-type[data-type="script_storyboard"] { color: var(--gold); background: var(--goldsoft) }
.dc-type[data-type="storyboard"] { color: #4a7c59; background: #e7f1e9 }
.dc-status[data-tone="warn"] { color: var(--gold) }
.dc-status[data-tone="info"] { color: var(--brand) }
.dc-status[data-tone="ok"] { color: #4a7c59 }
.dc-status[data-tone="danger"] { color: var(--red) }
.dc-meta { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
/* 审核条：待审核赭石、驳回红，与页面其余提示条同色系 */
.dc-audit { margin: 8px 0 0; padding: 8px 11px; border-left: 3px solid var(--gold); background: var(--goldsoft); color: #6b4e19; font-size: 12.5px; line-height: 1.7 }
.dc-audit-reject { border-left-color: var(--red); background: var(--redsoft); color: #7b3a33 }
.dc-audit-reject b { color: var(--red) }
.dc-audit-remark { display: block; margin-top: 3px }
.dc-audit-tip { display: block; margin-top: 3px; color: var(--muted) }
.dc-req { margin: 9px 0 0; font-size: 13px; color: #5c5850; line-height: 1.7 }
.dc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--line); flex-wrap: wrap }
.dc-cost { font-size: 12.5px; color: var(--muted) }
.dc-actions { display: flex; gap: 8px; flex-wrap: wrap }
.dc-danger { color: var(--red); font-weight: 600; margin-left: 6px }
.dc-ok { color: #4a7c59 }
.dc-count { margin-left: 6px }
.dc-urgent { color: var(--gold); font-weight: 600 }
</style>
