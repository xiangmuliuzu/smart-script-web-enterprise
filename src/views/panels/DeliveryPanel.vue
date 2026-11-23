<template>
  <div class="delivery-panel">
    <div class="filter-bar">
      <select v-model="statusFilter" class="filter-select" :disabled="pending" @change="reload">
        <option value="">全部状态</option>
        <option value="pending_upload">待卖方上传</option>
        <option value="pending_confirm">等待买家收货</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
      </select>
      <button class="btn sm quiet" type="button" :disabled="pending" @click="reload">查询</button>
      <span class="cost count">共 {{ total }} 单</span>
    </div>

    <LoadState
      :pending="pending"
      :error="error"
      :retry="load"
      :empty="!pending && !error && !rows.length"
      empty-text="暂无交割记录。需走完交易流程并完成付款后，才会在此生成交割单。"
    />

    <div v-for="item in rows" :key="item.deliveryId" class="delivery-card">
      <div class="delivery-body">
        <div class="delivery-top">
          <b>《{{ item.workTitle || ('作品#' + item.workId) }}》</b>
          <span class="status-tag" :class="'tone-' + deliveryStatusTone(item.status)">{{ deliveryStatusLabel(item.status) }}</span>
          <span class="mine-role cost">我是买方</span>
        </div>
        <p class="meta">交割单号：{{ item.deliveryNo || ('#' + item.deliveryId) }}</p>
        <p class="meta">卖家：{{ item.sellerName || item.sellerId || '-' }}</p>
        <p class="meta">授权类型：{{ deliveryLicenseLabel(item.licenseType) }} · 金额：{{ moneyYuan(item.amount) }}</p>
        <p class="meta">创建时间：{{ dateText(item.createTime) }}</p>
        <p v-if="deliveryStatusDescription(item.status)" class="status-desc">{{ deliveryStatusDescription(item.status) }}</p>
        <div class="foot">
          <span class="cost">订单号：{{ item.orderNo || item.orderId || '-' }}</span>
          <button
            class="btn sm"
            :class="actionOf(item).primary ? 'brand' : 'quiet'"
            type="button"
            @click="openDetail(item.deliveryId)"
          >{{ actionOf(item).label }}</button>
        </div>
      </div>
    </div>

    <div v-if="total > PAGE_SIZE" class="pagination-bar">
      <button class="btn sm ghost" type="button" :disabled="pageNum <= 1 || pending" @click="pageNum--; load()">上一页</button>
      <span class="cost">第 {{ pageNum }} 页 / 共 {{ Math.ceil(total / PAGE_SIZE) }} 页</span>
      <button class="btn sm ghost" type="button" :disabled="pageNum * PAGE_SIZE >= total || pending" @click="pageNum++; load()">下一页</button>
    </div>

    <PortalLayer v-model="detailVisible" title="交割详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.deliveryId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-hero">
          <h3>{{ detail.workTitle || ('作品#' + detail.workId) }}</h3>
          <p class="cost">{{ detail.deliveryNo || ('交割#' + detail.deliveryId) }}</p>
          <p>
            <span class="status-tag" :class="'tone-' + deliveryStatusTone(detail.status)">{{ deliveryStatusLabel(detail.status) }}</span>
          </p>
          <p v-if="deliveryStatusDescription(detail.status)" class="status-desc">{{ deliveryStatusDescription(detail.status) }}</p>
        </div>

        <ul class="rows">
          <li><span class="k">订单号</span><span class="v">{{ detail.orderNo || detail.orderId || '—' }}</span></li>
          <li><span class="k">授权类型</span><span class="v">{{ deliveryLicenseLabel(detail.licenseType) }}</span></li>
          <li><span class="k">交易金额</span><span class="v">{{ moneyYuan(detail.amount) }}</span></li>
          <li><span class="k">买方</span><span class="v">{{ detail.buyerName || detail.buyerId || '—' }}</span></li>
          <li><span class="k">卖方</span><span class="v">{{ detail.sellerName || detail.sellerId || '—' }}</span></li>
          <li v-if="detail.contractNo"><span class="k">合同编号</span><span class="v">{{ detail.contractNo }}</span></li>
          <li v-if="detail.certNo"><span class="k">版权证书号</span><span class="v">{{ detail.certNo }}</span></li>
          <li v-if="detail.remark"><span class="k">备注</span><span class="v">{{ detail.remark }}</span></li>
        </ul>

        <section v-if="detailFiles.length" class="block">
          <h4>已提交材料</h4>
          <ul class="file-list">
            <li v-for="(file, index) in detailFiles" :key="index">
              <div>
                <b>{{ file.fileName || '未命名文件' }}</b>
                <p class="cost">{{ deliveryFileTypeLabel(file.fileType) }} · {{ fileSizeText(file.fileSize) }}</p>
              </div>
              <a v-if="file.fileUrl" class="btn sm ghost" :href="mediaUrl(file.fileUrl)" target="_blank" rel="noopener">打开</a>
            </li>
          </ul>
        </section>
        <section v-else-if="detail.status === 'pending_upload'" class="block">
          <p class="hint">卖方尚未上传交割材料，请耐心等待。</p>
        </section>

        <section class="block">
          <h4>交割进度</h4>
          <ol class="timeline">
            <li v-for="(event, index) in timeline" :key="index">
              <span class="time">{{ event.time }}</span>
              <span class="event">{{ event.event }}</span>
            </li>
          </ol>
        </section>

        <div v-if="canConfirm" class="action-bar">
          <button class="btn sm brand" type="button" :disabled="busy" @click="doConfirm">确认收货</button>
        </div>
      </template>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { asList, contractMoney, dateText, mediaUrl } from '../../utils/enterprise.js'
