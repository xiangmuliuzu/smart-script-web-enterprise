import test from 'node:test'
import assert from 'node:assert/strict'
import { login, smsLogin, getCaptcha, getInfo, logout, request, getToken, safeRedirect, assertUser, register, sendSmsCode, sendEmailCode, resetPassword } from '../src/auth.js'
import { portal } from '../src/portal.js'
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
const user = { userId: 7, userType: '01', nickname: '普通用户', authorCapability: false }
function reply(body, status = 200) { globalThis.fetch = async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) }
test.beforeEach(() => storage.clear())
test('RuoYi login sends the four fields anonymously and stores only its portal token', async () => {
  storage.set('Admin-Token', 'other-admin')
  storage.set(portal.tokenKey === 'PcUser-Token' ? 'PcEnterprise-Token' : 'PcUser-Token', 'other-portal')
  const body = { username: 'user', password: 'test-only-secret', code: '1234', uuid: 'captcha-1' }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/dev-api/api/v1/auth/login')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), body)
    assert.equal(options.headers.Authorization, undefined)
    return { ok: true, status: 200, json: async () => ({ code: 200, token: 'issued', user }) }
  }
  assert.equal(await login(body), user)
  assert.equal(getToken(), 'issued')
  assert.equal(storage.get('Admin-Token'), 'other-admin')
  assert.equal(storage.get(portal.tokenKey === 'PcUser-Token' ? 'PcEnterprise-Token' : 'PcUser-Token'), 'other-portal')
  assert.equal(storage.size, 3)
})
test('ordinary buyer and legacy user types use the same login; creator capability does not gate login', () => {
  for (const userType of ['01', '02', '03']) for (const authorCapability of [true, false]) {
    assertUser({ ...user, userType, authorCapability })
  }
  for (const bad of [null, {}, { ...user, userType: '00' }, { ...user, userType: '99' }]) assert.throws(() => assertUser(bad))
})

test('SMS login submits current agreement versions anonymously and isolates the enterprise session', async () => {
  storage.set(portal.tokenKey, 'expired-enterprise')
  storage.set('Admin-Token', 'keep-admin')
  storage.set('PcUser-Token', 'keep-user')
  const calls = []
  const agreements = [{ type: 'USER_AGREEMENT', version: '2.0' }, { type: 'PRIVACY_POLICY', version: '3.0' }]
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    assert.equal(options.headers.Authorization, undefined)
    if (url.endsWith('/agreements')) return { ok: true, status: 200, json: async () => ({ code: 200, data: { agreements } }) }
    assert.equal(url, '/dev-api/api/v1/auth/sms/login')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), {
      phone: '13600000000', code: '123456', deviceId: 'pc-web', deviceName: 'PC Web', agreementAcceptances: agreements
    })
    return { ok: true, status: 200, json: async () => ({ code: 200, token: 'sms-issued', user }) }
  }
  assert.equal(await smsLogin({ phone: '13600000000', code: '123456' }), user)
  assert.equal(getToken(), 'sms-issued')
  assert.equal(storage.get('Admin-Token'), 'keep-admin')
  assert.equal(storage.get('PcUser-Token'), 'keep-user')
  assert.deepEqual(calls, ['/dev-api/api/v1/auth/agreements', '/dev-api/api/v1/auth/sms/login'])
})

test('SMS code rejection, invalid identities and malformed sessions cannot leave an enterprise token', async () => {
  for (const result of [
    { code: 40001, message: '验证码错误或已失效' },
    { code: 40301, message: '账号已停用' },
    { code: 200, user },
    { code: 200, token: 'wrong-domain', user: { ...user, userType: '00' } }
  ]) {
    storage.set(portal.tokenKey, 'old')
    globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => url.endsWith('/agreements')
      ? { code: 200, data: { agreements: [{ type: 'USER_AGREEMENT', version: '1' }, { type: 'PRIVACY_POLICY', version: '1' }] } }
      : result })
    await assert.rejects(smsLogin({ phone: '13600000000', code: '000000' }))
    assert.equal(getToken(), '')
  }
})

