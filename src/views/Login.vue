<template>
  <section class="screen" id="screen-login" data-active="true">
    <div class="login">
      <div class="login-visual">
        <button class="brand" type="button" @click="ElMessage.info('剧云策 · 个人版权采购中心')"><strong>剧云策</strong><span>个人版权采购中心</span></button>
        <div class="visual-copy">
          <div class="eyebrow">SCRIPT CLOUD · BUYER WORKSPACE</div>
          <h1>管理已购作品<br>推进项目制作。</h1>
          <p>从报价确认、合同签署到作品交付，个人采购事项集中在一个工作台完成。</p>
        </div>
        <picture>
          <source :srcset="enterpriseIllustration" type="image/webp" media="(min-width: 901px)" />
          <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" width="1254" height="1254" fetchpriority="high" decoding="async" class="login-illustration" alt="采购方讨论剧本和分镜，并签署版权合同" />
        </picture>
        <div class="visual-foot">剧云策 · 智能剧本创作平台</div>
      </div>

      <div class="login-form-wrap">
        <div class="login-form">
          <h2>{{ heading }}</h2>
          <p>{{ subheading }}</p>
          <template v-if="mode === 'login'">
            <form @submit.prevent="submit">
              <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
                <el-form-item label="个人账号" prop="username"><el-input v-model="form.username" placeholder="请输入用户名或手机号" autocomplete="username" size="large" /></el-form-item>
                <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password autocomplete="current-password" size="large" /></el-form-item>
                <el-form-item v-if="captchaEnabled" label="验证码">
                  <div class="captcha-row">
                    <el-input v-model="form.code" placeholder="请输入验证码" maxlength="8" autocomplete="off" size="large" />
                    <button type="button" class="captcha-img" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha">
                      <img v-if="captchaImage" :src="captchaImage" alt="验证码"><span v-else>点击重试</span>
                    </button>
                  </div>
                </el-form-item>
              </el-form>
              <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-message" />
              <!-- 原型 link-row 只有两个入口；「记住密码」是项目既有能力，保留但不额外占用一行。 -->
              <div class="form-options"><el-checkbox v-model="remember">记住密码</el-checkbox><button type="button" class="link" @click="mode = 'reset'">忘记密码？</button></div>
              <button class="btn block" type="submit" :disabled="loading || !captchaReady || captchaLoading">{{ loading ? '登录中…' : '登录个人中心' }}</button>
            </form>
            <div class="link-row">
              <button class="link" type="button" @click="mode = 'sms'">短信登录</button>
              <button class="link" type="button" @click="mode = 'register'">注册个人账号</button>
            </div>
          </template>
          <AccountPanel v-else :mode="mode" @back="mode = 'login'" @switch="mode = $event" @registered="onRegistered" @logged-in="onSmsLoggedIn" />
        </div>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import enterpriseIllustration from '../assets/images/login-enterprise-v2.webp'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { assertUser, getCaptcha, login, safeRedirect } from '../auth.js'
