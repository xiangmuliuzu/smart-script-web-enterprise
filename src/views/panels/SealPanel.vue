<template>
  <div class="seal-panel">
    <div class="filter-bar">
      <select v-model="reviewStatus" class="filter-select">
        <option value="">全部审核状态</option>
        <option value="pending">审核中</option>
        <option value="approved">审核通过</option>
        <option value="rejected">审核驳回</option>
      </select>
      <input v-model="keyword" class="filter-input" placeholder="搜索印章名称 / 编号" @keyup.enter="noop">
      <button class="btn sm brand" type="button" :disabled="busy" @click="openCreate">上传印章</button>
    </div>

    <LoadState :pending="pending" :error="loadError" :retry="load" />
    <div v-if="!pending && !loadError && !filteredSeals.length" class="load-state">
      <p>{{ seals.length ? '没有符合筛选条件的印章' : '暂无印章' }}</p>
      <button v-if="!seals.length" class="btn sm brand" type="button" style="margin-top:10px" :disabled="busy" @click="openCreate">上传印章</button>
    </div>

    <div
      v-for="item in filteredSeals"
      :key="item.sealId"
      class="seal-card"
      @click="openDetail(item.sealId)"
    >
      <div class="seal-cover">
        <img v-if="item.sealImageUrl" :src="srcOf(item.sealImageUrl)" alt="" @error="onImgError($event, item.sealImageUrl)" />
        <span v-else class="glyph">印</span>
      </div>
      <div class="seal-body">
        <div class="seal-top">
          <b>{{ item.sealName || '未命名印章' }}</b>
          <span class="status-tag" :class="'tag-' + item.reviewStatus">{{ reviewStatusLabel(item.reviewStatus) }}</span>
          <span class="mine-role cost">{{ sealStatusLabel(item.sealStatus) }}</span>
        </div>
        <p class="seal-meta">印章编号：#{{ item.sealId }}</p>
        <p class="seal-meta">申请时间：{{ dateText(item.createTime) }}</p>
        <p v-if="item.reviewTime" class="seal-meta">审核时间：{{ dateText(item.reviewTime) }}</p>
        <p v-if="item.reviewStatus === 'rejected' && item.rejectReason" class="seal-meta reject">驳回原因：{{ item.rejectReason }}</p>
        <div class="seal-foot">
          <span class="cost">签署合同时可选用审核通过且启用中的印章</span>
          <div class="foot-actions">
            <button class="btn sm quiet" type="button" @click.stop="openDetail(item.sealId)">查看详情</button>
            <button class="btn sm ghost" type="button" :disabled="busy" @click.stop="quickEdit(item)">编辑</button>
            <button v-if="canDisable(item)" class="btn sm ghost" type="button" :disabled="busy" @click.stop="quickDisable(item)">停用</button>
          </div>
        </div>
      </div>
    </div>

    <PortalLayer v-model="formVisible" :title="editingId ? '编辑印章' : '上传印章'" modal big :before-close="closeForm">
      <form class="edit-wrap" @submit.prevent="submitForm">
        <div class="edit-row">
          <label class="edit-label">印章名称</label>
          <input v-model="form.sealName" class="edit-input" maxlength="50" placeholder="例如：企业公章" required :disabled="formBusy" @input="formDirty = true" />
        </div>
        <div class="edit-row">
          <label class="edit-label">印章图片（必填，PNG / JPG，≤ 5 MB）</label>
          <label class="drop upload-control seal-drop" :class="{ done: !!form.sealImageUrl || !!localSealPreview }">
            <input type="file" accept="image/png,image/jpeg" :disabled="formBusy" @change="onSealImage($event.target.files[0]); $event.target.value = ''" />
            <span>{{ form.sealImageUrl || localSealPreview ? '已选择印章图片，点击可更换' : '点击上传印章图片' }}</span>
          </label>
          <img v-if="formSealPreview" class="seal-preview" :src="formSealPreview" alt="印章预览" @error="onImgError($event, form.sealImageUrl)" />
        </div>
        <div class="edit-row">
          <label class="edit-label">审核材料（选填）</label>
          <label class="drop upload-control seal-drop">
            <input type="file" accept="image/png,image/jpeg,.pdf,.doc,.docx,.txt" multiple :disabled="formBusy" @change="onMaterials($event.target.files); $event.target.value = ''" />
            <span>{{ formBusy && uploadingMaterial ? '正在上传材料…' : '可上传企业资质 / 授权相关材料' }}</span>
          </label>
          <ul v-if="form.materials.length" class="material-list">
            <li v-for="(item, index) in form.materials" :key="item.url + index">
              <button type="button" class="text-button material-name" :title="item.name" @click="openPreview(item.url, item.name)">{{ item.name }}</button>
              <button type="button" class="btn sm ghost" :disabled="formBusy" @click="form.materials.splice(index, 1); formDirty = true">移除</button>
            </li>
          </ul>
        </div>
        <p class="cost edit-note">提交后由平台审核；编辑已通过的印章会重新进入审核。启用中的印章需先停用再编辑。</p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="edit-actions">
          <button class="btn ghost sm" type="button" :disabled="formBusy" @click="formVisible = false">取消</button>
          <button class="btn sm brand" type="submit" :disabled="formBusy">{{ formBusy ? '提交中…' : (editingId ? '保存并重新提交审核' : '提交审核') }}</button>
        </div>
      </form>
    </PortalLayer>

    <PortalLayer v-model="detailVisible" title="印章详情" modal big>
      <LoadState :pending="detailPending" :error="detailError" :retry="() => openDetail(detail?.sealId)" />
      <template v-if="detail && !detailPending && !detailError">
        <div class="detail-card">
          <div class="seal-cover detail">
            <button v-if="detail.sealImageUrl" type="button" class="cover-hit" @click="openPreview(detail.sealImageUrl, detail.sealName || '印章图片')">
              <img :src="srcOf(detail.sealImageUrl)" alt="印章" @error="onImgError($event, detail.sealImageUrl)" />
            </button>
            <span v-else class="glyph">印</span>
          </div>
          <div class="seal-body">
            <div class="seal-top">
              <b>{{ detail.sealName || '未命名印章' }}</b>
              <span class="status-tag" :class="'tag-' + detail.reviewStatus">{{ reviewStatusLabel(detail.reviewStatus) }}</span>
              <span class="mine-role cost">{{ sealStatusLabel(detail.sealStatus) }}</span>
            </div>
            <p class="seal-meta">印章编号：#{{ detail.sealId }}</p>
            <p class="seal-meta">申请时间：{{ dateText(detail.createTime) }}</p>
            <p v-if="detail.reviewTime" class="seal-meta">审核时间：{{ dateText(detail.reviewTime) }}</p>
            <p v-if="detail.reviewStatus === 'rejected' && detail.rejectReason" class="seal-meta reject">驳回原因：{{ detail.rejectReason }}</p>
          </div>
        </div>

        <div class="section-head"><b>审核材料</b></div>
        <ul v-if="detailMaterials.length" class="material-list">
          <li v-for="(item, index) in detailMaterials" :key="item.url + index">
            <span class="material-name" :title="item.name">{{ item.name }}</span>
            <div class="material-actions">
              <button type="button" class="text-button" @click="openPreview(item.url, item.name)">在线预览</button>
              <button type="button" class="text-button" @click="downloadMaterial(item.url, item.name)">下载</button>
            </div>
          </li>
        </ul>
        <div v-else class="load-state compact"><p>暂无审核材料</p></div>

        <div class="edit-actions" style="margin-top:16px">
          <button class="btn sm brand" type="button" :disabled="busy" @click="startEdit">编辑印章</button>
          <button v-if="canDisable(detail)" class="btn sm ghost" type="button" :disabled="busy" @click="doDisable">停用</button>
          <button class="btn sm ghost" type="button" :disabled="busy" @click="doDelete">删除</button>
        </div>
      </template>
    </PortalLayer>

    <PortalLayer v-model="previewVisible" :title="previewTitle" modal big>
      <div v-loading="previewLoading" class="preview-wrap">
        <div v-if="previewError" class="load-state">
          <p>{{ previewError }}</p>
          <div class="foot-actions" style="justify-content:center;margin-top:10px">
            <button class="btn sm brand" type="button" @click="retryPreview">重试</button>
            <button class="btn sm ghost" type="button" @click="downloadMaterial(previewRaw, previewTitle)">下载文件</button>
          </div>
        </div>
        <div v-else-if="previewKind === 'image'" class="preview-frame">
          <img :src="previewSrc" alt="预览" @error="previewError = '图片加载失败，请尝试下载查看'" @load="previewLoading = false" />
        </div>
        <iframe v-else-if="previewKind === 'pdf'" class="preview-frame pdf" :src="previewSrc" title="PDF 预览" @load="previewLoading = false" />
        <pre v-else-if="previewKind === 'text'" class="preview-text">{{ previewText }}</pre>
        <div v-else class="load-state">
          <p>{{ previewKind === 'office' ? 'Word / Excel 等 Office 文档暂不支持在线预览，请下载后用本地软件打开。' : '该文件格式暂不支持在线预览，请下载后查看。' }}</p>
          <button class="btn sm brand" type="button" style="margin-top:10px" @click="downloadMaterial(previewRaw, previewTitle)">下载文件</button>
        </div>
      </div>
    </PortalLayer>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalLayer from '../../components/PortalLayer.vue'