test('SMS login does not submit without current agreement versions', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ code: 200, data: { agreements: [] } }) } }
  await assert.rejects(smsLogin({ phone: '13600000000', code: '123456' }), /协议版本获取失败/)
  assert.equal(calls, 1)
  assert.equal(getToken(), '')
})
test('malformed login and administrative responses never leave a portal token', async () => {
  for (const body of [{ code: 200, user }, { code: 200, token: 'wrong-domain', user: { ...user, userType: '00' } }]) {
    reply(body)
    await assert.rejects(login({ username: 'test' }))
    assert.equal(getToken(), '')
  }
})
test('captcha requires image and UUID unless explicitly disabled', async () => {
  for (const body of [{ code: 200 }, { code: 200, captchaEnabled: true, img: 'image' }, { code: 200, captchaEnabled: true, uuid: 'id' }]) {
    reply(body); await assert.rejects(getCaptcha())
  }
  reply({ code: 200, captchaEnabled: false }); assert.equal((await getCaptcha()).captchaEnabled, false)
  reply({ code: 200, img: 'image', uuid: 'id' }); assert.equal((await getCaptcha()).uuid, 'id')
})
test('restoring identity attaches Bearer and preserves RuoYi top-level permissions and roles', async () => {
  storage.set(portal.tokenKey, 'issued')
  const result = { code: 200, user, roles: ['buyer'], permissions: ['read'] }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/dev-api/api/v1/auth/getInfo')
    assert.equal(options.headers.Authorization, 'Bearer issued')
    return { ok: true, status: 200, json: async () => result }
  }
  assert.deepEqual(await getInfo(), result)
})
test('auth expiry and disabled accounts clear only this portal; business and network failures retain it', async () => {
  for (const [status, code, clears] of [[401,40100,true],[200,401,true],[200,40100,true],[403,40301,true],[403,40300,false],[503,50000,false]]) {
    storage.set(portal.tokenKey, 'issued')
    reply({ code, msg: 'failure' }, status)
    await assert.rejects(getInfo(), error => error.status === status && error.code === code)
    assert.equal(getToken(), clears ? '' : 'issued')
  }
  globalThis.fetch = async () => { throw new Error('network unavailable') }
  storage.set(portal.tokenKey, 'issued')
  await assert.rejects(getInfo()); assert.equal(getToken(), 'issued')
})
test('a non-JSON 401 clears auth, while a non-JSON 502 retains it', async () => {
  for (const status of [401, 502]) {
    storage.set(portal.tokenKey, 'issued')
    globalThis.fetch = async () => ({ ok: false, status, json: async () => { throw new SyntaxError('not JSON') } })
    await assert.rejects(getInfo())
    assert.equal(getToken(), status === 401 ? '' : 'issued')
  }
})
test('an older failed request cannot clear a replacement session', async () => {
  storage.set(portal.tokenKey, 'old')
  let finish
  globalThis.fetch = () => new Promise(resolve => { finish = resolve })
  const pending = request('/api/v1/auth/getInfo')
  storage.set(portal.tokenKey, 'new')
  finish({ ok: false, status: 401, json: async () => ({ code: 40100 }) })
  await assert.rejects(pending)
  assert.equal(getToken(), 'new')
})
test('logout calls the server and always removes local session, preserving the other portal', async () => {
  storage.set(portal.tokenKey, 'issued')
  storage.set('unrelated', 'keep')
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/dev-api/api/v1/auth/logout')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer issued')
    return { ok: false, status: 503, json: async () => ({ code: 50000, message: 'offline' }) }
  }
  await assert.rejects(logout())
  assert.equal(getToken(), ''); assert.equal(storage.get('unrelated'), 'keep')
})
test('registration submits the live agreement versions and returns the issued session for the buyer portal', async () => {
  const calls = []
  const agreements = { code: 200, data: { agreements: [
    { type: 'USER_AGREEMENT', version: '1.0.0', title: '用户协议', url: 'https://example.test/user' },
    { type: 'PRIVACY_POLICY', version: '1.0.0', title: '隐私政策', url: 'https://example.test/privacy' }
  ] } }
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    if (url.endsWith('/agreements')) return { ok: true, status: 200, json: async () => agreements }
    assert.equal(url, '/dev-api/api/v1/auth/register')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(options.body), {
      phone: '13600000000',
      code: '123456',
      password: 'test-only-secret1',
      deviceId: 'pc-web',
      deviceName: 'PC Web',
      agreementAcceptances: [
        { type: 'USER_AGREEMENT', version: '1.0.0' },
        { type: 'PRIVACY_POLICY', version: '1.0.0' }
      ]
    })
    return { ok: true, status: 200, json: async () => ({ code: 200, token: 'issued', user }) }
  }
  const result = await register({ phone: '13600000000', code: '123456', password: 'test-only-secret1' })
  assert.equal(result.token, 'issued')
  // 采购端不校验创作者能力，新注册的普通账号可以直接使用返回的会话。
  assert.equal(assertUser(result.user).userId, user.userId)
  assert.deepEqual(calls, ['/dev-api/api/v1/auth/agreements', '/dev-api/api/v1/auth/register'])
})

