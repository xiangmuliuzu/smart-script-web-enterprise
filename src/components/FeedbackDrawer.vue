<template>
  <div id="drawer-feedback" class="drawer-bg" :data-open="open" @click.self="closeOnBg">
    <aside class="drawer">
      <div class="drawer-head">
        <h2>意见反馈</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="drawer-body">
        <p class="rights-note">告诉我们在作品采购、沟通或交易过程中遇到的问题。</p>
        <div class="field">
          <label>反馈类型</label>
          <select v-model="form.category">
            <!-- 后端只接受 FEATURE / EXPERIENCE / BUG / COMPLAINT / OTHER。 -->
            <option value="FEATURE">功能建议</option>
            <option value="EXPERIENCE">页面问题</option>
            <option value="BUG">交易问题</option>
            <option value="OTHER">其他</option>
          </select>
        </div>
        <div class="field">
          <label>反馈内容</label>
          <textarea v-model="form.content" maxlength="2000" placeholder="请输入你的意见或遇到的问题"></textarea>
        </div>
        <button class="btn" style="margin-top:18px" :disabled="sending" @click="submit">{{ sending ? '提交中…' : '提交反馈' }}</button>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortal } from '../utils/portal.js'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const { api, handleError } = usePortal()
const sending = ref(false)
const form = reactive({ category: 'FEATURE', content: '' })
async function submit() {
  if (sending.value) return
  const content = form.content.trim()
  // 后端要求 5~2000 字，先在前端拦一道避免必然失败的请求。
  if (content.length < 5) { ElMessage.warning('请至少输入 5 个字'); return }
  sending.value = true
  try {
    await api.value.sendFeedback({ category: form.category, content })
    ElMessage.success('反馈已提交，感谢你的建议')
    form.content = ''
    emit('close')
  } catch (failure) { handleError(failure) } finally { sending.value = false }
}
function closeOnBg() { /* 原型 closeOnBg 是空实现：点击遮罩不关闭。 */ }
</script>
