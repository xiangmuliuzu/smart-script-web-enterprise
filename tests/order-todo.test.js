import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTodoOrders, orderStepIndex } from '../src/utils/orderTodo.js'

test('buyer todo orders include all pages and ignore non-active statuses', async () => {
  const calls = []
  const api = { async listOrders(params) {
    calls.push(params)
    if (params.status === 'confirmed' && params.pageNum === 1) return { total: 101, list: Array.from({ length: 100 }, (_, i) => ({ orderId: i + 1, status: 'confirmed' })) }
    if (params.status === 'confirmed') return { total: 101, list: [{ orderId: 101, status: 'confirmed' }] }
    if (params.status === 'paying') return { total: 1, list: [{ orderId: 102, status: 'paying' }, { orderId: 103, status: 'completed' }] }
    return { total: 0, list: [] }
  } }
  const result = await loadTodoOrders(api)
  assert.equal(result.length, 102)
  assert.ok(result.some(order => order.orderId === 101))
  assert.ok(result.every(order => order.status !== 'completed'))
  assert.ok(calls.some(call => call.status === 'delivering'))
  assert.equal(orderStepIndex('escrow_pending'), 1)
})

test('order retrieval failures are surfaced for retry', async () => {
  await assert.rejects(loadTodoOrders({ listOrders: async () => { throw new Error('订单加载失败') } }), /订单加载失败/)
})
