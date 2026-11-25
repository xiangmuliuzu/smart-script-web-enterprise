<template>
  <PortalTabs :model-value="activePath" :items="items" label="我的任务分区" @update:model-value="go" />
</template>
<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalTabs from '../PortalTabs.vue'
const route = useRoute()
const router = useRouter()
// 买方只有「我发布的」和「发布任务」两个分区：浏览广场、挑单是创作者的动作，本端不提供。
const items = [
  { value: '/demand/published', label: '我发布的任务' },
  { value: '/demand/create', label: '发布任务' },
]
// 任务详情页（/demand/:id）与编辑页不高亮任何分区，避免误以为仍在列表页。
const activePath = computed(() => items.find(item => item.value === route.path)?.value || '')
function go(path) { if (path && route.path !== path) router.push(path) }
</script>
