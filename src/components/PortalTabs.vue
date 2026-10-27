<template>
  <div :class="drawer ? 'dtabs' : 'tabs'" role="tablist" :aria-label="label">
    <button v-for="(item, index) in items" :key="item.value" role="tab" type="button" :aria-selected="modelValue === item.value" :tabindex="modelValue === item.value ? 0 : -1" @click="$emit('update:modelValue', item.value)" @keydown="move($event, index)">{{ item.label }}<span v-if="item.count" class="tab-count">{{ item.count }}</span></button>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: String, items: Array, drawer: Boolean, label: { type: String, default: '内容分类' } })
const emit = defineEmits(['update:modelValue'])
function move(event, index) {
  const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!offset && !['Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1 : (index + offset + props.items.length) % props.items.length
  emit('update:modelValue', props.items[next].value)
  event.currentTarget.parentElement.children[next].focus()
}
</script>
<style scoped>
.dtabs { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 20px; padding: 0 20px; margin: 0; border-bottom: 1px solid #ebeef5; background: #fff }
.dtabs button { flex: none; padding: 11px 0; background: none; border: 0; border-bottom: 2px solid transparent; color: #606266; font-size: 14px; white-space: nowrap; cursor: pointer }
.dtabs button:hover { color: #409eff }
.dtabs button[aria-selected='true'] { border-bottom-color: #409eff; color: #303133; font-weight: 500 }
.tabs { display: flex; gap: 20px; border-bottom: 1px solid #ebeef5; margin-top: 22px; overflow-x: auto }
.tabs button { background: none; border: 0; padding: 9px 0; font-size: 14px; color: #606266; cursor: pointer; border-bottom: 2px solid transparent }
.tabs button[aria-selected='true'] { border-bottom-color: #409eff; color: #303133; font-weight: 500 }
.tab-count { margin-left: 6px; min-width: 16px; padding: 0 5px; background: #f56c6c; color: #fff; font-size: 10.5px; border-radius: 10px; display: inline-block; text-align: center }
</style>
