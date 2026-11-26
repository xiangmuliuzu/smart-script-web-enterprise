<template><div class="agent-markdown" v-html="sanitized"></div></template>

<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { markdownHtml } from './markdown.js'

const props = defineProps({ text: { type: String, default: '' } })
const sanitized = computed(() => DOMPurify.sanitize(markdownHtml(props.text), {
  ALLOWED_TAGS: ['div', 'p', 'strong', 'ol', 'ul', 'li', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['class']
}))
</script>

<style scoped>
.agent-markdown { min-width: 0; overflow-wrap: anywhere; }
.agent-markdown :deep(p) { margin: 0 0 .55em; }
.agent-markdown :deep(p:last-child) { margin-bottom: 0; }
.agent-markdown :deep(h3), .agent-markdown :deep(h4),
.agent-markdown :deep(h5), .agent-markdown :deep(h6) { margin: .75em 0 .35em; font-size: 1em; }
.agent-markdown :deep(ol), .agent-markdown :deep(ul) { margin: .4em 0 .8em; padding-left: 1.35em; }
.agent-markdown :deep(.agent-md-table) { overflow: auto; }
.agent-markdown :deep(table) { border-collapse: collapse; font-size: .92em; }
.agent-markdown :deep(th), .agent-markdown :deep(td) {
  padding: 5px 9px; border: 1px solid var(--line); text-align: left; min-width: 6em;
}
</style>
