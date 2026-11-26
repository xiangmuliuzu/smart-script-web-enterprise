<template>
  <div class="market-cover" :class="{ illustrated: !url || broken }">
    <img
      v-if="url && !broken"
      :src="url"
      :alt="work.title + '封面'"
      loading="lazy"
      @error="broken = true"
    />
    <template v-else
      ><small>剧云策 · 剧本</small><strong>{{ work.title || '未命名作品' }}</strong
      ><span>{{ workGenre(work) }}</span></template
    >
    <slot />
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { workGenre } from '../utils/market.js'
import { mediaUrl } from '../utils/enterprise.js'
const props = defineProps({ work: { type: Object, required: true } })
const broken = ref(false)
const url = computed(() => mediaUrl(props.work.cover || props.work.coverUrl || ''))
watch(url, () => {
  broken.value = false
})
</script>
<style scoped>
.market-cover {
  position: relative;
  overflow: hidden;
  aspect-ratio: 3/4;
  background: #e8e5dc;
  border-radius: 3px;
  isolation: isolate;
}
.market-cover img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.illustrated {
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(145deg, #e6ded0, #c6d6ce);
  border: 1px solid #bac9bf;
  color: #294a43;
}
.illustrated:before {
  content: '';
  position: absolute;
  inset: 9px;
  border: 1px solid #ffffff80;
  z-index: -1;
}
.illustrated strong {
  font: 600 clamp(20px, 2vw, 34px)/1.5 var(--serif);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.illustrated small,
.illustrated span {
  font-size: 12px;
  letter-spacing: 0.12em;
}
</style>
