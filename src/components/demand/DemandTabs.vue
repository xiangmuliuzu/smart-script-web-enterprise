<template>
  <PortalTabs :model-value="activePath" :items="items" label="任务广场分区" @update:model-value="go" />
</template>
<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalTabs from '../PortalTabs.vue'
const route = useRoute()
const router = useRouter()
// 任务广场是与企业采购工作台平级的顶级页签，分区之间用路由切换，保证详情页返回与消息通知都能落到具体分区。
const items = [
  { value: '/demand', label: '任务广场' },
  { value: '/demand/published', label: '我发布的' },
]
// 任务详情页（/demand/:id）与发布/编辑页不高亮任何分区，避免误以为仍在列表页。
const activePath = computed(() => items.find(item => item.value === route.path)?.value || '')
function go(path) { if (path && route.path !== path) router.push(path) }
</script>
