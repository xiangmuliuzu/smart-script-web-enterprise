import test from 'node:test'
import assert from 'node:assert/strict'
import { money } from '../src/utils/enterprise.js'

// 交易域金额一律以「分」下发（后端 yuanToFen 在 controller 里 ×100）。
// 回归：fd6c6f4 把报价/询盘也改成下分发，曾导致报价显示放大 100 倍。
test('money treats api amounts as fen, matching quote/order/inquiry alike', () => {
  assert.equal(money(4500000), '¥45,000')
  assert.equal(money(8800000), '¥88,000')
  assert.equal(money(60000), '¥600')
  assert.equal(money(50), '¥0.5')
  assert.equal(money(null), '¥0')
  assert.equal(money(undefined), '¥0')
})