import {
  deliveryStatusLabel,
  deliveryStatusTone,
  deliveryStatusDescription,
  deliveryFileTypeLabel,
  deliveryLicenseLabel,
  deliveryBuyerActionMeta
} from '../../utils/copyright.js'

const { api, user, handleError } = usePortal()

const PAGE_SIZE = 10
const rows = ref([])
const pending = ref(false)
const error = ref('')
const statusFilter = ref('')
const pageNum = ref(1)
const total = ref(0)

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const busy = ref(false)

const userId = computed(() => Number(user.value?.userId))
const detailFiles = computed(() => Array.isArray(detail.value?.files) ? detail.value.files : [])
const canConfirm = computed(() =>
  detail.value
  && Number(detail.value.buyerId) === userId.value
  && detail.value.status === 'pending_confirm'
)
const timeline = computed(() => {
  const d = detail.value
  if (!d) return []
  const events = [{ time: dateText(d.createTime), event: '交割单已创建' }]
  if (d.uploadTime) events.push({ time: dateText(d.uploadTime), event: '卖方已提交交割材料' })
  if (d.confirmTime) events.push({ time: dateText(d.confirmTime), event: '买方确认收货' })
  if (d.completedTime) events.push({ time: dateText(d.completedTime), event: '交割完成' })
  if (d.status === 'cancelled') events.push({ time: dateText(d.updateTime || d.createTime), event: '交割已取消' })
  return events
})

const moneyYuan = value => contractMoney(value)
const actionOf = item => deliveryBuyerActionMeta(item)
const fileSizeText = size => {
  const n = Number(size) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const result = await api.value.listDeliveries({
      status: statusFilter.value || undefined,
      pageNum: pageNum.value,
      pageSize: PAGE_SIZE
    })
    rows.value = asList(result)
    total.value = Number(result?.total) || 0
  } catch (e) {
    rows.value = []
    total.value = 0
    error.value = e.message
    await handleError(e)
  } finally {
    pending.value = false
  }
}

function reload() {
  pageNum.value = 1
  return load()
}

