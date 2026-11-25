import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createDemand, updateDemand, deliverableWork, demandStages, listMyDemands, sourceWorks, uploadSourceScript } from '../src/api/enterprise.js'
import { safeRedirect } from '../src/auth.js'
import { demandStatusLabel, demandStatusOptions, demandStatusTone, isAuditState, lastStageOf, taskTypeLabel, taskTypeDeliverHint, formatHours } from '../src/utils/demand.js'

const read = async path => readFile(new URL(path, import.meta.url), 'utf8')
// 扫源码只扫实现，注释里允许（而且应该）解释「某个动作为什么不在本端」
const stripComments = text => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\/[^'"\n]*$/gm, '')
const source = {}
source.api = await read('../src/api/enterprise.js')
source.panel = await read('../src/components/demand/DemandStagePanel.vue')
source.detail = await read('../src/views/demand/Detail.vue')
source.form = await read('../src/views/demand/PublishForm.vue')
source.published = await read('../src/views/demand/Published.vue')
source.card = await read('../src/components/demand/DemandCard.vue')
source.message = await read('../src/components/MessagePage.vue')
source.layout = await read('../src/layout/index.vue')
source.router = await read('../src/router.js')
// demand 段单独切出来判禁：文件后半部分询盘的 /close 是买方自己的正当动作，不能一起算
const demandApi = stripComments(source.api.split("const demandBase = '/api/v1/trade/demand'")[1].split('export const createInquiry')[0])

globalThis.localStorage = { getItem: () => 'test-token', removeItem: () => {} }

/* ─── 审核态：买方发布链路重开的核心规则，标签/配色/可编辑集合三处必须同时认得 pending_review 与 rejected ─── */
// 后端源：TradeDemandService.DEMAND_STATUS_PENDING_REVIEW / DEMAND_STATUS_REJECTED。
// 少了这两个键，「我发布的」列表会把刚提交的单子显示成英文原值，买方以为发布失败。
test('待审核与审核未通过有中文标签，且排在状态字典最前', () => {
  assert.equal(demandStatusLabel('pending_review'), '待审核')
  assert.equal(demandStatusLabel('rejected'), '审核未通过')
  assert.deepEqual(demandStatusOptions.slice(0, 2).map(o => o.value), ['pending_review', 'rejected'])
  assert.ok(isAuditState('pending_review') && isAuditState('rejected'))
  assert.ok(!isAuditState('open') && !isAuditState('completed'))
})

// 待审核（未曝光）与征集中（已曝光）是买方最容易搞混的一对，颜色必须不同
test('待审核与广场征集中的配色不撞车', () => {
  assert.equal(demandStatusTone('pending_review'), 'warn')
  assert.equal(demandStatusTone('rejected'), 'danger')
  assert.notEqual(demandStatusTone('pending_review'), demandStatusTone('open'))
})

/* ─── 接口面：只保留买方需要的发布/编辑/详情/我的列表/轮次/末轮作品/源剧本 ─── */
test('买方 demand 封装齐全，退役的资金与运营动作不留壳', () => {
  for (const name of ['createDemand', 'updateDemand', 'getDemand', 'listMyDemands', 'demandStages', 'deliverableWork', 'sourceWorks', 'uploadSourceScript', 'sourceScript']) {
    assert.ok(demandApi.includes(`export const ${name}`) || demandApi.includes(`export async function ${name}`), `缺少 ${name} 封装`)
  }
  // 托管/押金端点在后端是 410 硬下线，逐轮验收、延时审批、关闭征集是 403 收归管理端。
  // 只要封装名或路径还留在这份文件里，就总有一天会被顺手接回按钮上。
  for (const banned of ['payEscrow', 'confirmEscrow', 'devPassEscrow', 'deposit', 'escrow', 'reviewStage', 'closeDemand', 'decideExtend', 'selfExtendStage', 'extend', '/close', '/stats']) {
    assert.ok(!demandApi.includes(banned), `接口层不应再出现 ${banned}`)
  }
})

// mine=published 与 role:'buyer' 同口径写死在封装里：这一分支返回审核态全量，
// 外层再补一个 status:'open' 就把 pending_review / rejected 全过滤没了，买方看不到驳回单。
test('我发布的任务固定 mine=published，且不带默认 status', async () => {
  const seen = []
  globalThis.fetch = async url => {
    seen.push(url)
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { total: 1, list: [{ demandId: 7, status: 'pending_review' }] } }) }
  }
  const result = await listMyDemands({ pageSize: 20 })
  assert.match(seen[0], /mine=published/)
  assert.doesNotMatch(seen[0], /status=/)
  assert.equal(result.list[0].status, 'pending_review')
  assert.equal(result.total, 1)
})

