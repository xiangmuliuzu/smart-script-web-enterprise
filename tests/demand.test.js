import test from 'node:test'
import assert from 'node:assert/strict'
import {
  depositStatusLabel,
  escrowStatusLabel,
  isActiveStage,
  isReviewableStage,
  money,
  stageStatusLabel
} from '../src/utils/demand.js'
import { deliverableWork } from '../src/api/enterprise.js'

// 后端权威枚举：ESCROW_* 是发布者放进平台、按轮次放款的预算款，
// DEPOSIT_* 是创作者缴的履约保证金（=预算/10），完成整单后退还。
// held 曾被译作「已托管」，与 escrowed「已托管」撞词，卡片上出现「托管：已托管 · 押金：已托管」，
// 发布者会误以为押金也是自己的钱；这里把两套文案钉住，防止再抄回旧词。
const ESCROW_VALUES = ['none', 'pending_payment', 'escrowed', 'released', 'refunded_to_publisher']
const DEPOSIT_VALUES = ['none', 'held', 'refunded', 'forfeited']

test('押金与托管两套状态都有后端枚举的中文译文，不留英文原值', () => {
  for (const value of ESCROW_VALUES) {
    assert.notEqual(escrowStatusLabel(value), value, `托管 ${value} 缺中文文案`)
  }
  for (const value of DEPOSIT_VALUES) {
    assert.notEqual(depositStatusLabel(value), value, `押金 ${value} 缺中文文案`)
  }
  assert.equal(escrowStatusLabel('escrowed'), '已托管')
  assert.equal(depositStatusLabel('held'), '在押')
})

test('押金文案与托管文案不共用任何一个词，两笔钱在页面上分得开', () => {
  const escrowLabels = ESCROW_VALUES.map(escrowStatusLabel)
  const overlapped = DEPOSIT_VALUES.map(depositStatusLabel).filter(label => escrowLabels.includes(label))
  assert.deepEqual(overlapped, [], `押金/托管文案撞词：${overlapped.join('、')}`)
})

test('轮次进行中以 startedAt 判定，可验收以 submitted 判定', () => {
  assert.equal(isActiveStage({ status: 'pending', startedAt: '2026-11-05T10:00:00' }), true)
  assert.equal(isActiveStage({ status: 'pending', startedAt: null }), false)
  assert.equal(isActiveStage(null), false)
  assert.equal(isReviewableStage({ status: 'submitted' }), true)
  assert.equal(isReviewableStage({ status: 'approved' }), false)
  assert.equal(stageStatusLabel({ status: 'submitted' }), '待验收')
})

// 全站金额入参为「分」，两位小数为统一口径（tests/money.test.js 锁的是 enterprise.js，
// 这里锁任务域透出的同一个 money），避免同一列里 ¥600 与 ¥600.50 混排。
test('任务金额一律两位小数', () => {
  assert.equal(money(60000), '¥600.00')
  assert.equal(money(60050), '¥600.50')
  assert.equal(money(0), '¥0.00')
  assert.equal(money(null), '¥0.00')
})

// 验收查阅的后端口径：交付作品一定未上架（deliverStage 拒 on_shelf 交付），
// content 域读者接口只认上架作品、作者接口只认本人，发布者两条都取不到，
// 所以只能走 trade 域的 deliverable-work。这里钉住 URL，防止改回读者接口后验收页空白。
test('查看交付内容走 trade 域的 deliverable-work，不打 content 读者接口', async () => {
  globalThis.localStorage = { getItem: () => 'test-token', removeItem: () => {} }
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push([url, options.method])
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { workId: 92, chapters: [{ chapterId: 1, readable: true }] } }) }
  }
  const result = await deliverableWork(56, 80)
  assert.deepEqual(requests, [['/dev-api/api/v1/trade/demand/56/stage/80/deliverable-work', 'GET']])
  assert.equal(result.chapters.length, 1)
})
