import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { computed, reactive, ref } from 'vue'

async function createPanel(overrides = {}) {
  const source = await readFile(new URL('../src/components/AccountPanel.vue', import.meta.url), 'utf8')
  const setup = source.split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
  const events = []
  let stopTimer = () => {}
  const context = {
    computed, reactive, ref, TextEncoder,
    defineProps: () => ({ mode: 'sms' }), defineEmits: () => (...args) => events.push(args),
    onMounted() {}, watch() {}, onBeforeUnmount(fn) { stopTimer = fn },
    setInterval: () => 1, clearInterval() {}, ElMessage: { success() {} },
    getAgreements: async () => [], smsLogin: async () => {}, sendSmsCode: async () => ({}),
    ...overrides
  }
  runInNewContext(setup + '\nglobalThis.panel = { form, formRef, submit, sendCode, countdown, submitting, sending, error, rules }', context)
  context.panel.formRef.value = { validate: async () => true, validateField: async () => true }
  Object.assign(context.panel.form, { phone: ' 13600000000 ', code: ' 123456 ', agreed: true })
  return { ...context.panel, events, dispose: () => stopTimer() }
}

test('SMS submit trims inputs, blocks duplicate validation, clears the code and signals login', async () => {
  let release
  const validation = new Promise(resolve => { release = resolve })
  const calls = []
  const panel = await createPanel({ smsLogin: async body => calls.push(body) })
  panel.formRef.value.validate = () => validation
  const first = panel.submit()
  const second = panel.submit()
  release(true)
  await Promise.all([first, second])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].phone, '13600000000')
  assert.equal(calls[0].code, '123456')
  assert.equal(panel.form.code, '')
  assert.equal(panel.events[0][0], 'logged-in')
  assert.equal(panel.submitting.value, false)
  panel.dispose()
})

test('SMS validation or server rejection stays on the form and does not signal login', async () => {
  let calls = 0
  const panel = await createPanel({ smsLogin: async () => { calls++; throw new Error('验证码错误或已失效') } })
  panel.formRef.value.validate = async () => false
  await panel.submit()
  assert.equal(calls, 0)
  panel.formRef.value.validate = async () => true
  await panel.submit()
  assert.equal(panel.error.value, '验证码错误或已失效')
  assert.equal(panel.events.length, 0)
  assert.equal(panel.submitting.value, false)
  assert.equal(panel.form.phone.trim(), '13600000000')
  let agreementError
  panel.rules.agreed[0].validator({}, false, error => { agreementError = error })
  assert.match(agreementError.message, /请先阅读并同意/)
  panel.dispose()
})

test('SMS send uses LOGIN, respects the server cooldown and blocks duplicate clicks', async () => {
  let release
  const validation = new Promise(resolve => { release = resolve })
  const calls = []
  const panel = await createPanel({ sendSmsCode: async body => { calls.push(body); return { data: { cooldownSeconds: 90 } } } })
  panel.formRef.value.validateField = () => validation
  const first = panel.sendCode()
  const second = panel.sendCode()
  release(true)
  await Promise.all([first, second])
  await panel.sendCode()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].phone, '13600000000')
  assert.equal(calls[0].scene, 'LOGIN')
  assert.equal(panel.countdown.value, 90)
  assert.equal(panel.sending.value, false)
  panel.dispose()
})

test('SMS sending failure shows the error without starting the countdown', async () => {
  const panel = await createPanel({ sendSmsCode: async () => { throw new Error('发送过于频繁') } })
  await panel.sendCode()
  assert.equal(panel.error.value, '发送过于频繁')
  assert.equal(panel.countdown.value, 0)
  assert.equal(panel.sending.value, false)
  panel.dispose()
})
