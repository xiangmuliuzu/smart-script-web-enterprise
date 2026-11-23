<template>
  <div id="chapter-preview-modal-final" class="chapter-modal-bg" :data-open="open" :data-index="index">
    <div class="chapter-modal chapter-reader-modal" role="dialog" aria-modal="true" aria-labelledby="chapter-preview-title">
      <header class="chapter-reader-head">
        <div class="chapter-reader-kicker">{{ fullAccess ? '章节阅读' : '章节试读' }}</div>
        <div class="chapter-reader-title-row">
          <div>
            <h3 id="chapter-preview-title">{{ title }}</h3>
          </div>
          <button type="button" class="chapter-reader-close" aria-label="关闭章节" @click="$emit('close')">×</button>
        </div>
        <div class="chapter-reader-meta">
          <span>《{{ workTitle }}》</span>
          <span v-if="author">作者 {{ author }}</span>
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
          <p v-if="!paragraphs.length" class="rights-note">该章节暂无正文内容。</p>
          <div v-if="!fullAccess" class="chapter-note">当前仅展示开放试读的章节内容。</div>
        </template>
      </div>
      <footer class="chapter-reader-foot">
        <small>目录 {{ index + 1 }} / {{ total }}{{ fullAccess ? '' : ' · 试读' }}</small>
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
  workTitle: { type: String, default: '' }, author: { type: String, default: '' }, fullAccess: Boolean
})
defineEmits(['close', 'step'])
const { api, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const content = ref('')
let readRun = 0
const paragraphs = computed(() => String(content.value || '').split(/\n+/).map(line => line.trim()).filter(Boolean))
const progressWidth = computed(() => Math.round(((props.index + 1) / Math.max(props.total, 1)) * 100) + '%')
async function load() {
  const run = ++readRun
  content.value = ''
  if (!props.chapterId) return
  pending.value = true
  error.value = ''
  try {
    const result = await api.value.getChapter(props.chapterId)
    if (run !== readRun) return
    if (result?.readable === false) error.value = '当前账号无法阅读此章节。'
    else content.value = result?.content || ''
  } catch (failure) {
    if (run === readRun && !handleError(failure, { silent: true })) error.value = failure.message || '章节加载失败，请重试。'
  } finally { if (run === readRun) pending.value = false }
}
watch(() => [props.open, props.chapterId], ([open]) => {
  if (open) load()
  else { readRun++; content.value = '' }
}, { immediate: true })
</script>
