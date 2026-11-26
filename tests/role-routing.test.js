import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const api = await readFile(new URL('../src/api/enterprise.js', import.meta.url), 'utf8')

test('企业端询盘与订单接口只按买方视角请求', () => {
  const inquiries = api.split('listInquiries')[1].split('\nexport')[0]
  const orders = api.split('listOrders')[1].split('\nexport')[0]
  assert.match(inquiries, /role: 'buyer'/)
  assert.match(orders, /role: 'buyer'/)
  assert.ok(!inquiries.includes('params.role') && !orders.includes('params.role'))
})

test('企业端合同列表的角色不接受调用方覆盖', () => {
  const line = api.split('\n').find(l => l.includes('listContracts'))
  assert.match(line, /role: 'buyer' \}\)/, 'role 必须排在展开参数之后，避免被 params 翻成卖方')
})
