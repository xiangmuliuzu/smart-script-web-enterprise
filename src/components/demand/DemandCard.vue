<template>
  <article class="demand-card" role="button" tabindex="0" @click="$emit('open', demand.demandId)" @keydown.enter.prevent="$emit('open', demand.demandId)">
    <div class="dc-head">
      <h3 class="dc-title">{{ demand.title }}</h3>
      <span class="dc-status" :data-tone="statusTone">{{ demandStatusLabel(demand.status) }}</span>
    </div>
    <p class="dc-meta">
      编号 {{ demand.demandNo }} · 预算 {{ money(demand.budget) }} · 截止 {{ dateText(demand.deadline) }}
      <template v-if="Number(demand.totalEpisodes) > 0"> · {{ demand.totalEpisodes }} 集 · 逐轮验收</template>
      <template v-else> · 整单时限 {{ demand.durationHours || '-' }} 小时</template>
    </p>
    <p class="dc-meta">
      {{ genreLabel(demand.genreId) }}
      <template v-if="mode === 'square'"> · 投稿 {{ demand.submissionCount || 0 }}</template>
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
import { demandStatusLabel, escrowStatusLabel, depositStatusLabel, money, dateText, timeText, countdown, genreLabel } from '../../utils/demand.js'
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
.demand-card { border: 1px solid #ebeef5; border-radius: 6px; padding: 14px 16px; margin-bottom: 10px; background: #fff; cursor: pointer; transition: box-shadow .15s, border-color .15s }
.demand-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, .07); border-color: #409eff }
.dc-head { display: flex; align-items: center; gap: 10px }
.dc-title { margin: 0; font-size: 15.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.dc-status { flex: none; padding: 1px 9px; border-radius: 10px; font-size: 12px; font-weight: 500; background: #f4f4f5; color: #909399 }
.dc-status[data-tone="warn"] { background: #fdf6ec; color: #e6a23c }
.dc-status[data-tone="info"] { background: #ecf5ff; color: #409eff }
.dc-status[data-tone="ok"] { background: #f0f9eb; color: #67c23a }
.dc-status[data-tone="danger"] { background: #fef0f0; color: #f56c6c }
.dc-meta { margin: 6px 0 0; font-size: 12px; color: #909399 }
.dc-req { margin: 8px 0 0; font-size: 13px; color: #606266; line-height: 1.6 }
.dc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; flex-wrap: wrap }
.dc-cost { font-size: 12px; color: #909399 }
.dc-actions { display: flex; gap: 8px; flex-wrap: wrap }
.dc-danger { color: #f56c6c; font-weight: 600; margin-left: 6px }
.dc-count { margin-left: 6px }
.dc-urgent { color: #e6a23c; font-weight: 600 }
</style>