import { portal } from '../portal.js'
import AccountPanel from '../components/AccountPanel.vue'
const route = useRoute()
const router = useRouter()
const formRef = ref(null)
// 登录 / 注册 / 找回密码在同一页切换，不再用弹窗。
const mode = ref('login')
const heading = computed(() => (mode.value === 'register' ? '注册个人账号' : mode.value === 'reset' ? '找回密码' : mode.value === 'sms' ? '短信登录' : '登录个人中心'))
const subheading = computed(() =>
  mode.value === 'register'
    ? '用手机号注册个人账号，注册后直接进入版权采购工作台。'
    : mode.value === 'reset'
      ? '通过绑定手机号接收短信验证码，重置登录密码。'
      : mode.value === 'sms'
        ? '使用手机号和验证码登录，未注册手机号验证后将自动创建账号。'
        : '使用个人账号进入版权采购工作台。'
)
async function onSmsLoggedIn() {
  await router.replace(safeRedirect(route.query.redirect))
}
// 注册接口直接返回 App 域会话，注册成功后按登录同等规则落库并进入工作台。
function onRegistered(result) {
  try {
    assertUser(result.user)
    localStorage.setItem(portal.tokenKey, result.token)
    router.replace('/dashboard')
  } catch (failure) {
    error.value = failure.message || '注册成功但自动登录失败，请使用新账号手动登录'
    mode.value = 'login'
  }
}
// 记住密码：勾选后把账号和密码一起写进本机 localStorage，取消勾选立即清除。
// 兼容早期只存账号的纯文本值，读到时按「只有账号」处理。
function readRemembered() {
  let raw = ''
  try { raw = localStorage.getItem(portal.rememberKey) || '' } catch { return {} }
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? { username: parsed } : parsed || {}
  } catch {
    return { username: raw }
  }
}
const remembered = readRemembered()
const form = reactive({ username: remembered.username || '', password: remembered.password || '', code: '', uuid: '' })
const remember = ref(Boolean(remembered.username || remembered.password))
const loading = ref(false)
const captchaLoading = ref(false)
const captchaEnabled = ref(true)
const captchaReady = ref(false)
const captchaImage = ref('')
const error = ref('')
const rules = { username: [{ validator: (rule, value, callback) => callback(value?.trim() ? undefined : new Error('请输入用户名或手机号')), trigger: 'blur' }], password: [{ required: true, message: '请输入密码', trigger: 'blur' }] }
async function refreshCaptcha() {
  if (captchaLoading.value) return
  captchaLoading.value = true
  captchaReady.value = false
  form.code = ''
  form.uuid = ''
  captchaImage.value = ''
  try {
    const result = await getCaptcha()
    captchaEnabled.value = result.captchaEnabled !== false
    form.uuid = result.uuid || ''
    captchaImage.value = result.img ? (result.img.startsWith('data:') ? result.img : 'data:image/gif;base64,' + result.img) : ''
    captchaReady.value = true
    error.value = ''
  } catch (failure) { error.value = failure.message || '验证码加载失败，请重试' }
  finally { captchaLoading.value = false }
}
async function submit() {
  if (loading.value || !captchaReady.value || captchaLoading.value) return
  loading.value = true
  error.value = ''
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    if (captchaEnabled.value && !form.code.trim()) { error.value = '请输入验证码'; return }
    await login({ ...form, username: form.username.trim() })
    if (remember.value) localStorage.setItem(portal.rememberKey, JSON.stringify({ username: form.username.trim(), password: form.password }))
    else localStorage.removeItem(portal.rememberKey)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (failure) {
    const message = failure.message || '登录失败，请重试'
    await refreshCaptcha()
    error.value = message
  } finally { loading.value = false }
}
onMounted(refreshCaptcha)
</script>
<style scoped>
.login { background: #f1ece3; }
.login-form .btn.block { background: #1f2329; border-color: #1f2329; color: #fff; }
.login-form .btn.block:not(:disabled):hover,
.login-form .btn.block:not(:disabled):focus-visible,
.login-form .btn.block:not(:disabled):active { background: #000; border-color: #000; }
.login-form {
  width: min(100%, 344px);
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.login-visual {
  position: relative;
  isolation: isolate;
  padding: 40px clamp(32px, 4vw, 64px);
  background: #f1ece3;
  color: #292723;
  border-right: 1px solid #d8d0c4;
}
.visual-copy { margin: 26px 0 auto; }
.visual-copy h1 { font-size: clamp(28px, 3vw, 40px); line-height: 1.2; margin: 12px 0; }
.visual-copy .eyebrow, .visual-copy p, .visual-foot { color: #716a60; }
.visual-copy p { font-size: 13px; line-height: 1.7; max-width: 32em; }
.login-illustration {
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 60%;
  transform: translate(-50%, -50%);
  width: 99.36%;
  height: 69%;
  max-width: 800.4px;
  object-fit: contain;
}
/* 原型把登录表单写在静态 HTML 里，这里只补 Element Plus 输入框的尺寸与验证码行。 */
.login-form :deep(.el-form-item) { margin-bottom:16px; }
.login-form :deep(.el-form-item__label) { font-size:12px; color:var(--muted); line-height:1.6; margin-bottom:7px; padding:0; }
.login-form :deep(.el-input__wrapper) { box-shadow:0 0 0 1px var(--line) inset; border-radius:5px; padding:4px 11px; background:#fff; }
.login-form :deep(.el-input__wrapper:hover) { box-shadow:0 0 0 1px var(--brand2) inset; }
.login-form :deep(.el-input__wrapper.is-focus) { box-shadow:0 0 0 1px var(--brand) inset; }
.captcha-row { display:flex; gap:10px; width:100%; }
.captcha-row .el-input { flex:1; }
.captcha-img { width:120px; flex:none; padding:0; border:1px solid var(--line); border-radius:5px; background:#f5f7f7; cursor:pointer; font-size:12px; color:var(--muted); }
.captcha-img img { display:block; width:100%; height:100%; object-fit:contain; }
.form-options { display:flex; align-items:center; justify-content:space-between; margin:10px 0 4px; }
.error-message { margin-top:12px; }
</style>
