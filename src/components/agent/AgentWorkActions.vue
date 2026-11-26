<template>
  <div class="work-actions">
    <button type="button" class="btn light small" @click="$emit('open-work', { workId: work.workId, title: work.title, status: '市场作品' })">
      查看 · 试读
    </button>
    <button type="button" class="btn small" :disabled="!work.canInquire" @click="$emit('inquire-work', work)">
      发起询盘
    </button>
  </div>
</template>

<script setup>
defineProps({ work: { type: Object, required: true } })
defineEmits(['open-work', 'inquire-work'])
</script>

<style scoped>
.work-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.work-actions button { white-space: nowrap; }
.work-actions button:disabled { cursor: not-allowed; opacity: .6; }
</style>
