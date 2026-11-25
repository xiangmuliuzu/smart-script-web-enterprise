<template>
  <section class="works">
    <h3>{{ comparison ? '作品对比' : '作品推荐' }}</h3>
    <p v-if="payload.criteria" class="criteria">{{ payload.criteria }}</p>
    <p v-if="payload.scanLimited" class="criteria">已达本次检索范围，可缩小条件后重试。</p>
    <p v-if="!payload.works.length" class="empty">本次检索未找到符合条件的作品。</p>
    <div v-else-if="comparison" class="comparison" tabindex="0" aria-label="作品对比表，可横向滚动">
      <table>
        <thead>
          <tr>
            <th scope="col">对比维度</th>
            <th v-for="work in payload.works" :key="work.workId" scope="col">{{ work.title }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td v-for="work in payload.works" :key="work.workId">{{ row.value(work) }}</td>
          </tr>
          <tr>
            <th scope="row">操作</th>
            <td v-for="work in payload.works" :key="work.workId">
              <AgentWorkActions :work="work" @open-work="$emit('open-work', $event)" @inquire-work="$emit('inquire-work', $event)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="grid">
      <article v-for="work in payload.works" :key="work.workId" class="work">
        <div class="work-heading">
          <h4>{{ work.title }}</h4>
          <span class="copyright" :data-registered="work.copyrightRegistrationStatus === 'registered'">{{ copyright(work) }}</span>
        </div>
        <p class="facts">{{ work.authorName || '作者待确认' }} · {{ episodes(work) }} · {{ yuan(work.price) }}</p>
        <p v-if="work.tags?.length" class="tags">{{ work.tags.join(' · ') }}</p>
        <p v-if="work.recommendationReason" class="reason">{{ work.recommendationReason }}</p>
        <p v-if="work.summary" class="description">{{ work.summary }}</p>
        <AgentWorkActions :work="work" @open-work="$emit('open-work', $event)" @inquire-work="$emit('inquire-work', $event)" />
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import AgentWorkActions from './AgentWorkActions.vue'
import { yuan } from './format.js'

const props = defineProps({ type: String, payload: { type: Object, required: true } })
defineEmits(['open-work', 'inquire-work'])
const comparison = computed(() => props.type === 'work_comparison')
const episodes = work => work.episodeCount == null ? '集数待确认' : work.episodeCount + ' 集'
function copyright(work) {
  if (work.copyrightRegistrationStatus === 'registered') return '版权已登记'
  if (work.copyrightRegistrationStatus === 'unregistered') return '版权未登记'
  return '登记状态待确认'
}
const rows = [
  { label: '作者与题材', value: work => [work.authorName, ...(work.tags || [])].filter(Boolean).join(' · ') || '待确认' },
  { label: '参考价与预算', value: work => yuan(work.price) + (work.budgetMatch === true ? ' · 预算内' : work.budgetMatch === false ? ' · 超出预算' : '') },
  { label: '集数 / 字数', value: work => episodes(work) + (work.wordCount == null ? '' : ' / ' + work.wordCount.toLocaleString('zh-CN') + ' 字') },
  { label: '版权状态', value: work => [copyright(work), work.copyrightCertNo, '独家状态' + (work.exclusiveStatus || '待核实')].filter(Boolean).join(' · ') },
  { label: '商业化看点', value: work => work.commercialHighlights || '待评估' },
  { label: '风险提示', value: work => work.riskNotes || '待核实' }
]
</script>

<style scoped>
.works h3 { font-size: 15px; margin: 0 0 6px; }
.criteria, .empty { color: var(--muted); margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 8px; }
.work {
  display: grid; align-content: start; gap: 7px; padding: 12px; border: 1px solid var(--line);
  border-radius: 9px; background: var(--surface); overflow-wrap: anywhere;
}
.work-heading { display: flex; justify-content: space-between; align-items: start; gap: 7px; }
.work h4 { margin: 0; color: var(--ink); font: 600 15px/1.4 var(--serif); }
.work p { margin: 0; }
.copyright { flex-shrink: 0; padding: 1px 6px; border-radius: 4px; color: #724b15; background: var(--goldsoft); font-size: 11px; }
.copyright[data-registered="true"] { color: var(--brand); background: var(--brandsoft); }
.facts, .tags, .description { color: #52635e; }
.description { font-size: 12px; }
.reason { font-size: 12px; color: var(--brand); }
.comparison { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; text-align: left; background: var(--surface); }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; min-width: 142px; }
th:first-child { position: sticky; left: 0; min-width: 80px; background: var(--soft); }
thead th { background: var(--soft); }
tbody tr:last-child > * { border-bottom: 0; }
</style>
