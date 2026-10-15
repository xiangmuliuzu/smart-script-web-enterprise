<template>
  <div id="drawer-company" class="drawer-bg" :data-open="open" @click.self="closeOnBg">
    <aside class="drawer">
      <div class="drawer-head">
        <h2>个人资料</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>
      <div class="drawer-body">
        <LoadState v-if="pending || error" :pending="pending" :error="error" :retry="load" />
        <template v-else>
          <div class="profile-summary">
            <div class="profile-avatar">
              <img v-if="avatar && !broken" :src="avatar" :alt="form.nickname + '的头像'" @error="broken = true">
              <template v-else>{{ avatarText(form.nickname) }}</template>
            </div>
            <div>
              <b>{{ form.nickname || '未设置昵称' }}</b>
              <span>{{ realNameLabel }}</span>
            </div>
          </div>
          <div class="field">
            <label>账号头像</label>
            <label class="btn light small upload-control">
              <input type="file" accept="image/png,image/jpeg" :disabled="uploading" @change="pickAvatar($event.target.files[0]); $event.target.value = ''">
              <span>{{ uploading ? '上传中…' : '更换头像' }}</span>
            </label>
          </div>
          <div class="field">
            <label>昵称</label>
            <input v-model="form.nickname" maxlength="15" placeholder="请输入昵称">
          </div>
          <div class="field">
            <label>手机号</label>
            <!-- 后端只下发掩码手机号，不可编辑。 -->
            <input :value="profile?.phoneMasked || '未绑定'" disabled>
          </div>
          <div class="field">
            <label>常用邮箱</label>
            <!-- 后端用户资料没有邮箱字段。 -->
            <input :value="NOT_OPEN" disabled>
          </div>
          <div class="field">
            <label>个人简介</label>
            <textarea v-model="form.bio" maxlength="200" placeholder="介绍一下你的采购偏好"></textarea>
          </div>
          <button class="btn" style="margin-top:18px" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存修改' }}</button>
          <hr style="border:0;border-top:1px solid var(--line);margin:28px 0">
          <h3>实名认证</h3>
          <p class="rights-note"><span class="tag" :class="realNameTone">{{ realNameLabelText }}</span> {{ realNameNote }}</p>
          <p v-if="realNameStatusValue === 'APPROVED'" class="rights-note">姓名：{{ realName?.realNameMasked || '—' }} · 证件号：{{ realName?.idNumberMasked || '—' }}</p>
          <!-- 只有未提交 / 被驳回可提交，与后端状态机一致：审核中或已认证会被 409 拒绝。 -->
          <form v-if="submittable" class="real-name-form" @submit.prevent="verify">
            <div class="field">
              <label>真实姓名</label>
              <input v-model="identity.realName" maxlength="32" autocomplete="off" placeholder="请输入证件上的姓名">
            </div>
            <div class="field">
              <label>身份证号</label>
              <input v-model="identity.idNumber" maxlength="18" autocomplete="off" placeholder="请输入身份证号">
            </div>
            <div class="field">
              <label>证件照片（正面 / 反面）</label>
              <label class="btn light small upload-control">
                <input type="file" accept="image/png,image/jpeg" multiple :disabled="materialUploading || verifying"
                       @change="uploadMaterials($event.target.files); $event.target.value = ''">
                <span>{{ materialUploading ? '上传中…' : '选择证件照片' }}</span>
              </label>
              <p class="rights-note">{{ materialNames.join('、') || '请选择两张证件照片，每张不超过 5 MB' }}</p>
            </div>
            <p v-if="identityError" class="form-error" role="alert">{{ identityError }}</p>
            <button class="btn small" style="margin-top:12px" :disabled="verifying || materialUploading">{{ verifying ? '提交中…' : '提交认证' }}</button>
          </form>
        </template>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { NOT_OPEN, avatarText, avatarUrl, realNameStatus, state, validateImage } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'saved'])
const { api, user, handleError } = usePortal()
const pending = ref(false)
const error = ref('')
const saving = ref(false)
const uploading = ref(false)
const verifying = ref(false)
const materialUploading = ref(false)
const identityError = ref('')
const profile = ref(null)
const realName = ref(null)
const form = reactive({ nickname: '', bio: '', avatar: '' })
const identity = reactive({ realName: '', idNumber: '', materialRefs: [] })
const materialNames = ref([])
// 头像地址失效时回落汉字圆标，避免破图图标与 alt 文案溢出。
const broken = ref(false)
const avatar = computed(() => avatarUrl(form.avatar))
const realNameStatusValue = computed(() => realName.value?.status || 'NOT_SUBMITTED')
// 状态未取到时（realName 为 null）不假定为「未提交」，避免误开放提交入口。
const submittable = computed(() => !!realName.value && ['NOT_SUBMITTED', 'REJECTED'].includes(realName.value.status))
// 状态接口未取到时（realName 为 null）不谎报状态，明说暂不可用。
const realNameInfo = computed(() => realName.value
  ? state(realNameStatus, realName.value.status, '认证状态待确认')
  : { label: '认证状态待确认', tone: 'gray', note: '实名认证状态暂未取到，请稍后重试。' })
