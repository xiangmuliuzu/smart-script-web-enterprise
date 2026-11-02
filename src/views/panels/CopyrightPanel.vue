<template>
  <div class="copyright-panel">
    <div class="filter-bar">
      <input v-model="keyword" class="filter-input" placeholder="搜索作品名 / 卖家 / 材料名称" @keyup.enter="reload">
    </div>
    <LoadState :pending="pending" :error="error" :retry="load" />
    <div v-if="!pending && !error && !rows.length" class="load-state">
      <p>暂无版权材料</p>
      <p class="cost empty-hint">仅展示确认收货后、且卖家交割时上传了版权证书的记录</p>
    </div>
    <div v-for="item in rows" :key="item.fileId" class="copyright-card">
      <div class="copyright-cover">
        <img v-if="item.workCover" :src="coverUrl(item.workCover)" alt="" />
        <span v-else class="glyph">{{ (item.workTitle || '版').slice(0, 1) }}</span>
      </div>
      <div class="copyright-body">
        <div class="copyright-top">
          <b>《{{ item.workTitle || '作品' }}》</b>
          <span class="mine-role cost">我是买方</span>
        </div>
        <p class="copyright-meta">卖家：{{ item.sellerName || '-' }}</p>
        <p class="copyright-meta">交割时间：{{ item.deliveryTime || '-' }}</p>
        <p class="copyright-meta">
          版权材料：
          <button type="button" class="link-name" @click="openPreview(item)">{{ item.fileName || '未命名材料' }}</button>
        </p>
        <div class="copyright-foot">
          <span class="cost">订单号：{{ item.orderNo || '#' + item.orderId }}</span>
          <div class="foot-actions">
            <button class="btn sm quiet" type="button" @click="openPreview(item)">查看详情</button>
            <a class="btn sm ghost" :href="mediaUrl(item.fileUrl)" :download="item.fileName || 'copyright'" target="_blank" rel="noopener" @click="onDownloadClick(item, $event)">下载</a>
          </div>
        </div>
      </div>
    </div>
    <div v-if="total > PAGE_SIZE" class="pagination-bar">
      <button class="btn sm ghost" type="button" :disabled="pageNum <= 1" @click="pageNum--; load()">上一页</button>
      <span class="cost">第 {{ pageNum }} 页 / 共 {{ Math.ceil(total / PAGE_SIZE) }} 页</span>
      <button class="btn sm ghost" type="button" :disabled="pageNum * PAGE_SIZE >= total" @click="pageNum++; load()">下一页</button>
    </div>

    <PortalLayer v-model="previewVisible" :title="previewTitle" modal big>
      <div v-loading="previewLoading" class="preview-wrap">
        <template v-if="previewItem">
          <div class="preview-meta">
            <p>作品：《{{ previewItem.workTitle || '-' }}》 · 卖家：{{ previewItem.sellerName || '-' }}</p>
            <p>交割时间：{{ previewItem.deliveryTime || '-' }} · 材料：{{ previewItem.fileName || '-' }}</p>
          </div>
          <iframe v-if="previewKind === 'pdf'" class="preview-frame" :src="previewSrc" title="版权材料预览" />
          <img v-else-if="previewKind === 'image'" class="preview-image" :src="previewSrc" :alt="previewItem.fileName || '版权材料'" />
          <div v-else class="load-state">
            <p>该文件类型暂不支持在线预览，请下载后查看</p>
            <a class="btn sm brand" :href="previewSrc" :download="previewItem.fileName || 'copyright'" target="_blank" rel="noopener">下载到本地</a>
          </div>
          <div v-if="previewKind === 'pdf' || previewKind === 'image'" class="preview-actions">
            <a class="btn sm ghost" :href="previewSrc" :download="previewItem.fileName || 'copyright'" target="_blank" rel="noopener">下载到本地</a>
          </div>
        </template>
        <div v-else class="load-state"><p>{{ previewLoading ? '加载中…' : '版权内容不可用' }}</p></div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { asList, avatarUrl, mediaUrl } from '../../utils/enterprise.js'

const { api, handleError } = usePortal()

const PAGE_SIZE = 10
const rows = ref([])
const pending = ref(false)
const error = ref('')
const keyword = ref('')
const pageNum = ref(1)
const total = ref(0)

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewItem = ref(null)
const previewTitle = ref('版权详情')
const previewSrc = ref('')
const previewKind = ref('other')