test('email registration requests a code and submits a normalized email', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([url, options])
    if (url.endsWith('/agreements')) return { ok: true, status: 200, json: async () => ({ code: 200, data: { agreements: [
      { type: 'USER_AGREEMENT', version: '1.0.0' }, { type: 'PRIVACY_POLICY', version: '1.0.0' }
    ] } }) }
    return { ok: true, status: 200, json: async () => ({ code: 200, token: 'issued', user }) }
  }
  await sendEmailCode(' Example@163.com ')
  await register({ phone: ' Example@163.com ', code: '123456', password: 'test-only-secret1' })
  assert.equal(calls[0][0], '/dev-api/api/v1/auth/email/send')
  assert.deepEqual(JSON.parse(calls[0][1].body), { email: 'example@163.com' })
  assert.equal(calls[2][0], '/dev-api/api/v1/auth/register')
  const body = JSON.parse(calls[2][1].body)
  assert.equal(body.email, 'example@163.com')
  assert.equal(body.phone, undefined)
  assert.equal(calls[0][1].headers.Authorization, undefined)
  assert.equal(calls[2][1].headers.Authorization, undefined)
})

test('email password reset uses a separate verification scene', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([url, options])
    return { ok: true, status: 200, json: async () => ({ code: 200 }) }
  }
  await sendEmailCode('Writer@Example.com', 'RESET_PASSWORD')
  await resetPassword({ phone: 'Writer@Example.com', code: '123456', newPassword: 'test-only-secret1' })
  assert.deepEqual(JSON.parse(calls[0][1].body), { email: 'writer@example.com', scene: 'RESET_PASSWORD' })
  assert.deepEqual(JSON.parse(calls[1][1].body), { email: 'writer@example.com', code: '123456', newPassword: 'test-only-secret1' })
})

test('registration refuses to submit when the agreement versions cannot be loaded', async () => {
  reply({ code: 200, data: { agreements: [] } })
  await assert.rejects(register({ phone: '13600000000', code: '123456', password: 'test-only-secret1' }), /协议版本获取失败/)
})

test('sms and password reset post the documented payloads anonymously', async () => {
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push([url, options])
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { cooldownSeconds: 60 } }) }
  }
  await sendSmsCode({ phone: '13600000000', scene: 'REGISTER' })
  await sendSmsCode({ phone: '13600000000', scene: 'LOGIN' })
  await resetPassword({ phone: '13600000000', code: '123456', newPassword: 'test-only-secret1' })
  assert.deepEqual(seen.map(([url]) => url), ['/dev-api/api/v1/auth/sms/send', '/dev-api/api/v1/auth/sms/send', '/dev-api/api/v1/auth/password/reset'])
  assert.deepEqual(JSON.parse(seen[0][1].body), { phone: '13600000000', scene: 'REGISTER', deviceId: 'pc-web' })
  assert.deepEqual(JSON.parse(seen[1][1].body), { phone: '13600000000', scene: 'LOGIN', deviceId: 'pc-web' })
  assert.deepEqual(JSON.parse(seen[2][1].body), { phone: '13600000000', code: '123456', newPassword: 'test-only-secret1' })
  for (const [, options] of seen) assert.equal(options.headers.Authorization, undefined)
})

test('login redirects only to implemented local pages', () => {
  // 原型最终态只有 /dashboard 一个主体路由，其余入口都是浮层。
  for (const raw of [null, '//evil.test', 'https://evil.test', '/login', '/pc/user', '/session/../login', '/\\evil.test', '/%5cevil.test', '/discover', '/library', '/trade']) assert.equal(safeRedirect(raw), '/session')
  assert.equal(safeRedirect('/dashboard'), '/dashboard')
  assert.equal(safeRedirect('/dashboard?tab=1#ok'), '/dashboard?tab=1#ok')
  assert.equal(safeRedirect('/session?tab=1#ok'), '/session?tab=1#ok')
  assert.equal(safeRedirect('/session-check'), '/session-check')
})
