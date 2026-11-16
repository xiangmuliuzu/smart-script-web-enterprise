<template>
  <div id="drawer-feedback" class="drawer-bg" :data-open="open">
    <aside class="drawer">
      <div class="drawer-head"><h2>意见反馈</h2><button class="close" aria-label="关闭" @click="close">×</button></div>
      <div class="drawer-body feedback-body">
        <div class="feedback-heading">
          <div class="feedback-tabs" role="tablist" aria-label="反馈分类">
            <button role="tab" type="button" :aria-selected="tab === 'submit'" @click="tab = 'submit'">提交反馈</button>
            <button role="tab" type="button" :aria-selected="tab === 'mine'" @click="tab = 'mine'">我的反馈</button>
          </div>
          <div class="feedback-help" :class="{ open: helpOpen }"><button type="button" :aria-expanded="helpOpen" @click="helpOpen = !helpOpen">处理须知</button><div class="feedback-popover"><p>提交后 1–3 个工作日内处理，结果会通过站内消息通知你。</p><p>版权、合同类问题：请查看相关交易或合同记录</p><p>作品问题：请在反馈中说明作品名称及问题</p><p>账号被盗：请先修改密码并换绑手机</p></div></div>
        </div>
        <form v-if="tab === 'submit'" class="feedback-panel" @submit.prevent="submit">
          <div class="field"><label for="feedback-category">反馈类型</label><select id="feedback-category" v-model="form.category"><option value="BUG">功能异常</option><option value="EXPERIENCE">体验建议</option><option value="COMPLAINT">内容违规举报</option><option value="OTHER">其他</option></select></div>
          <div class="field"><label for="feedback-content">描述你遇到的问题或建议</label><textarea id="feedback-content" v-model="form.content" maxlength="2000" placeholder="写点什么…" required></textarea></div>
          <div class="field"><label for="feedback-file">相关截图（选填）</label><input id="feedback-file" type="file" accept="image/*" disabled></div>
          <p class="feedback-cost">截图上传暂未开放，可在描述中补充说明。</p>
          <div class="field"><label for="feedback-contact">联系方式（选填）</label><input id="feedback-contact" v-model="form.contact" maxlength="100" placeholder="手机号或邮箱，便于我们回复你"></div>
          <p v-if="submitError" class="form-error" role="alert">{{ submitError }}</p>
          <button class="btn small" :disabled="sending">{{ sending ? '提交中…' : '提交反馈' }}</button>
        </form>
        <template v-else>
          <LoadState :pending="loading" :error="loadError" :retry="loadFeedback" :empty="!loading && !loadError && !feedback.length" />
          <ul v-if="!loading && !loadError" class="feedback-rows"><li v-for="item in feedback" :key="item.feedbackId"><span class="feedback-content">{{ item.content }}</span><span class="feedback-meta">{{ labels[item.status] || item.status }} · {{ dateText(item.submittedAt || item.createTime).slice(5, 10) }}</span><button class="btn ghost small" @click="selected = item">查看</button></li></ul>
        </template>
      </div>
    </aside>
  </div>
  <el-dialog :model-value="!!selected && open" title="反馈详情" width="min(460px, 92vw)" @close="selected = null"><template v-if="selected"><p>{{ selected.content }}</p><p class="feedback-cost">{{ labels[selected.status] || selected.status }}</p><div class="feedback-reply">{{ selected.reply || '暂无平台回复，处理结果会通过站内消息通知你。' }}</div></template></el-dialog>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { dateText } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const { api, handleError } = usePortal()
const tab = ref('submit')
const helpOpen = ref(false)
const sending = ref(false)
const loading = ref(false)
const loadError = ref('')
const submitError = ref('')
const feedback = ref([])
const selected = ref(null)
const labels = { SUBMITTED: '待处理', PENDING: '待处理', PROCESSING: '处理中', REPLIED: '已回复', RESOLVED: '已解决', CLOSED: '已关闭' }
const form = reactive({ category: 'BUG', content: '', contact: '' })
async function loadFeedback() {
  loading.value = true; loadError.value = ''
  try { feedback.value = await api.value.listFeedback() }
  catch (failure) { loadError.value = failure.message || '加载反馈失败'; handleError(failure, { silent: true }) }
  finally { loading.value = false }
}
async function submit() {
  if (sending.value) return
  const content = form.content.trim() + (form.contact.trim() ? '\n联系方式：' + form.contact.trim() : '')
  if (form.content.trim().length < 5 || content.length > 2000) { submitError.value = '反馈内容至少 5 个字，含联系方式最多 2000 字'; return }
  sending.value = true; submitError.value = ''
  try {
    await api.value.sendFeedback({ category: form.category, content })
    form.content = ''; form.contact = ''
    ElMessage.success('反馈已提交')
    tab.value = 'mine'
    await loadFeedback()
  } catch (failure) { submitError.value = failure.message || '提交失败，请稍后重试'; handleError(failure, { silent: true }) }
  finally { sending.value = false }
}
async function close() {
  if (sending.value) return
  if (form.content.trim() || form.contact.trim()) {
    try { await ElMessageBox.confirm('还有未提交的反馈，确定离开？', '未保存的内容', { confirmButtonText: '离开', cancelButtonText: '继续编辑' }) } catch { return }
  }
  form.content = ''; form.contact = ''; submitError.value = ''; selected.value = null
  emit('close')
}
watch(() => props.open, open => { if (open) { tab.value = 'submit'; loadFeedback() } })
</script>
<style scoped>
.feedback-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.feedback-tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--line); }
.feedback-tabs button { padding: 11px 0; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); }
.feedback-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--brand); font-weight: 500; }
.feedback-help { position: relative; flex: none; font-size: 13px; color: var(--muted); }
.feedback-help button { cursor: pointer; padding: 0; border: 0; background: none; color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.feedback-popover { display: none; position: absolute; z-index: 5; top: 100%; right: 0; width: min(320px, 80vw); padding: 12px 16px; background: #fff; border: 1px solid var(--line); box-shadow: 0 8px 24px #0002; line-height: 1.6; }
.feedback-popover p { margin: 6px 0; }
.feedback-help:hover .feedback-popover, .feedback-help.open .feedback-popover, .feedback-help:focus-within .feedback-popover { display: block; }
.feedback-panel { padding: 20px; background: #fff; border: 1px solid var(--line); }
.feedback-panel .field:first-child { margin-top: 0; }
.feedback-cost, .feedback-meta { font-size: 12.5px; color: var(--muted); }
.feedback-rows { list-style: none; margin: 0; padding: 0; }
.feedback-rows li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-top: 0; }
.feedback-rows li:first-child { border-top: 1px solid var(--line); }
.feedback-content { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feedback-meta { flex: none; }
.feedback-reply { padding: 11px 14px; background: #e6eeee; border-left: 3px solid var(--brand); color: #24434a; }
</style>
