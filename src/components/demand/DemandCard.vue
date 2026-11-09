<template>
  <article class="demand-card" role="button" tabindex="0" @click="$emit('open', demand.demandId)" @keydown.enter.prevent="$emit('open', demand.demandId)">
    <div class="dc-head">
      <h3 class="dc-title">{{ demand.title }}</h3>
      <span class="dc-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
    </div>
    <p class="dc-meta">
      编号 {{ demand.demandNo }} · 预算 {{ money(demand.budget) }} · 截止 {{ dateText(demand.deadline) }}
      <template v-if="Number(demand.totalEpisodes) > 0"> · {{ demand.totalEpisodes }} 集 · 逐轮验收</template>
      <template v-else> · 整单时限 {{ formatHours(demand.durationHours) }}</template>
    </p>
    <p class="dc-meta">
      {{ genreLabel(demand.genreId) }}
      <!-- 标签必须带前缀：否则「玄幻 · 11 / 22」会被读成集数进度 -->
      <template v-if="tagList.length"> · 标签 {{ tagList.join(' / ') }}</template>
    </p>
    <!-- 广场（只读）只显示别人已托管的可接单任务；自己发布的要看资金进度与接单人 -->
    <!-- 两笔钱各带主语：预算托管=自己付的预算款，履约押金=创作者付的保证金（本端只读） -->
    <p v-if="mode === 'published'" class="dc-meta">
      预算托管：{{ escrowStatusLabel(demand.escrowStatus) }}（{{ money(demand.escrowAmount) }}）
      · 履约押金：{{ depositStatusLabel(demand.depositStatus) }}（{{ money(demand.depositAmount) }}）
    </p>
    <p v-if="mode === 'published' && (demand.acceptedCreatorName || demand.acceptedCreatorId)" class="dc-meta">
      接单人：{{ demand.acceptedCreatorName || ('用户#' + demand.acceptedCreatorId) }}<template v-if="demand.acceptedAt"> · {{ timeText(demand.acceptedAt) }} 接单</template>
    </p>
    <p v-if="mode === 'published' && demand.dueAt" class="dc-meta">
      当前轮截止：{{ timeText(demand.dueAt) }}
      <span v-if="roundCountdown.overdue" class="dc-danger">已逾期</span>
      <span v-else class="dc-count" :class="{ 'dc-urgent': roundCountdown.urgent }">{{ roundCountdown.text }}</span>
    </p>
    <p v-if="demand.status === 'failed' && demand.failReason" class="dc-meta dc-danger">{{ demand.failReason }}</p>
    <p class="dc-req">{{ brief }}</p>
    <div class="dc-foot">
      <span class="dc-cost">{{ mode === 'square' ? (demand.clientName || '发布方未显示') : '发布于 ' + dateText(demand.createdAt) }}</span>
      <div class="dc-actions" @click.stop><slot :demand="demand" /></div>
    </div>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { demandStatusLabel, escrowStatusLabel, depositStatusLabel, money, dateText, timeText, countdown, genreLabel, formatHours } from '../../utils/demand.js'
// open 统一回传 demandId，页面直接用它跳详情
const props = defineProps({ demand: { type: Object, required: true }, mode: { type: String, default: 'square' } })
defineEmits(['open'])
const tagList = computed(() => String(props.demand.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 4))
const brief = computed(() => {
  const text = String(props.demand.requirement || '').replace(/\s+/g, ' ').trim()
  return text.length > 96 ? text.slice(0, 96) + '…' : (text || '未填写需求描述')
})
const statusTone = computed(() => ({ open: 'warn', in_progress: 'info', selected: 'info', completed: 'ok', closed: 'off', failed: 'danger' }[props.demand.status] || 'off'))
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
.dc-status[data-tone="warn"] { color: var(--gold) }
.dc-status[data-tone="info"] { color: var(--brand) }
.dc-status[data-tone="ok"] { color: #4a7c59 }
.dc-status[data-tone="danger"] { color: var(--red) }
.dc-meta { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
.dc-req { margin: 9px 0 0; font-size: 13px; color: #5c5850; line-height: 1.7 }
.dc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--line); flex-wrap: wrap }
.dc-cost { font-size: 12.5px; color: var(--muted) }
.dc-actions { display: flex; gap: 8px; flex-wrap: wrap }
.dc-danger { color: var(--red); font-weight: 600; margin-left: 6px }
.dc-count { margin-left: 6px }
.dc-urgent { color: var(--gold); font-weight: 600 }
</style>