async function openDetail(deliveryId) {
  if (!deliveryId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getDelivery(deliveryId)
    if (!result) throw new Error('交割单不存在或无权限访问')
    detail.value = result
  } catch (e) {
    detailError.value = e.message
    await handleError(e)
  } finally {
    detailPending.value = false
  }
}

async function openByOrder(orderId) {
  if (!orderId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getDeliveryByOrder(orderId)
    if (!result) throw new Error('该订单暂无交割单')
    detail.value = result
  } catch (e) {
    detailError.value = e.message
    await handleError(e)
  } finally {
    detailPending.value = false
  }
}

async function doConfirm() {
  if (!detail.value?.deliveryId) return
  try {
    await ElMessageBox.confirm('确认已收到交割材料？确认后订单将完成，此操作不可撤销。', '确认收货', { type: 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    const updated = await api.value.confirmDelivery(detail.value.deliveryId)
    detail.value = updated
    ElMessage.success('已确认收货，交割完成')
    await load()
  } catch (e) {
    await handleError(e)
  } finally {
    busy.value = false
  }
}

defineExpose({ openDetail, openByOrder, refresh: load })
onMounted(load)
</script>

<style scoped>
.delivery-panel { max-width: 100%; }
.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-select {
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
  line-height: 30px;
  background: #fff;
  width: 160px;
}
.count { margin-left: 4px; font-size: 12.5px; }
.delivery-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fff;
  transition: box-shadow .15s;
}
.delivery-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.delivery-body { display: flex; flex-direction: column; gap: 4px; }
.delivery-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.delivery-top b { font-size: 14px; }
.mine-role { font-size: 12px; }
.meta { font-size: 12.5px; color: #5c5850; margin: 0; }
.status-desc { margin: 4px 0 0; color: var(--muted, #999); font-size: 12px; line-height: 1.45; }
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 6px;
  gap: 8px;
}
.foot .cost { font-size: 12px; color: var(--muted); }
.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; }
.tone-ok { background: #f0f9eb; color: #67c23a; }
.tone-wait { background: #fdf6ec; color: #e6a23c; }
.tone-warn { background: #fdf6ec; color: #e6a23c; }
.tone-off { background: #f4f4f5; color: #909399; }
.detail-hero { margin-bottom: 12px; }
.detail-hero h3 { margin: 0 0 6px; font-size: 16px; }
.rows { list-style: none; margin: 0; padding: 0; }
.rows li {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #ebeef5;
  font-size: 13px;
}
.rows .k { flex: 0 0 88px; color: var(--muted, #999); }
.rows .v { color: #5c5850; word-break: break-all; }
.block { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.block h4 { margin: 0 0 8px; font-size: 13px; color: #5c5850; font-weight: 500; }
.hint { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.file-list { list-style: none; margin: 0; padding: 0; }
.file-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #ebeef5;
}
.file-list li:last-child { border-bottom: 0; }
.file-list .cost { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.timeline { margin: 0; padding-left: 18px; }
.timeline li { margin: 6px 0; font-size: 13px; color: #5c5850; }
.timeline .time { display: inline-block; min-width: 140px; color: var(--muted); margin-right: 8px; }
.action-bar { display: flex; gap: 8px; margin-top: 16px; }
.pagination-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  margin-top: 4px;
}
.btn { border-radius: 4px; cursor: pointer; border: 1px solid transparent; }
.btn.sm { padding: 4px 12px; font-size: 13px; }
.btn.quiet { background: var(--soft, #f5f5f5); border-color: var(--line, #ebeef5); color: #5c5850; }
.btn.ghost { background: #fff; border-color: #dcdfe6; color: #5c5850; text-decoration: none; }
.btn.brand { background: var(--brand, #1f6f66); border-color: var(--brand, #1f6f66); color: #fff; }
.btn:disabled { opacity: .6; cursor: not-allowed; }
</style>
