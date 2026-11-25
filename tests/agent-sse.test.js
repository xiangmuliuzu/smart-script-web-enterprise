import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { LIMIT_MESSAGE, streamAgentChat } from '../src/api/agent.js'
import { formatDemandMarkdown } from '../src/components/agent/format.js'
import { markdownHtml } from '../src/components/agent/markdown.js'

const originalFetch = globalThis.fetch
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const encoder = new TextEncoder()

beforeEach(() => {
  const store = new Map([['PcEnterprise-Token', 'test-token']])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => store.get(key),
      removeItem: key => store.delete(key)
    }
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else delete globalThis.localStorage
})

function sse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    }
  }), { headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' } })
}

test('分发混合换行、多行 data 和切碎的中文字符', async () => {
  const frame = encoder.encode('event: delta\ndata: {"text":"悬疑"}\n\n')
  const lastByte = frame.indexOf(0xe6) + 1
  assert.ok(lastByte > 0)
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/agent/sessions/8%2F9/chat/stream'))
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { message: '找剧本', model: 'sample-model' })
    return sse([
      ': heartbeat\r', '\nevent: step\r\ndata: {"step":1,\r\ndata: "message":"查询中"}\r\n\r', '\n',
      frame.slice(0, lastByte), frame.slice(lastByte), 'event: done\ndata: {"messageId":55}\n\n'
    ])
  }
  const events = []
  await streamAgentChat('8/9', { message: '找剧本', model: 'sample-model' }, {
    onEvent: (...event) => events.push(event)
  })
  assert.deepEqual(events, [
    ['step', { step: 1, message: '查询中' }],
    ['delta', { text: '悬疑' }],
    ['done', { messageId: 55 }]
  ])
})

test('AbortController 停止读取并取消底层流', async () => {
  const abort = new AbortController()
  let cancelled = false
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.signal, abort.signal)
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('event: step\ndata: {"step":1}\n\n')) },
      cancel() { cancelled = true }
    }), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const events = []
  await assert.rejects(streamAgentChat(8, { message: '找剧本' }, {
    signal: abort.signal, onEvent: event => { events.push(event); abort.abort() }
  }), { name: 'AbortError' })
  assert.deepEqual(events, ['step'])
  assert.equal(cancelled, true)
})

test('429 流事件保留客服指引并不泄露额度字段', async () => {
  globalThis.fetch = async () => sse(['event: error\ndata: {"code":429,"message":"Too Many Requests"}\n\n'])
  const events = []
  await assert.rejects(streamAgentChat(8, { message: '找剧本' }, {
    onEvent: event => events.push(event)
  }), failure => failure.code === 429 && failure.message === LIMIT_MESSAGE)
  assert.deepEqual(events, ['error'])
  assert.equal(globalThis.localStorage.getItem('PcEnterprise-Token'), 'test-token')
})

test('意外 EOF 与认证过期分别报错，认证过期清理当前凭证', async () => {
  globalThis.fetch = async () => sse(['event: delta\ndata: {"text":"未完成"}\n\n'])
  await assert.rejects(streamAgentChat(8, { message: '找剧本' }, {}), /回复中断/)
  globalThis.fetch = async () => Response.json({ code: 401, message: '登录状态已过期' }, { status: 401 })
  await assert.rejects(streamAgentChat(8, { message: '找剧本' }, {}), failure => failure.status === 401)
  assert.equal(globalThis.localStorage.getItem('PcEnterprise-Token'), undefined)
})

test('需求单 Markdown 包含运营立项所需字段', () => {
  const brief = {
    title: '古装权谋项目', taskType: 'script_storyboard', genreTags: ['权谋', '短剧'],
    totalEpisodes: 60, budgetYuan: 45000.5, durationDays: 30, commercialGoal: '竖屏投流',
    requirement: '三幕结构\n分集反转', deliveryChecklist: ['剧本源稿', '分镜目录']
  }
  assert.equal(formatDemandMarkdown(brief), [
    '# 采购需求草案｜古装权谋项目', '', '- 任务类型：剧本 + 分镜', '- 题材标签：权谋、短剧',
    '- 目标集数：60 集', '- 预算参考：¥45,000.5', '- 期望周期：30 天', '', '## 商业化诉求',
    '竖屏投流', '', '## 详细要求', '三幕结构\n分集反转', '', '## 交付验收清单', '- 剧本源稿', '- 分镜目录'
  ].join('\n'))
})

test('助手 Markdown 支持标题、列表和表格，并转义内嵌 HTML', () => {
  const html = markdownHtml('# 助手\n- **悬疑**\n\n|作品|价格|\n|---|---:|\n|A|¥25000|\n\n<img src=x onerror=alert(1)>')
  assert.match(html, /<h3>助手<\/h3>/)
  assert.match(html, /<ul><li><strong>悬疑<\/strong><\/li><\/ul>/)
  assert.match(html, /<table>.*<td>A<\/td>.*<\/table>/)
  assert.match(html, /&lt;img/)
  assert.doesNotMatch(html, /<img/)
})
