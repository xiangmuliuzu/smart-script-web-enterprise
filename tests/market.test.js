import test from 'node:test'
import assert from 'node:assert/strict'
import {
  budgetToFen,
  inquiryPayload,
  marketWorksQuery,
  recommendedWorks
} from '../src/utils/market.js'
import {
  listWorks,
  listHotRankings,
  getWork,
  listChapters,
  getChapter,
  createInquiry,
  getWorkCopyrightStatus
} from '../src/api/enterprise.js'
import { safeRedirect } from '../src/auth.js'
import { storyboardReadLabel } from '../src/utils/enterprise.js'
let token = ''
globalThis.localStorage = {
  getItem: () => token,
  removeItem: () => {
    token = ''
  }
}
test('public storyboard labels describe reader access independently from review status', () => {
  assert.equal(storyboardReadLabel({ status: 'approved', readable: true, trialEnabled: true }), '分镜试读')
  assert.equal(storyboardReadLabel({ status: 'approved', readable: true, trialEnabled: false }), '阅读分镜')
  assert.equal(storyboardReadLabel({ status: 'approved', readable: false }), '暂未开放')
  assert.equal(storyboardReadLabel({ status: 'approved' }), '暂未开放')
})

test('inquiry budgets convert yuan exactly, preserve optionality and reject invalid values', () => {
  assert.equal(budgetToFen('1.01'), 101)
  assert.equal(budgetToFen('0.29'), 29)
  assert.equal(budgetToFen('1000'), 100000)
  assert.equal(budgetToFen(''), null)
  for (const value of ['0', '-1', '1.999', 'NaN', '1e3']) assert.throws(() => budgetToFen(value))
})
test('inquiry copyright selection follows App contract and never supplies identity fields', () => {
  const form = {
    intendedUse: ' 短剧改编 ',
    budget: '12.50',
    message: ' 合作 ',
    licenseType: 'adaptation'
  }
  assert.deepEqual(inquiryPayload(7, form, true), {
    workId: 7,
    intendedUse: '短剧改编',
    budget: 1250,
    message: '合作',
    licenseType: 'adaptation'
  })
  assert.equal(inquiryPayload(7, form, false).licenseType, null)
  assert.throws(() => inquiryPayload(7, { ...form, intendedUse: '' }, true))
  assert.throws(() => inquiryPayload(7, { ...form, licenseType: 'invalid' }, true))
})
test('market APIs allow guest browsing; inquiry APIs retain authentication and server payload', async () => {
  token = ''
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: { list: [], total: 0 } })
    }
  }
  await listWorks({ recommendStatus: 'home_hot', page: 2, pageSize: 12 })
  await listWorks({ keyword: '故事 A', page: 1 })
  await getWork(5)
  await listChapters(5)
  await getChapter(8)
  for (const call of calls) assert.equal(call.options.headers.Authorization, undefined)
  assert.match(calls[0].url, /recommendStatus=home_hot/)
  assert.match(calls[0].url, /page=2/)
  assert.equal(new URL(calls[1].url, 'https://test').searchParams.get('keyword'), '故事 A')
  token = 'test-session'
  await listChapters(5)
  await getChapter(8)
  assert.equal(calls[5].options.headers.Authorization, 'Bearer test-session')
  assert.equal(calls[6].options.headers.Authorization, 'Bearer test-session')
  const body = inquiryPayload(
    5,
    { intendedUse: '改编', budget: '20', licenseType: 'exclusive' },
    true
  )
  await createInquiry(body)
  await getWorkCopyrightStatus(5)
  assert.equal(calls[7].options.headers.Authorization, 'Bearer test-session')
  assert.equal(calls[7].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[7].options.body), body)
  assert.match(calls[8].url, /copyright-status\?workId=5$/)
})
test('login permits home inquiry continuation without permitting outside redirects', () => {
  assert.equal(safeRedirect('/?workId=5&action=inquiry'), '/?workId=5&action=inquiry')
  assert.equal(safeRedirect('//evil.test/?workId=5'), '/session')
})

test('recommendations request twenty featured works; search keeps paging and sorting', async () => {
  assert.deepEqual(marketWorksQuery(), { recommendStatus: 'home_hot', page: 1, pageSize: 20 })
  assert.deepEqual(marketWorksQuery({ page: 4, sort: 'latest' }), {
    recommendStatus: 'home_hot',
    page: 1,
    pageSize: 20
  })
  const search = marketWorksQuery({ keyword: '春日', sort: 'latest', page: 3 })
  token = ''
  let called = ''
  globalThis.fetch = async (url) => {
    called = url
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: { list: [], total: 0 } })
    }
  }
  await listWorks(search)
  const params = new URL(called, 'https://test').searchParams
  assert.equal(params.get('keyword'), '春日')
  assert.equal(params.get('sort'), 'latest')
  assert.equal(params.get('page'), '3')
  assert.equal(params.has('recommendStatus'), false)
})
test('recommendation display caps the original featured pool at twenty without mutating it', () => {
  const source = Array.from({ length: 25 }, (_, i) => ({
    workId: i + 1,
    createTime: '2026-11-' + String(i + 1).padStart(2, '0')
  }))
  assert.deepEqual(
    recommendedWorks(source).map((work) => work.workId),
    Array.from({ length: 20 }, (_, i) => i + 1)
  )
  assert.deepEqual(
    recommendedWorks(source, { sort: 'latest' }).map((work) => work.workId),
    Array.from({ length: 20 }, (_, i) => 20 - i)
  )
  assert.equal(source.length, 25)
  assert.equal(source[0].workId, 1)
  assert.equal(recommendedWorks(source.slice(0, 4)).length, 4)
})
test('hero uses the public popularity ranking, separately from featured recommendations', async () => {
  token = ''
  let called = ''
  globalThis.fetch = async (url) => {
    called = url
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: { list: [{ workId: 9, rankNo: 1 }], updatedAt: '2026-11-15' }
      })
    }
  }
  assert.equal((await listHotRankings())[0].workId, 9)
  const url = new URL(called, 'https://test')
  assert.equal(url.pathname, '/dev-api/api/v1/content/rankings')
  assert.equal(url.searchParams.get('type'), 'view')
  assert.equal(url.searchParams.get('limit'), '3')
})