const realNameLabelText = computed(() => realNameInfo.value.label)
const realNameTone = computed(() => realNameInfo.value.tone)
const realNameNote = computed(() => realNameStatusValue.value === 'REJECTED'
  ? realName.value?.rejectReason || realNameInfo.value.note
  : realNameInfo.value.note)
const realNameLabel = computed(() => {
  // 原型显示「已实名认证 · 个人采购者」，这里按真实认证状态与账号类型拼装。
  return realNameLabelText.value + ' · ' + (user.value?.authorCapability ? '创作者' : '采购者')
})
async function load() {
  pending.value = true
  error.value = ''
  try {
    profile.value = await api.value.getProfile()
    form.nickname = profile.value?.nickname || ''
    form.bio = profile.value?.bio || ''
    form.avatar = profile.value?.avatar || ''
    broken.value = false
    realName.value = await api.value.getRealName().catch(() => null)
    resetIdentity()
  } catch (failure) {
    if (!handleError(failure, { silent: true })) error.value = failure.message || '加载个人资料失败'
  } finally { pending.value = false }
}
function resetIdentity() {
  Object.assign(identity, { realName: '', idNumber: '', materialRefs: [] })
  materialNames.value = []
  identityError.value = ''
}
async function pickAvatar(file) {
  if (!file || uploading.value) return
  const invalid = validateImage(file)
  if (invalid) { ElMessage.warning(invalid); return }
  uploading.value = true
  try {
    const result = await api.value.uploadAvatar(file)
    if (!result?.url) throw new Error('头像上传响应缺少图片地址，请重试')
    form.avatar = result.url
    broken.value = false
    // 立刻写回资料，否则只改本地状态、顶栏与刷新后都会回到旧头像。
    await api.value.saveProfile({ nickname: form.nickname, avatar: result.url, bio: form.bio })
    Object.assign(user.value, { avatar: result.url })
    ElMessage.success('头像已更新')
    emit('saved')
  } catch (failure) { handleError(failure) } finally { uploading.value = false }
}
async function save() {
  if (saving.value) return
  const nickname = form.nickname.trim()
  if (!nickname) { ElMessage.warning('请输入昵称'); return }
  saving.value = true
  try {
    await api.value.saveProfile({ nickname, avatar: form.avatar, bio: form.bio.trim() })
    Object.assign(user.value, { nickname, avatar: form.avatar })
    ElMessage.success('个人资料已更新')
    emit('saved')
    await load()
  } catch (failure) { handleError(failure) } finally { saving.value = false }
}
// 证件按后端要求传两张（正/反面），服务端只保留首张引用并校验图片真实格式。
async function uploadMaterials(files) {
  if (materialUploading.value || verifying.value) return
  const list = [...(files || [])]
  // 只清材料，不能动 realName/idNumber：用户通常先填姓名再选照片。
  identity.materialRefs = []
  materialNames.value = []
  identityError.value = ''
  if (list.length !== 2) { identityError.value = '请选择正反面两张证件照片'; return }
  for (const file of list) {
    const issue = validateImage(file)
    if (issue) { identityError.value = issue; return }
  }
  materialUploading.value = true
  try {
    const refs = []
    for (const file of list) {
      const result = await api.value.uploadRealNameMaterial(file)
      if (!result?.materialRef) throw new Error('证件上传响应缺少材料引用，请重试')
      refs.push(result.materialRef)
    }
    identity.materialRefs = refs
    materialNames.value = list.map(file => file.name)
  } catch (failure) {
    identity.materialRefs = []
    materialNames.value = []
    identityError.value = failure.message || '证件照片上传失败，请重试'
  } finally { materialUploading.value = false }
}
async function verify() {
  if (verifying.value || materialUploading.value) return
  identityError.value = ''
  if (identity.realName.trim().length < 2) { identityError.value = '请输入真实姓名'; return }
  // 后端同时接受 15 位旧证与 18 位新证，这里不额外收窄。
  if (!/^(\d{15}|\d{17}[0-9Xx])$/.test(identity.idNumber.trim())) { identityError.value = '请输入有效的身份证号'; return }
  if (!identity.materialRefs.length) { identityError.value = '请先上传证件正反面照片'; return }
  verifying.value = true
  try {
    realName.value = await api.value.submitRealName({
      realName: identity.realName.trim(),
      idNumber: identity.idNumber.trim(),
      materialRefs: identity.materialRefs
    }, realNameStatusValue.value === 'REJECTED')
    resetIdentity()
    ElMessage.success('实名申请已提交，平台审核通过后即可继续采购流程')
    emit('saved')
  } catch (failure) {
    identityError.value = failure.message || '提交失败，请稍后重试'
  } finally { verifying.value = false }
}
watch(() => props.open, open => { if (open) load() }, { immediate: true })
</script>
