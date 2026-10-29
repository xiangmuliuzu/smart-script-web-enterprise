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
            <p v-if="identityError" class="form-error" role="alert">{{ identityError }}</p>
            <button class="btn small" style="margin-top:12px" :disabled="verifying">{{ verifying ? '提交中…' : '提交认证' }}</button>
          </form>
          <hr style="border:0;border-top:1px solid var(--line);margin:28px 0">
          <h3>账号安全</h3>
          <ul class="security-list">
            <li>
              <div><b>登录密码</b><span>定期修改更安全</span></div>
              <button class="btn ghost small" type="button" @click="passwordOpen = true">修改</button>
            </li>
            <li>
              <div><b>绑定手机</b><span>{{ profile?.phoneMasked || '未绑定' }}</span></div>
              <button class="btn ghost small" type="button" @click="phoneOpen = true">换绑</button>
            </li>
            <li>
              <div><b>登录设备</b><span>当前浏览器</span></div>
              <!-- 后端没有设备管理端点，保持原型里「有入口但不可用」的形态。 -->
              <button class="btn ghost small" type="button" disabled>管理</button>
            </li>
          </ul>
        </template>
      </div>
    </aside>
  </div>

  <div id="password-modal" class="modal-bg" :data-open="open && passwordOpen">
    <div class="modal" style="width:min(460px,92vw)">
      <div class="drawer-head">
        <h2>修改登录密码</h2>
        <button class="close" type="button" @click="closePassword">×</button>
      </div>
      <div class="drawer-body">
        <form @submit.prevent="updatePassword">
          <div class="field"><label>原密码</label><input v-model="password.oldPassword" type="password" autocomplete="current-password" minlength="8" maxlength="64"></div>
          <div class="field"><label>新密码</label><input v-model="password.newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="64"></div>
          <div class="field"><label>确认新密码</label><input v-model="password.confirm" type="password" autocomplete="new-password" minlength="8" maxlength="64"></div>
          <p class="rights-note" style="margin-top:12px">密码长度 8–64 位，修改后需要重新登录。</p>
          <p v-if="passwordError" class="form-error" role="alert">{{ passwordError }}</p>
          <button class="btn" style="margin-top:18px" :disabled="passwordSaving">{{ passwordSaving ? '保存中…' : '确认修改' }}</button>
        </form>
      </div>
    </div>
  </div>

  <div id="phone-modal" class="modal-bg" :data-open="open && phoneOpen">
    <div class="modal" style="width:min(460px,92vw)">
      <div class="drawer-head">
        <h2>换绑手机</h2>
        <button class="close" type="button" @click="closePhone">×</button>
      </div>
      <div class="drawer-body">
        <p class="rights-note">{{ phoneStep === 1 ? '先验证当前绑定手机，验证后再绑定新号码。' : '当前手机已验证，请填写新手机号与验证码。' }}</p>
        <form @submit.prevent="confirmPhone">
          <div v-if="phoneStep === 1" class="field"><label>当前手机</label><input :value="profile?.phoneMasked || '服务端绑定的手机'" disabled></div>
          <div v-else class="field"><label>新手机号</label><input v-model="newPhone" inputmode="tel" maxlength="11" placeholder="请输入新手机号" :disabled="phoneSending"></div>
          <div class="field">
            <label>短信验证码</label>
            <div class="captcha-row">
              <input v-model="phoneCode" inputmode="numeric" maxlength="6" placeholder="6 位验证码" :disabled="phoneSending">
              <button type="button" class="btn ghost small" :disabled="phoneSending || countdown > 0" @click="sendPhoneCode">{{ countdown > 0 ? countdown + ' 秒后重试' : '获取验证码' }}</button>
            </div>
          </div>
          <p v-if="phoneError" class="form-error" role="alert">{{ phoneError }}</p>
          <button class="btn" style="margin-top:18px" :disabled="phoneSending">{{ phoneSending ? '处理中…' : phoneStep === 1 ? '验证并继续' : '确认换绑' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import LoadState from './LoadState.vue'
import { usePortal } from '../utils/portal.js'
import { clearSession } from '../auth.js'
import { NOT_OPEN, avatarText, avatarUrl, realNameStatus, state, validateImage } from '../utils/enterprise.js'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'saved'])
const { api, user, handleError } = usePortal()
const router = useRouter()
const pending = ref(false)
const error = ref('')
const saving = ref(false)
const uploading = ref(false)
const verifying = ref(false)
const identityError = ref('')
const profile = ref(null)
const realName = ref(null)
const form = reactive({ nickname: '', bio: '', avatar: '' })
const identity = reactive({ realName: '', idNumber: '' })
// 头像地址失效时回落汉字圆标，避免破图图标与 alt 文案溢出。
const broken = ref(false)
// 账号安全：修改密码与换绑手机，各自一个模态层，逻辑与创作者端一致。
const passwordOpen = ref(false)
const password = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const passwordError = ref('')
const passwordSaving = ref(false)
const phoneOpen = ref(false)
const phoneStep = ref(1)
const phoneCode = ref('')
const newPhone = ref('')
const stepUpToken = ref('')
const phoneError = ref('')
const phoneSending = ref(false)
const countdown = ref(0)
const deviceId = crypto.randomUUID()
let countdownTimer
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
  Object.assign(identity, { realName: '', idNumber: '' })
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
async function verify() {
  if (verifying.value) return
  identityError.value = ''
  if (identity.realName.trim().length < 2) { identityError.value = '请输入真实姓名'; return }
  if (!/^\d{17}[0-9Xx]$/.test(identity.idNumber.trim())) { identityError.value = '请输入有效的 18 位身份证号'; return }
  verifying.value = true
  try {
    realName.value = await api.value.submitRealName({
      realName: identity.realName.trim(),
      idNumber: identity.idNumber.trim()
    }, realNameStatusValue.value === 'REJECTED')
    resetIdentity()
    ElMessage.success('实名核验已完成')
    emit('saved')
  } catch (failure) {
    identityError.value = failure.message || '提交失败，请稍后重试'
  } finally { verifying.value = false }
}
/* ---------------- 账号安全 ---------------- */
function closePassword() {
  if (passwordSaving.value) return
  Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' })
  passwordError.value = ''
  passwordOpen.value = false
}
async function updatePassword() {
  if (passwordSaving.value) return
  passwordError.value = ''
  const { oldPassword, newPassword, confirm } = password
  if (!oldPassword) { passwordError.value = '请输入原密码'; return }
  if (newPassword.length < 8 || newPassword.length > 64 || newPassword !== confirm) { passwordError.value = '新密码需为 8–64 位，且两次输入一致'; return }
  passwordSaving.value = true
  try {
    await api.value.changePassword({ oldPassword, newPassword })
    closePassword()
    ElMessage.success('密码已修改，请重新登录')
    // 令牌是无状态的，改密后本地必须清会话，否则旧令牌仍然有效。
    clearSession()
    router.replace('/login')
  } catch (failure) { passwordError.value = failure.message || '密码修改失败，请稍后重试' } finally { passwordSaving.value = false }
}
function closePhone() {
  if (phoneSending.value) return
  clearInterval(countdownTimer)
  phoneStep.value = 1
  phoneCode.value = ''
  newPhone.value = ''
  stepUpToken.value = ''
  phoneError.value = ''
  countdown.value = 0
  phoneOpen.value = false
}
function startCountdown() {
  clearInterval(countdownTimer)
  countdown.value = 60
  countdownTimer = setInterval(() => { countdown.value -= 1; if (countdown.value <= 0) clearInterval(countdownTimer) }, 1000)
}
async function sendPhoneCode() {
  if (phoneSending.value || countdown.value > 0) return
  if (phoneStep.value === 2 && !/^1[3-9]\d{9}$/.test(newPhone.value)) { phoneError.value = '请输入有效的新手机号'; return }
  phoneSending.value = true
  phoneError.value = ''
  try {
    // old/send 不接受号码参数：号码由服务端按当前身份取。
    await api.value.phoneChange(phoneStep.value === 1 ? 'old/send' : 'new/send', phoneStep.value === 1 ? undefined : { newPhone: newPhone.value, deviceId })
    startCountdown()
    ElMessage.success('验证码已发送')
  } catch (failure) { phoneError.value = failure.message || '验证码发送失败，请稍后重试' } finally { phoneSending.value = false }
}
async function confirmPhone() {
  if (phoneSending.value) return
  if (!/^\d{6}$/.test(phoneCode.value)) { phoneError.value = '请输入有效的六位验证码'; return }
  phoneSending.value = true
  phoneError.value = ''
  try {
    if (phoneStep.value === 1) {
      const result = await api.value.phoneChange('old/verify', { code: phoneCode.value, deviceId })
      if (!result?.stepUpToken) throw new Error('验证响应缺少凭证，请重试')
      stepUpToken.value = result.stepUpToken
      phoneStep.value = 2
      phoneCode.value = ''
      countdown.value = 0
      clearInterval(countdownTimer)
    } else {
      if (!/^1[3-9]\d{9}$/.test(newPhone.value)) throw new Error('请输入有效的新手机号')
      await api.value.phoneChange('confirm', { newPhone: newPhone.value, code: phoneCode.value, stepUpToken: stepUpToken.value, deviceId })
      ElMessage.success('手机已换绑')
      closePhone()
      await load()
      emit('saved')
    }
  } catch (failure) { phoneError.value = failure.message || '操作失败，请稍后重试' } finally { phoneSending.value = false }
}
watch(() => props.open, open => { if (open) load() }, { immediate: true })
onUnmounted(() => { clearInterval(countdownTimer); stepUpToken.value = ''; phoneCode.value = ''; Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' }) })
</script>