const coverUrl = raw => avatarUrl(raw) || raw

async function load() {
  pending.value = true
  error.value = ''
  try {
    const result = await api.value.listBuyerCopyrights({
      keyword: keyword.value.trim(),
      pageNum: pageNum.value,
      pageSize: PAGE_SIZE
    })
    rows.value = asList(result)
    total.value = Number(result?.total) || 0
  } catch (e) {
    error.value = e.message
    await handleError(e)
  } finally {
    pending.value = false
  }
}

function reload() {
  pageNum.value = 1
  load()
}

let keywordTimer = null
watch(keyword, () => {
  clearTimeout(keywordTimer)
  keywordTimer = setTimeout(reload, 300)
})

async function openPreview(item) {
  previewTitle.value = `版权详情 · ${item.fileName || '#' + item.fileId}`
  previewItem.value = null
  previewSrc.value = ''
  previewKind.value = 'other'
  previewVisible.value = true
  previewLoading.value = true
  try {
    const detail = await api.value.getBuyerCopyright(item.fileId)
    previewItem.value = detail || item
    previewSrc.value = mediaUrl(detail?.fileUrl || item.fileUrl)
    previewKind.value = detail?.previewKind || item.previewKind || 'other'
  } catch (e) {
    await handleError(e)
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function onDownloadClick(item, event) {
  if (!item?.fileUrl) {
    event.preventDefault()
    ElMessage.warning('暂无可下载的文件地址')
  }
}

onMounted(load)
defineExpose({ refresh: load })
</script>

<style scoped>
.copyright-panel { max-width: 100%; }
.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-input {
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
  line-height: 30px;
  background: #fff;
  width: 260px;
}
.copyright-card {
  display: flex;
  gap: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fff;
  transition: box-shadow .15s;
}
.copyright-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.copyright-cover {
  width: 108px;
  height: 146px;
  flex-shrink: 0;
  align-self: flex-start;
  border-radius: 4px;
  overflow: hidden;
  background: linear-gradient(160deg, #E9E5DA 0%, #DAD5C7 100%);
  display: grid;
  place-items: center;
  border: 1px solid #ebeef5;
}
.copyright-cover img { width: 100%; height: 100%; object-fit: cover; }
.copyright-cover .glyph { font-size: 32px; color: rgba(27,26,24,.18); font-weight: 600; }
.copyright-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.copyright-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.copyright-top b { font-size: 14px; }
.mine-role { font-size: 12px; }
.copyright-meta { font-size: 12.5px; color: #5c5850; margin: 0; }
.link-name {
  border: 0;
  background: none;
  padding: 0;
  color: var(--brand);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.copyright-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 6px;
  gap: 8px;
}
.copyright-foot .cost { font-size: 12px; color: var(--muted); }
.foot-actions { display: flex; gap: 8px; align-items: center; }
.foot-actions a { text-decoration: none; }
.preview-wrap { min-height: 200px; display: flex; flex-direction: column; gap: 10px; }
.preview-meta { font-size: 12.5px; color: #5c5850; }
.preview-meta p { margin: 0 0 4px; }
.preview-frame {
  width: 100%;
  height: min(68vh, 720px);
  border: 0;
  display: block;
  background: #fff;
}
.preview-image {
  max-width: 100%;
  max-height: min(68vh, 720px);
  display: block;
  margin: 0 auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}
.preview-actions { display: flex; justify-content: flex-end; }
.pagination-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  margin-top: 4px;
}
.load-state { padding: 24px 0; text-align: center; color: var(--muted); font-size: 13px; }
.empty-hint { margin-top: 6px; font-size: 12px; }
.btn { border-radius: 4px; cursor: pointer; }
.btn.sm { padding: 4px 12px; font-size: 13px; }
.btn.quiet { background: var(--soft); border: 1px solid var(--line); color: #5c5850; }
.btn.ghost { background: #fff; border: 1px solid #dcdfe6; color: #5c5850; }
.btn.brand { background: var(--brand, #1f6f66); border: 1px solid var(--brand, #1f6f66); color: #fff; display: inline-flex; margin-top: 10px; }
</style>
