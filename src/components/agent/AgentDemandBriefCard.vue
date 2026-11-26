<template>
  <article class="brief-card">
    <header>
      <span>采购需求草案</span>
      <h3>{{ brief.title }}</h3>
    </header>
    <dl>
      <dt>任务类型</dt><dd>{{ briefTaskLabel(brief.taskType) }}</dd>
      <dt>题材标签</dt><dd>{{ brief.genreTags.join('、') }}</dd>
      <dt>目标集数</dt><dd>{{ brief.totalEpisodes }} 集</dd>
      <dt>预算参考</dt><dd>{{ yuan(brief.budgetYuan) }}</dd>
      <dt>期望周期</dt><dd>{{ brief.durationDays }} 天</dd>
    </dl>
    <h4>商业化诉求</h4>
    <p>{{ brief.commercialGoal }}</p>
    <h4>详细要求</h4>
    <p>{{ brief.requirement }}</p>
    <h4>交付验收清单</h4>
    <ul><li v-for="item in brief.deliveryChecklist" :key="item">{{ item }}</li></ul>
    <div class="brief-actions">
      <button type="button" class="btn light small" @click="copy">复制需求单 (Markdown)</button>
      <button type="button" class="btn small" :disabled="sending || sent" @click="send">
        {{ sent ? '已发给平台运营' : sending ? '正在发送…' : '发给平台运营立项' }}
      </button>
    </div>
  </article>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { briefTaskLabel, formatDemandMarkdown, yuan } from './format.js'

const props = defineProps({ brief: { type: Object, required: true } })
const emit = defineEmits(['open-platform-chat'])
const { api, handleError } = usePortal()
const sending = ref(false)
const sent = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(formatDemandMarkdown(props.brief))
    ElMessage.success('采购需求已复制')
  } catch {
    ElMessage.error('无法写入剪贴板，请检查浏览器权限')
  }
}

async function send() {
  if (sending.value || sent.value) return
  sending.value = true
  try {
    const session = await api.value.openPlatformChat()
    if (!session?.sessionId) throw new Error('未能打开平台客服会话')
    await api.value.sendChatMessage(session.sessionId, formatDemandMarkdown(props.brief))
    sent.value = true
    ElMessage.success('采购需求已发给平台运营')
    emit('open-platform-chat', session.sessionId)
  } catch (failure) {
    handleError(failure)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.brief-card {
  display: grid; gap: 8px; padding: 15px; border: 1px solid var(--line);
  border-radius: 10px; background: var(--surface); overflow-wrap: anywhere;
}
.brief-card header span { font-size: 12px; color: var(--brand); font-weight: 600; }
.brief-card h3 { margin: 3px 0 0; font: 600 18px/1.4 var(--serif); }
.brief-card dl { display: grid; grid-template-columns: 5.4em minmax(0, 1fr); gap: 5px 8px; margin: 3px 0; }
.brief-card dt { color: var(--muted); }
.brief-card dd, .brief-card h4, .brief-card p { margin: 0; }
.brief-card p { white-space: pre-wrap; }
.brief-card ul { margin: 0; padding-left: 1.3em; }
.brief-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px; }
</style>
