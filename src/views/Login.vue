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
        <div class="visual-foot">剧云策 · 智能剧本创作平台</div>
      </div>

      <div class="login-form-wrap">
        <form class="login-form" @submit.prevent="submit">
          <h2>登录个人中心</h2>
          <p>使用个人账号进入版权采购工作台。</p>
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
          <!-- 原型 link-row 只有两个入口；「记住账号」是项目既有能力，保留但不额外占用一行。 -->
          <div class="form-options"><el-checkbox v-model="remember">记住账号</el-checkbox></div>
          <button class="btn block" type="submit" :disabled="loading || !captchaReady || captchaLoading">{{ loading ? '登录中…' : '登录个人中心' }}</button>
          <div class="link-row">
            <button class="link" type="button" @click="ElMessage.info('短信登录尚未开放，请使用账号密码登录')">短信登录</button>
            <button class="link" type="button" @click="ElMessage.info('请携带身份信息联系平台运营开通账号')">注册个人账号 / 忘记密码</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getCaptcha, login, safeRedirect } from '../auth.js'
import { portal } from '../portal.js'
const route = useRoute()
const router = useRouter()
const formRef = ref(null)
const form = reactive({ username: localStorage.getItem(portal.rememberKey) || '', password: '', code: '', uuid: '' })
const remember = ref(!!form.username)
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
    if (remember.value) localStorage.setItem(portal.rememberKey, form.username.trim())
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