import LoadState from '../../components/LoadState.vue'
import { usePortal } from '../../utils/portal.js'
import { dateText, mediaUrl } from '../../utils/enterprise.js'
import {
  reviewStatusLabel, sealStatusLabel,
  canDisable, needsDisableBeforeEdit, materialItems, joinMaterialUrls, materialKind, fileNameFromUrl,
  validateFile, decodeTextBuffer
} from '../../utils/seal.js'

const { api, handleError } = usePortal()
const seals = ref([])
const pending = ref(false)
const loadError = ref('')
const busy = ref(false)
const reviewStatus = ref('')
const keyword = ref('')

const filteredSeals = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  return seals.value.filter(item => {
    if (reviewStatus.value && item.reviewStatus !== reviewStatus.value) return false
    if (!key) return true
    const name = (item.sealName || '').toLowerCase()
    const idText = String(item.sealId || '')
    return name.includes(key) || idText.includes(key)
  })
})

const formVisible = ref(false)
const editingId = ref(null)
const form = reactive({ sealName: '', sealImageUrl: '', materials: [] })
const formError = ref('')
const formBusy = ref(false)
const uploadingMaterial = ref(false)
const formDirty = ref(false)
const localSealPreview = ref('')

const detailVisible = ref(false)
const detail = ref(null)
const detailPending = ref(false)
const detailError = ref('')
const detailMaterials = computed(() => materialItems(detail.value?.materialUrls))