test('创建与编辑打在同一条 /trade/demand 路径上，末轮作品走 deliverable-work', async () => {
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push([url, options?.method])
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { demandId: 56, status: 'pending_review' } }) }
  }
  await createDemand({ title: 't' })
  await updateDemand(56, { title: 't' })
  await demandStages(56)
  await deliverableWork(56, 80)
  assert.deepEqual(seen, [
    ['/dev-api/api/v1/trade/demand', 'POST'],
    ['/dev-api/api/v1/trade/demand/56', 'PUT'],
    ['/dev-api/api/v1/trade/demand/56/stages', 'GET'],
    ['/dev-api/api/v1/trade/demand/56/stage/80/deliverable-work', 'GET']
  ])
})

test('源剧本候选与文件上传走交易域端点，不打 content/upload', async () => {
  const seen = []
  globalThis.fetch = async (url, options) => {
    seen.push([url, options?.method])
    return { ok: true, status: 200, json: async () => ({ code: 200, data: [] }) }
  }
  await sourceWorks()
  await uploadSourceScript(new File(['demo'], 'script.txt'))
  assert.deepEqual(seen, [
    ['/dev-api/api/v1/trade/demand/source-works', 'GET'],
    ['/dev-api/api/v1/trade/demand/upload-script', 'POST']
  ])
})

/* ─── 金额单位：budget 出入都按分、stages[].amount 出元，这是本域最容易写反的一处 ─── */
test('表单出参 budget 换算成分、轮次 amount 保持元', () => {
  assert.match(source.form, /budget: Math\.round\(Number\(form\.budgetYuan\) \* 100\)/)
  assert.match(source.form, /amount: amountFen \/ 100/)
  assert.match(source.form, /budgetYuan: \(Number\(demand\.budget\) \|\| 0\) \/ 100/)
})

/* ─── 买方不得再持有任何平台动作 ─── */
test('轮次面板与详情页没有验收/延时/关闭/托管入口', () => {
  for (const [name, file] of [['DemandStagePanel', source.panel], ['Detail', source.detail], ['Published', source.published], ['PublishForm', source.form]]) {
    const code = stripComments(file)
    for (const banned of ['reviewStage', 'closeDemand', 'decideExtend', 'selfExtendStage', 'payEscrow', 'devPassEscrow', 'confirmEscrow', 'escrow', 'deposit', '验收通过并放款', '同意延时', '自主延时', '关闭征集', '去付托管']) {
      assert.ok(!code.includes(banned), `${banned} 属于管理端动作，不应出现在买方页面（${name}）`)
    }
  }
  // 面板是只读的：没有任何写操作 emit
  assert.doesNotMatch(source.panel, /defineEmits/)
})

// 后端 selectDeliverableWorkForViewer 的放行条件：demand=completed ∧ stageId 是末轮 ∧ 该轮 approved。
// 客户端按同一口径置灰，且必须把后端 400 的口径文案原样透出，否则买方只看到一句「加载失败」。
test('最终作品只在整单完成后按末轮开放，并按后端文案报错', () => {
  assert.match(source.panel, /status === 'completed'/)
  assert.match(source.panel, /finalStage/)
  assert.match(source.panel, /deliverableWork/)
  assert.match(source.panel, /workError\.value = failure\.message/)
  assert.equal(lastStageOf([{ stageOrder: 1 }, { stageOrder: 2 }]).stageOrder, 2)
  assert.equal(lastStageOf([]), null)
})

