import test from 'node:test'
import assert from 'node:assert/strict'
import {
  depositStatusLabel,
  escrowStatusLabel,
  isActiveStage,
  isReviewableStage,
  money,
  stageStatusLabel,
  taskTypeDeliverHint,
  taskTypeLabel,
  taskTypeOptions
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

// 任务三分类（sys_demand.task_type）与 APP/创作者/管理端同口径：
// 发布者按类型决定交付要求与验收口径，值域或文案漂移会直接误导创作者接单，故在此钉死。
const TASK_TYPE_CODES = ['script', 'script_storyboard', 'storyboard']
const TASK_TYPE_TEXTS = {
  script: '只征集剧本',
  script_storyboard: '剧本+分镜',
  storyboard: '提供剧本做分镜'
}
const TASK_TYPE_HINTS = {
  script: '逐轮交付本人未上架的剧本作品，AI 剧本审核通过后进入发布者人工验收',
  script_storyboard: '逐轮交付剧本作品，分镜以文件链接或交付说明随本轮一并提交，AI 剧本审核通过后进入人工验收',
  storyboard: '按发布者提供的源剧本产出分镜：交付分镜文件或填写交付说明即可（作品可选），提交后直接进入人工验收'
}

test('任务类型值域与中文标签与后端常量逐一对应', () => {
  assert.deepEqual(taskTypeOptions.map(o => o.value), TASK_TYPE_CODES)
  for (const code of TASK_TYPE_CODES) {
    assert.equal(taskTypeLabel(code), TASK_TYPE_TEXTS[code])
  }
})

test('不带 taskType 的历史任务回落只征集剧本', () => {
  for (const blank of [undefined, null, '', 'unknown_type']) {
    assert.equal(taskTypeLabel(blank), '只征集剧本')
    assert.equal(taskTypeDeliverHint(blank), TASK_TYPE_HINTS.script)
  }
})

test('三类交付口径文案逐字对齐 APP，且分镜类不提 AI 剧本审核', () => {
  for (const code of TASK_TYPE_CODES) {
    assert.equal(taskTypeDeliverHint(code), TASK_TYPE_HINTS[code])
  }
  assert.doesNotMatch(TASK_TYPE_HINTS.storyboard, /AI 剧本审核/)
  assert.match(TASK_TYPE_HINTS.storyboard, /源剧本/)
})