const previewVisible = ref(false)
const previewTitle = ref('材料预览')
const previewRaw = ref('')
const previewText = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewSrc = computed(() => mediaUrl(previewRaw.value))
const previewKind = computed(() => materialKind(previewRaw.value))
const formSealPreview = computed(() => localSealPreview.value || (form.sealImageUrl ? mediaUrl(form.sealImageUrl) : ''))

function noop() {}
function srcOf(raw) { return mediaUrl(raw) }

function onImgError(event, raw) {
  const img = event?.target
  if (!img || img.dataset.fallback === '1') return
  const primary = mediaUrl(raw)
  const mediaIndex = String(raw || '').indexOf('/profile/')
  const bare = mediaIndex >= 0 ? String(raw).slice(mediaIndex) : (String(raw || '').startsWith('/profile/') ? String(raw) : '')
  if (!bare || bare === primary || img.src.endsWith(bare)) return
  img.dataset.fallback = '1'
  img.src = bare
}

function clearLocalPreview() {
  if (localSealPreview.value) {
    URL.revokeObjectURL(localSealPreview.value)
    localSealPreview.value = ''
  }
}

async function openPreview(url, title) {
  if (!url) return
  previewRaw.value = url
  previewTitle.value = title || '材料预览'
  previewText.value = ''
  previewError.value = ''
  previewLoading.value = true
  previewVisible.value = true
  const kind = materialKind(url)
  if (kind === 'text') {
    try {
      const response = await fetch(mediaUrl(url))
      if (!response.ok) throw new Error('文本加载失败（' + response.status + '）')
      const contentType = response.headers.get('content-type') || ''
      const buffer = await response.arrayBuffer()
      if (contentType.includes('application/json')) {
        const jsonText = new TextDecoder('utf-8').decode(buffer)
        if (jsonText.includes('"code"')) throw new Error('材料地址无效或无权限，请重新上传后重试')
      }
      previewText.value = decodeTextBuffer(buffer)
      previewError.value = ''
    } catch (failure) {
      previewError.value = failure.message || '文本加载失败'
    } finally {
      previewLoading.value = false
    }
    return
  }
  if (kind === 'image' || kind === 'pdf') return
  previewLoading.value = false
}

