<template>
  <div class="panel-wrap">
    <div class="filter-bar">
      <select v-model="statusFilter" class="filter-select" @change="pageNum = 1; load()">
        <option value="">全部状态</option>
        <option value="pending">待回复</option>
        <option value="quoted">沟通中</option>
        <option value="deal">已达成</option>
        <option value="rejected">已拒绝</option>
        <option value="closed">已关闭</option>
      </select>
      <input v-model="keyword" class="filter-input" placeholder="搜索作品/询盘号" @keyup.enter="pageNum = 1; load()">
    </div>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <div v-if="!pending && !error && !inquiries.length" class="load-state"><p>暂无询盘记录</p></div>
    <div v-for="inq in inquiries" :key="inq.inquiryId" class="inquiry-card" :class="{ expanded: expandedId === inq.inquiryId }">
      <div class="inquiry-header" @click="toggle(inq)">
        <span class="expand-icon">{{ expandedId === inq.inquiryId ? '▾' : '▸' }}</span>
        <span class="inq-title"><b>{{ inq.workTitle || '作品#' + inq.workId }}</b><span class="status-tag" :class="'tag-' + inq.status">{{ statusLabel(inq.status) }}</span></span>
        <span class="inq-summary">作者：{{ inq.sellerName || inq.sellerId }} · {{ money(inq.budget) }}</span>
      </div>
      <div v-if="expandedId === inq.inquiryId" class="inquiry-body">
        <div class="detail-info">
          <p>询盘号：{{ inq.inquiryNo || '#' + inq.inquiryId }} · 状态：<span class="status-tag" :class="'tag-' + inq.status">{{ statusLabel(inq.status) }}</span></p>
          <p>作者：{{ inq.sellerName || inq.sellerId }} · 预算：{{ money(inq.budget) }} · 授权：{{ licenseLabel(inq.licenseType) }}</p>
          <p v-if="inq.message">留言：{{ inq.message }}</p>
          <p class="cost">创建于 {{ dateText(inq.createdAt) }}</p>
        </div>
        <div class="action-bar">
          <button v-if="inq.status === 'pending'" class="btn sm ghost" @click="doClose(inq)">关闭询盘</button>
          <button v-if="['quoted','deal'].includes(inq.status)" class="btn sm quiet" @click="$emit('open-session', inq)">{{ inq._hasSession ? '进入交易会话' : '创建交易会话' }}</button>
        </div>
      </div>
    </div>
    <div v-if="total > PAGE_SIZE" class="pagination-bar">
      <button class="btn sm ghost" :disabled="pageNum <= 1" @click="pageNum--; load()">上一页</button>
      <span class="cost">第 {{ pageNum }} 页 / 共 {{ Math.ceil(total / PAGE_SIZE) }} 页</span>
      <button class="btn sm ghost" :disabled="pageNum * PAGE_SIZE >= total" @click="pageNum++; load()">下一页</button>
    </div>
  </div>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadState from '../LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { dateText, licenseLabel, money } from '../../utils/enterprise.js'

const PAGE_SIZE = 10
const emit = defineEmits(['open-session', 'changed'])
const { api, handleError } = usePortal()
const pending = ref(true)
const error = ref('')
const inquiries = ref([])
const statusFilter = ref('')
const keyword = ref('')
const pageNum = ref(1)
const total = ref(0)
const expandedId = ref(null)
let searchTimer = null

const labels = { pending: '待回复', quoted: '沟通中', deal: '已达成', rejected: '已拒绝', closed: '已关闭' }
const statusLabel = value => labels[value] || value

function toggle(inq) { expandedId.value = expandedId.value === inq.inquiryId ? null : inq.inquiryId }

async function load() {
  pending.value = true; error.value = ''
  try {
    const params = { pageNum: pageNum.value, pageSize: PAGE_SIZE }
    if (statusFilter.value) params.status = statusFilter.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const result = await api.value.listInquiries(params)
    inquiries.value = result.list
    total.value = result.total
  } catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { pending.value = false }
}

async function doClose(inq) {
  try {
    await ElMessageBox.confirm('关闭后作者将无法再对该询盘报价，确定关闭吗？', '确认关闭', { type: 'warning' })
    await api.value.closeInquiry(inq.inquiryId)
    ElMessage.success('已关闭询盘')
    inq.status = 'closed'
    emit('changed')
  } catch (e) { if (e !== 'cancel') await handleError(e) }
}

watch(keyword, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { pageNum.value = 1; load() }, 300) })
onBeforeUnmount(() => clearTimeout(searchTimer))
defineExpose({ load })
</script>
<style scoped>
.panel-wrap { display: flex; flex-direction: column; min-height: 0 }
.filter-bar { display: flex; gap: 8px; margin-bottom: 10px }
.filter-select, .filter-input { padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff }
.filter-input { flex: 1 }
.inquiry-card { border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px; overflow: hidden; transition: box-shadow .15s }
.inquiry-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.inquiry-card.expanded { border-color: #409eff }
.inquiry-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; transition: background .12s }
.inquiry-header:hover { background: #f5f7fa }
.expand-icon { font-size: 12px; color: #909399; width: 14px; flex-shrink: 0 }
.inq-title { display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-width: 0 }
.inq-summary { flex: 1; font-size: 13px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.inquiry-body { padding: 12px 16px; border-top: 1px solid #ebeef5; background: #fafbfc }
.detail-info p { margin: 4px 0; font-size: 13px; color: #606266 }
.detail-info { margin-bottom: 8px }
.action-bar { display: flex; gap: 8px }
.pagination-bar { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px }
.cost { color: #909399; font-size: 12px }
.load-state { padding: 24px 0; text-align: center; color: #909399; font-size: 13px }
.tag-pending { background: #fdf6ec; color: #e6a23c }
.tag-quoted, .tag-deal { background: #ecf5ff; color: #409eff }
.tag-rejected, .tag-cancelled { background: #fef0f0; color: #f56c6c }
.tag-closed { background: #f4f4f5; color: #909399 }
</style>