test('审核意见在卡片、详情与编辑表单三处都可见', () => {
  for (const file of [source.card, source.detail, source.form]) {
    assert.match(file, /auditRemark/, '审核意见必须随驳回态展示')
  }
  assert.match(source.detail, /auditAt/)
  // 编辑重交入口只对审核态开放，口径与后端 updateDemandByBuyer 一致，
  // 且判定收在 utils/demand.js 的 isAuditState 单点，避免列表/详情两处各写一份状态数组后走偏
  for (const file of [source.detail, source.published]) {
    assert.match(file, /isAuditState\(/, '可编辑判定必须走 isAuditState 单点')
  }
})

/* ─── 路由与回跳：/demand 页签存在、广场页不复活、登录后能回跳到任务详情 ─── */
test('/demand 顶级页签指向发布与详情，不恢复 Square 广场页', () => {
  assert.match(source.router, /path: '\/demand', component: Layout, children: demandRoutes/)
  assert.match(source.router, /path: 'published', component: \(\) => import\('\.\/views\/demand\/Published\.vue'\)/)
  assert.match(source.router, /path: 'create', component: \(\) => import\('\.\/views\/demand\/PublishForm\.vue'\)/)
  assert.match(source.router, /demand-edit/)
  assert.doesNotMatch(source.router, /Square\.vue/)
  assert.doesNotMatch(source.router, /demandStats/)
  // 默认落「我发布的任务」，不是广场
  assert.match(source.router, /redirect: '\/demand\/published'/)
})

test('登录后可以回跳到任务路由', () => {
  for (const path of ['/demand', '/demand/published', '/demand/create', '/demand/123', '/demand/123/edit']) {
    assert.equal(safeRedirect(path), path)
  }
  assert.equal(safeRedirect('/demand/abc'), '/session')
  assert.equal(safeRedirect('//evil.test'), '/session')
})

/* ─── 通知跳转：DEMAND 审核通知落到任务详情 ─── */
test('交易通知映射保留 DEMAND 入口并跳 /demand/{id}', () => {
  assert.match(source.message, /DEMAND: \{ demand: true, label: '查看任务' \}/)
  assert.match(source.message, /jump\.demand \? \{ demand: true, bizId: item\.businessId \}/)
  assert.match(source.layout, /payload\?\.demand/)
  assert.match(source.layout, /`\/demand\/\$\{id\}`/)
})

/* ─── 文案口径：验收主体已换成平台 ─── */
test('交付口径文案不再把验收写成发布方的动作', () => {
  for (const type of ['script', 'script_storyboard', 'storyboard']) {
    assert.doesNotMatch(taskTypeDeliverHint(type), /发布者人工验收|进入你的验收/)
  }
  assert.equal(taskTypeLabel('unknown_type'), '只征集剧本')
  assert.equal(formatHours(50), '2 天 2 小时')
})

/* ─── 整单时限镜像列 ─── */
// sys_demand.duration_hours 由首轮时限镜像而来，广场卡片与接单前的时限展示都读它。
// 少传这一个字段，买方填的第 1 轮时限会被服务端默认值顶掉，整单口径与轮次口径就对不上。
test('发布与编辑都带上首轮时限的整单镜像列', () => {
  assert.match(source.form, /durationHours:\s*stages\[0\]\.durationHours/)
  assert.match(source.form, /budget: Math\.round\(Number\(form\.budgetYuan\) \* 100\)/)
})

/* ─── 未完成前不泄露过程稿 ─── */
// 后端把完整轮次字段回给当事人（他们本就有权读），但「最后一轮验收通过后才能看最终作品」
// 这条产品口径要在页面上成立：过程轮的交付说明与正文在完成前不得渲染。
test('过程轮的交付说明在整单完成前不渲染', () => {
  assert.match(source.panel, /v-if="stage\.deliverableDesc && canViewFinal"/)
  assert.match(source.panel, /v-if="!canViewFinal" class="sc-meta sc-muted"/)
})
