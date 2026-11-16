import test from 'node:test'
import assert from 'node:assert/strict'
import { money, contractMoney } from '../src/utils/enterprise.js'

// 交易域金额一律以「分」下发（后端 yuanToFen 在 controller 里 ×100）。
// 回归：fd6c6f4 把报价/询盘也改成下分发，曾导致报价显示放大 100 倍。
test('money treats api amounts as fen, matching quote/order/inquiry alike', () => {
  assert.equal(money(4500000), '¥45,000.00')
  assert.equal(money(8800000), '¥88,000.00')
  assert.equal(money(60000), '¥600.00')
  assert.equal(money(50), '¥0.50')
  assert.equal(money(null), '¥0.00')
  assert.equal(money(undefined), '¥0.00')
})

// 小数位口径：整数金额也必须补两位，与 APP toStringAsFixed(2)、创作者端 finance.yuanText 一致，
// 否则同一张表里 ¥600 与 ¥600.50 混排，看不出是否同一口径。
test('money always renders two decimals, including round amounts', () => {
  assert.equal(money(100), '¥1.00')
  assert.equal(money(12345), '¥123.45')
  assert.match(money(0), /\.00$/)
})

// 合同接口按「元」直返，格式化不除 100；小数位同样两位。
test('contractMoney takes yuan as-is and renders two decimals', () => {
  assert.equal(contractMoney(600), '¥600.00')
  assert.equal(contractMoney(332.5), '¥332.50')
  assert.equal(contractMoney(null), '¥0.00')
})
