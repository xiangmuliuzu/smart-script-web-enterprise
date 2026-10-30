import test from 'node:test'
import assert from 'node:assert/strict'
import { payOrder, confirmSandboxPayment } from '../src/api/enterprise.js'

test('sandbox payment only reports paid after server confirmation', async () => {
  globalThis.localStorage = { getItem: () => 'test-token', removeItem: () => {} }
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push([url, options])
    const data = url.endsWith('/confirm') ? { paid: false, sandbox: true } : { qrCode: 'https://example.test/qr', sandbox: true }
    return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
  }
  const start = await payOrder(42)
  assert.equal(start.qrCode, 'https://example.test/qr')
  assert.equal((await confirmSandboxPayment(42)).paid, false)
  assert.deepEqual(requests.map(([url]) => url), ['/dev-api/api/v1/trade/order/42/pay', '/dev-api/api/v1/trade/order/42/pay/confirm'])
  assert.ok(requests.every(([, options]) => options.method === 'POST' && options.headers.Authorization === 'Bearer test-token'))
})
