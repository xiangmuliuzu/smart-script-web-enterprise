import test from 'node:test'
import assert from 'node:assert/strict'
import { submitRealName } from '../src/api/enterprise.js'

test('实名提交按契约走 multipart，带身份证正反面', async () => {
  globalThis.localStorage = { getItem: () => 'test-token', removeItem: () => {} }
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push([url, options])
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { status: 'PENDING' } }) }
  }

  const body = new FormData()
  body.append('realName', '张三')
  body.append('idNumber', '110101199001011234')
  body.append('front', new Blob([Uint8Array.of(1)], { type: 'image/png' }), 'front.png')
  body.append('back', new Blob([Uint8Array.of(2)], { type: 'image/png' }), 'back.png')

  const result = await submitRealName(body)
  assert.equal(result.status, 'PENDING')
  assert.equal(requests.length, 1)
  const [url, options] = requests[0]
  assert.equal(url, '/dev-api/api/v1/users/me/real-name')
  assert.equal(options.method, 'POST')
  // 不手动设 Content-Type：边界由浏览器生成，否则后端解析不到 multipart 字段。
  assert.equal(options.headers['Content-Type'], undefined)
  assert.equal(options.body, body)
})