function retryPreview() {
  openPreview(previewRaw.value, previewTitle.value)
}

async function downloadMaterial(url, name) {
  if (!url) return
  try {
    const response = await fetch(mediaUrl(url))
    if (!response.ok) throw new Error('下载失败（' + response.status + '）')
    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()
    if (contentType.includes('application/json') || (buffer.byteLength < 200 && new TextDecoder('utf-8').decode(buffer).includes('"code"'))) {
      throw new Error('文件无法下载，请稍后重试')
    }
    const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = name || fileNameFromUrl(url) || 'material'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    ElMessage.success('已开始下载')
  } catch (failure) {
    ElMessage.error(failure.message || '下载失败')
  }
}

async function load() {
  pending.value = true
  loadError.value = ''
  try { seals.value = await api.value.listSeals() }
  catch (failure) { loadError.value = failure.message; await handleError(failure) }
  finally { pending.value = false }
}

function resetForm() {
  editingId.value = null
  form.sealName = ''
  form.sealImageUrl = ''
  form.materials = []
  formError.value = ''
  formDirty.value = false
  clearLocalPreview()
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

async function openDetail(sealId) {
  if (!sealId) return
  detailVisible.value = true
  detailPending.value = true
  detailError.value = ''
  detail.value = null
  try {
    const result = await api.value.getSeal(sealId)
    if (!result) throw new Error('印章不存在或无权限访问')
    detail.value = result
  } catch (failure) {
    detailError.value = failure.message
    await handleError(failure)
  } finally {
    detailPending.value = false
  }
}

async function closeForm(done) {
  if (formBusy.value) return
  if (formDirty.value) {
    try { await ElMessageBox.confirm('还有未提交的内容，确定关闭？', '未保存的内容', { confirmButtonText: '关闭', cancelButtonText: '继续编辑' }) }
    catch { return }
  }
  resetForm()
  done()
}

async function onSealImage(file) {
  if (!file || formBusy.value) return
  formError.value = validateFile(file, ['png', 'jpg', 'jpeg'], 5)
  if (formError.value) return
  clearLocalPreview()
  localSealPreview.value = URL.createObjectURL(file)
  formBusy.value = true
  try {
    const result = await api.value.upload(file, 'seal')
    if (!result?.url) throw new Error('印章图片上传失败，请重试')
    form.sealImageUrl = result.url
    formDirty.value = true
  } catch (failure) {
    formError.value = failure.message
    clearLocalPreview()
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function onMaterials(fileList) {
  if (!fileList?.length || formBusy.value) return
  const files = [...fileList]
  for (const file of files) {
    const issue = validateFile(file, ['png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'txt'], 10)
    if (issue) { formError.value = issue; return }
  }
  formBusy.value = true
  uploadingMaterial.value = true
  formError.value = ''
  try {
    for (const file of files) {
      const result = await api.value.upload(file, 'seal')
      if (!result?.url) throw new Error('材料上传失败，请重试')
      form.materials.push({
        url: result.url,
        name: result.fileName || file.name || fileNameFromUrl(result.url) || `材料 ${form.materials.length + 1}`
      })
    }
    formDirty.value = true
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    uploadingMaterial.value = false
    formBusy.value = false
  }
}

async function submitForm() {
  if (formBusy.value) return
  formError.value = ''
  if (!form.sealName.trim()) { formError.value = '请填写印章名称'; return }
  if (!form.sealImageUrl) { formError.value = '请上传印章图片'; return }
  formBusy.value = true
  try {
    const payload = {
      sealName: form.sealName.trim(),
      sealImageUrl: form.sealImageUrl,
      materialUrls: joinMaterialUrls(form.materials)
    }
    if (editingId.value) await api.value.updateSeal(editingId.value, payload)
    else await api.value.createSeal(payload)
    ElMessage.success(editingId.value ? '已保存，请等待重新审核' : '提交成功，请等待审核')
    formDirty.value = false
    formVisible.value = false
    resetForm()
    await load()
    if (detailVisible.value && detail.value?.sealId) await openDetail(detail.value.sealId)
  } catch (failure) {
    formError.value = failure.message
    await handleError(failure)
  } finally {
    formBusy.value = false
  }
}

async function fillEditFrom(seal) {
  if (!seal) return false
  if (needsDisableBeforeEdit(seal)) {
    try {
      await ElMessageBox.confirm('启用中的印章需先停用才能编辑，是否现在停用并继续编辑？', '编辑印章', { confirmButtonText: '停用并编辑', cancelButtonText: '取消', type: 'warning' })
    } catch { return false }
    detail.value = seal
    const ok = await runDisable()
    if (!ok || detail.value?.sealStatus === 'enabled') return false
    seal = detail.value
  }
  clearLocalPreview()
  editingId.value = seal.sealId
  form.sealName = seal.sealName || ''
  form.sealImageUrl = seal.sealImageUrl || ''
  form.materials = materialItems(seal.materialUrls)
  formError.value = ''
  formDirty.value = false
  formVisible.value = true
  return true
}

async function startEdit() {
  if (!detail.value || busy.value) return
  await fillEditFrom(detail.value)
}

async function quickEdit(item) {
  if (!item || busy.value) return
  await fillEditFrom(item)
}

async function runDisable() {
  if (!detail.value) return false
  busy.value = true
  try {
    await api.value.disableSeal(detail.value.sealId)
    ElMessage.success('印章已停用')
    await load()
    detail.value = await api.value.getSeal(detail.value.sealId)
    return true
  } catch (failure) {
    await handleError(failure)
    return false
  } finally {
    busy.value = false
  }
}

async function doDisable() {
  if (!detail.value || busy.value) return
  try {
    await ElMessageBox.confirm('停用后该印章将无法用于签署，确定停用？', '停用印章', { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  await runDisable()
}

async function quickDisable(item) {
  if (!item || busy.value) return
  try {
    await ElMessageBox.confirm('停用后该印章将无法用于签署，确定停用？', '停用印章', { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  detail.value = item
  await runDisable()
}

async function doDelete() {
  if (!detail.value || busy.value) return
  try {
    await ElMessageBox.confirm('删除后不可恢复，确定删除该印章？', '删除印章', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    await api.value.deleteSeal(detail.value.sealId)
    ElMessage.success('印章已删除')
    detailVisible.value = false
    detail.value = null
    await load()
  } catch (failure) {
    await handleError(failure)
  } finally {
    busy.value = false
  }
}

onMounted(load)
onUnmounted(clearLocalPreview)
</script>

<style scoped>
/* 对齐合同栏：右侧抽屉内容区 + 统一筛选项高度；主色用头像同色 --brand */
.seal-panel { max-width: 100%; }

.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-select,
.filter-input,
.filter-bar .btn.sm {
  box-sizing: border-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
  line-height: 30px;
  background: #fff;
  vertical-align: middle;
}
.filter-select { min-width: 132px }
.filter-input { width: 200px }
.filter-bar .btn.sm {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0 14px;
}

.seal-card { display: flex; gap: 12px; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fff; transition: box-shadow .15s; cursor: pointer }
.seal-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,.06) }
.detail-card { display: flex; gap: 12px; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 14px; background: #fff }

.seal-cover {
  width: 88px; height: 88px; flex-shrink: 0; align-self: flex-start;
  border-radius: 4px; overflow: hidden;
  background: linear-gradient(160deg, #E9E5DA 0%, #DAD5C7 100%);
  display: grid; place-items: center; border: 1px solid #ebeef5;
}
.seal-cover.detail { width: 108px; height: 108px }
.seal-cover img { width: 100%; height: 100%; object-fit: contain; background: #fff }
.seal-cover .glyph { font-size: 28px; color: rgba(27,26,24,.18); font-weight: 600 }
.cover-hit { width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in }
.cover-hit img { width: 100%; height: 100%; object-fit: contain; display: block; background: #fff }

.seal-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px }
.seal-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.seal-top b { font-size: 14px }
.mine-role { font-size: 12px }
.seal-meta { font-size: 12.5px; color: #606266; margin: 0 }
.seal-meta.reject { color: #f56c6c }
.seal-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; gap: 8px }
.seal-foot .cost { font-size: 12px; color: #909399 }
.foot-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }

.status-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 500 }
.tag-pending { background: #fdf6ec; color: #e6a23c }
.tag-approved { background: #f0f9eb; color: #67c23a }
.tag-rejected { background: #fef0f0; color: #f56c6c }

.load-state { padding: 24px 0; text-align: center; color: #909399; font-size: 13px }
.load-state.compact { padding: 12px 0 }

.btn { border-radius: 4px; cursor: pointer }
.btn.sm { padding: 4px 12px; font-size: 13px; height: 32px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center }
.btn.quiet { background: #f4f4f5; border: 1px solid #e4e7ed; color: #606266 }
.btn.ghost { background: #fff; border: 1px solid #dcdfe6; color: #606266 }
/* 主按钮：与顶栏头像圆标同色 var(--brand)=#2c4a52 */
.btn.brand,
.btn.sm.brand {
  background: var(--brand, #2c4a52);
  border: 1px solid var(--brand, #2c4a52);
  color: #fff;
}
.btn.brand:hover:not(:disabled),
.btn.sm.brand:hover:not(:disabled) {
  background: var(--brand2, #4a6c74);
  border-color: var(--brand2, #4a6c74);
}
.btn.brand:disabled { opacity: .55; cursor: not-allowed }

.edit-wrap { display: flex; flex-direction: column; gap: 12px; min-height: 200px }
.edit-row { display: flex; flex-direction: column; gap: 6px }
.edit-label { font-size: 13px; color: #606266 }
.edit-input {
  width: 100%; box-sizing: border-box; height: 32px; padding: 0 10px;
  border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; outline: none;
}
.edit-input:focus { border-color: var(--brand, #2c4a52); box-shadow: 0 0 0 2px rgba(44, 74, 82, .12) }
.edit-note { font-size: 12px; margin: 0 }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px }
.form-error { margin: 0; color: #f56c6c; font-size: 13px }

.seal-drop {
  display: block; width: 100%; box-sizing: border-box; min-height: 84px; padding: 22px 16px;
  text-align: center; background: #fafafa; border: 1px dashed #d9d9d9;
  border-radius: 6px; color: #606266; line-height: 1.5; cursor: pointer; position: relative;
}
.seal-drop.done { border-style: solid; border-color: var(--brand, #2c4a52); background: var(--brandsoft, #e4ecec); color: var(--brand, #2c4a52) }
.seal-preview { width: 120px; height: 120px; object-fit: contain; border: 1px solid #ebeef5; border-radius: 4px; background: #fff }

.section-head { margin: 8px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #ebeef5; font-size: 14px }
.material-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px }
.material-list li {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; background: #fafafa; border: 1px solid #ebeef5; border-radius: 6px;
}
.material-name { color: #303133; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left }
.material-actions { display: flex; gap: 12px; align-items: center }
.text-button { border: 0; background: none; color: var(--brand2, #4a6c74); cursor: pointer; padding: 0; font: inherit }
.text-button:hover { color: var(--brand, #2c4a52) }

.preview-wrap { min-height: 200px }
.preview-frame { display: grid; place-items: center; min-height: 360px; background: #f7f7f7; border-radius: 6px; padding: 12px }
.preview-frame img { max-width: 100%; max-height: 70vh; object-fit: contain }
.preview-frame.pdf { width: 100%; height: 70vh; border: 0; background: #fff; padding: 0 }
.preview-text { max-height: 70vh; overflow: auto; padding: 16px; background: #fafafa; border-radius: 6px; white-space: pre-wrap; word-break: break-word }
</style>
