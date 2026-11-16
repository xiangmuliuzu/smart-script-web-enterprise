<template>
  <div id="chapter-preview-modal-final" class="chapter-modal-bg" :data-open="open" :data-index="index">
    <div class="chapter-modal chapter-reader-modal" role="dialog" aria-modal="true" aria-labelledby="chapter-preview-title">
      <header class="chapter-reader-head">
        <div class="chapter-reader-kicker">SCRIPT PREVIEW · 章节试读</div>
        <div class="chapter-reader-title-row">
          <div>
            <h3 id="chapter-preview-title">{{ title }}</h3>
            <div class="chapter-reader-subtitle">阅读作品前几章内容，了解故事开端与人物关系</div>
          </div>
          <button type="button" class="chapter-reader-close" aria-label="关闭章节预览" @click="$emit('close')">×</button>
        </div>
        <div class="chapter-reader-meta">
          <span>《{{ workTitle }}》</span>
          <span v-if="author">作者 {{ author }}</span>
          <span>仅展示部分内容</span>
        </div>
      </header>
      <div class="chapter-reader-progress">
        <span :style="{ width: progressWidth }"></span>
      </div>
      <div class="chapter-reader-content">
        <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
        <template v-else>
          <p class="chapter-lead">{{ title }}</p>
          <!-- 正文按后端返回的纯文本分段渲染，未开放时不显示占位正文。 -->
          <p v-for="(line, i) in paragraphs" :key="i">{{ line }}</p>
          <p v-if="!paragraphs.length" class="rights-note">{{ readable ? '该章节暂无正文内容。' : '完整剧本需在授权流程中查看，当前仅开放平台配置的试读内容。' }}</p>
          <div class="chapter-note">版权提示：当前页面仅展示经平台配置的章节试读内容，完整剧本内容不会在未完成授权前开放查看。</div>
        </template>
      </div>
      <footer class="chapter-reader-foot">
        <small>第 {{ index + 1 }} / {{ total }} 章 · 试读内容</small>
        <div>
          <button type="button" class="btn ghost small" :disabled="index <= 0" @click="$emit('step', index - 1)">上一章</button>
          <button type="button" class="btn light small" :disabled="index >= total - 1" @click="$emit('step', index + 1)">下一章</button>
        </div>
      </footer>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'

const props = defineProps({
  open: Boolean, index: { type: Number, default: 0 }, total: { type: Number, default: 1 },
  chapterId: { type: [Number, String], default: null }, title: { type: String, default: '' },
  workTitle: { type: String, default: '' }, author: { type: String, default: '' }
})
defineEmits(['close', 'step'])
const { api, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const readable = ref(false)
const content = ref('')
const paragraphs = computed(() => String(content.value || '').split(/\n+/).map(line => line.trim()).filter(Boolean))
const progressWidth = computed(() => Math.round(((props.index + 1) / Math.max(props.total, 1)) * 100) + '%')
async function load() {
  if (!props.chapterId) { content.value = ''; return }
  pending.value = true
  error.value = ''
  try {
    // 未授权时后端返回 403 且仍带 data（content 为空、readable=false），按不可读展示。
    const result = await api.value.getChapter(props.chapterId)
    readable.value = result?.readable !== false
    content.value = result?.content || ''
  } catch (failure) {
    if (!handleError(failure, { silent: true })) { readable.value = false; content.value = ''; error.value = '' }
  } finally { pending.value = false }
}
watch(() => [props.open, props.chapterId], ([open]) => { if (open) load() }, { immediate: true })
</script>
