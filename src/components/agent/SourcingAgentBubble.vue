<template>
  <Teleport to="body">
    <section v-if="open" id="sourcing-agent-panel" class="agent-panel" :data-wide="wide" role="dialog"
      aria-labelledby="sourcing-agent-title" @keydown.esc="closePanel">
      <header class="agent-header">
        <div class="agent-title">
          <span class="agent-icon" aria-hidden="true">✦</span>
          <div>
            <h2 id="sourcing-agent-title">AI 选本顾问</h2>
            <p v-if="activeSession">{{ activeSession.title }}</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="agent-command resize" type="button" :aria-pressed="wide" @click="wide = !wide">
            {{ wide ? '收起宽屏' : '展开宽屏' }}
          </button>
          <button class="agent-command close" type="button" aria-label="关闭选本顾问" @click="closePanel">×</button>
        </div>
      </header>

      <div class="agent-toolbar">
        <label class="history-label" for="sourcing-agent-history">历史会话</label>
        <select id="sourcing-agent-history" :value="sessionId ?? ''" :disabled="busy || loading"
          @change="selectSession($event.target.value)">
          <option value="">新选本对话</option>
          <option v-for="session in sessions" :key="session.sessionId" :value="String(session.sessionId)">
            {{ session.title }}
          </option>
        </select>
        <button class="agent-command" type="button" :disabled="busy || loading" @click="newSession">新建对话</button>
        <button v-if="sessionId" class="agent-command" type="button" :disabled="busy || loading"
          @click="removeSession">删除</button>
      </div>

      <div ref="timeline" class="agent-timeline">
        <p v-if="loading" class="view-state" role="status">正在加载会话…</p>
        <div v-else-if="loadError" class="view-state" role="alert">
          {{ loadError }}
          <button type="button" class="agent-command" @click="reload">重试</button>
        </div>
        <div v-else-if="!messages.length" class="welcome">
          <h3>这次想找什么样的剧本？</h3>
          <p>告诉我题材、预算或集数，我可以检索作品、对比候选，也可以帮你整理定制采购需求。</p>
          <button v-for="prompt in prompts" :key="prompt" type="button" class="prompt" :disabled="busy"
            @click="send(prompt)">{{ prompt }}<span aria-hidden="true">↗</span></button>
        </div>

        <div v-for="entry in messages" :key="entry.localId ? 'local-' + entry.localId : 'saved-' + entry.messageId" class="agent-entry"
          :data-role="entry.role">
          <div v-if="entry.role === 'user'" class="user-message">{{ entry.content }}</div>
          <div v-else class="assistant-message">
            <div v-if="entry.status" class="progress-status" role="status">{{ entry.status }}</div>
            <details v-if="entry.tools?.length" class="steps" :open="entry.running">
              <summary>查询过程</summary>
              <ul>
                <li v-for="(call, index) in entry.tools" :key="index">
                  <strong>{{ call.label }}</strong>
                  <span v-if="call.argsSummary">{{ call.argsSummary }}</span>
                  <span v-if="call.summary">{{ call.summary }}</span>
                </li>
              </ul>
            </details>
            <AgentMarkdown v-if="entry.content" :text="entry.content" />
            <template v-for="(card, index) in entry.cards" :key="index">
              <AgentWorkCards v-if="card.type === 'work_list' || card.type === 'work_comparison'"
                :type="card.type" :payload="card.payload" @open-work="forward('open-work', $event)"
                @inquire-work="forward('inquire-work', $event)" />
              <AgentDemandBriefCard v-else-if="card.type === 'demand_brief'" :brief="card.payload"
                @open-platform-chat="forward('open-platform-chat', $event)" />
            </template>
            <div v-if="entry.notice" class="agent-notice" role="status">
              <p>{{ entry.notice }}</p>
              <button v-if="entry.limited" type="button" class="btn light small" :disabled="contacting"
                @click="contactPlatform">联系平台客服</button>
            </div>
          </div>
        </div>
      </div>

      <form class="agent-composer" @submit.prevent="send(draft)">
        <textarea ref="input" v-model="draft" aria-label="采购诉求" rows="2" maxlength="4000"
          placeholder="输入题材、预算、集数或定制要求…" @keydown.enter="onEnter"></textarea>
        <button v-if="controller" type="button" class="btn light small" @click="controller.abort()">停止生成</button>
        <button v-else type="submit" class="btn small" :disabled="busy || loading || !draft.trim()">发送</button>
      </form>
    </section>
    <button ref="trigger" class="agent-trigger" type="button" :aria-expanded="open"
      aria-controls="sourcing-agent-panel" @click="toggle">
      <span aria-hidden="true">✦</span> AI 选本
    </button>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getToken } from '../../auth.js'
import { createAgentSession, deleteAgentSession, listAgentMessages, listAgentSessions, streamAgentChat } from '../../api/agent.js'
import { usePortal } from '../../utils/portal.js'
import AgentDemandBriefCard from './AgentDemandBriefCard.vue'
import AgentMarkdown from './AgentMarkdown.vue'
import AgentWorkCards from './AgentWorkCards.vue'

const props = defineProps({ user: Object })
const emit = defineEmits(['require-login', 'open-work', 'inquire-work', 'open-platform-chat'])
const { api, handleError } = usePortal()
const prompts = [
  '预算 5 万以内，找 50～80 集竖屏悬疑反转短剧并对比',
  '帮我找适合出海投流的甜宠爽剧并检查版权状态',
  '库里没有合适的，帮我起草一份古装权谋定制剧本采购需求'
]
const open = ref(false)
const wide = ref(false)
const loading = ref(false)
const loadError = ref('')
const creating = ref(false)
const contacting = ref(false)
const controller = shallowRef(null)
const sessions = ref([])
const sessionId = ref(null)
const messages = ref([])
const draft = ref('')
const timeline = ref(null)
const input = ref(null)
const trigger = ref(null)
const busy = computed(() => creating.value || controller.value !== null)
const activeSession = computed(() => sessions.value.find(item => String(item.sessionId) === sessionId.value))
let run = 0
let entryId = 0
let loaded = false

function closePanel() {
  open.value = false
  trigger.value?.focus()
}

async function toggle() {
  if (open.value) { closePanel(); return }
  if (!props.user || !getToken()) { emit('require-login'); return }
  open.value = true
  await nextTick()
  input.value?.focus({ preventScroll: true })
  if (!loaded) await reload()
  else scroll(true)
}

async function reload() {
  const current = ++run
  loading.value = true
  loadError.value = ''
  try {
    const result = await listAgentSessions()
    if (current !== run) return
    sessions.value = result
    loaded = true
    const selected = sessionId.value || result[0]?.sessionId
    if (selected != null) await selectSession(selected)
  } catch (failure) {
    if (current === run && !handleError(failure, { silent: true })) loadError.value = failure.message
  } finally {
    if (current === run) loading.value = false
  }
}

async function selectSession(id) {
  if (busy.value) return
  if (!id) { newSession(); return }
  const current = ++run
  sessionId.value = String(id)
  messages.value = []
  loading.value = true
  loadError.value = ''
  try {
    const result = await listAgentMessages(id)
    if (current === run) { messages.value = result; scroll(true) }
  } catch (failure) {
    if (current === run && !handleError(failure, { silent: true })) loadError.value = failure.message
  } finally {
    if (current === run) loading.value = false
  }
}

function newSession() {
  if (busy.value) return
  ++run
  sessionId.value = null
  messages.value = []
  loadError.value = ''
  draft.value = ''
  loading.value = false
  input.value?.focus()
}

async function removeSession() {
  const id = sessionId.value
  const current = run
  if (!id || busy.value || loading.value) return
  try {
    await ElMessageBox.confirm('确定删除这段选本对话及其中的消息？', '删除选本对话', {
      confirmButtonText: '删除对话', cancelButtonText: '取消', type: 'warning'
    })
  } catch {
    return
  }
  if (current !== run || busy.value) return
  loading.value = true
  try {
    await deleteAgentSession(id)
    if (current !== run) return
    sessions.value = sessions.value.filter(item => String(item.sessionId) !== id)
    newSession()
  } catch (failure) {
    if (current === run) handleError(failure)
  } finally {
    if (current === run) loading.value = false
  }
}

function onEnter(event) {
  if (event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  send(draft.value)
}

async function send(value) {
  const content = value.trim()
  if (!content || busy.value || loading.value) return
  if (!props.user || !getToken()) { emit('require-login'); return }
  const current = run
  if (!sessionId.value) {
    creating.value = true
    try {
      const session = await createAgentSession()
      if (current !== run) return
      sessions.value = [session, ...sessions.value].slice(0, 30)
      sessionId.value = String(session.sessionId)
    } catch (failure) {
      if (current === run) handleError(failure)
      return
    } finally {
      if (current === run) creating.value = false
    }
  }
  const activeId = sessionId.value
  const cancellation = new AbortController()
  controller.value = cancellation
  draft.value = ''
  const userEntry = { localId: ++entryId, role: 'user', content }
  const reply = reactive({
    localId: ++entryId, role: 'assistant', content: '', cards: [], tools: [], status: '正在连接选本顾问…',
    running: true, notice: '', limited: false
  })
  messages.value.push(userEntry, reply)
  scroll(true)
  try {
    await streamAgentChat(activeId, { message: content }, {
      signal: cancellation.signal,
      onEvent(event, data) {
        if (current !== run) return
        if (event === 'step') reply.status = data.message
        if (event === 'tool_call') reply.tools.push({ ...data })
        if (event === 'tool_result') {
          const call = [...reply.tools].reverse().find(item => item.callId === data.callId)
          if (call) call.summary = data.summary
        }
        if (event === 'card') reply.cards.push(data)
        if (event === 'delta') reply.content += data.text
        if (event === 'done') {
          reply.messageId = data.messageId
          const session = sessions.value.find(item => String(item.sessionId) === activeId)
          if (session) sessions.value = [
            { ...session, title: data.sessionTitle },
            ...sessions.value.filter(item => String(item.sessionId) !== activeId)
          ]
        }
        scroll()
      }
    })
  } catch (failure) {
    if (current !== run) return
    if (!cancellation.signal.aborted && handleError(failure, { silent: true })) return
    reply.cards = []
    reply.limited = failure.code === 429
    reply.notice = cancellation.signal.aborted ? '已停止生成' : failure.message
    if (reply.limited || failure.code === 409) {
      messages.value = messages.value.filter(item => item.localId !== userEntry.localId)
      if (!draft.value) draft.value = content
    }
    scroll(true)
  } finally {
    if (current === run) {
      reply.status = ''
      reply.running = false
      controller.value = null
    }
  }
}

function scroll(force = false) {
  const node = timeline.value
  const nearBottom = node && node.scrollHeight - node.scrollTop - node.clientHeight < 90
  if (force || nearBottom) nextTick(() => {
    if (timeline.value) timeline.value.scrollTop = timeline.value.scrollHeight
  })
}

function forward(event, value) {
  open.value = false
  emit(event, value)
}

async function contactPlatform() {
  if (contacting.value) return
  contacting.value = true
  try {
    const session = await api.value.openPlatformChat()
    if (!session?.sessionId) throw new Error('未能打开平台客服会话')
    forward('open-platform-chat', session.sessionId)
  } catch (failure) {
    handleError(failure)
  } finally {
    contacting.value = false
  }
}

function invalidateView() {
  ++run
  controller.value?.abort()
}
watch(() => props.user?.userId, () => {
  invalidateView()
  controller.value = null
  creating.value = false
  open.value = false
  loading.value = false
  loaded = false
  sessions.value = []
  newSession()
})
onBeforeUnmount(invalidateView)
</script>

<style scoped>
.agent-trigger, .agent-panel {
  --agent-edge: 24px;
  position: fixed;
  right: var(--agent-edge);
  z-index: 1200;
  color: var(--ink);
}
.agent-trigger {
  bottom: var(--agent-edge); display: inline-flex; align-items: center; gap: 9px;
  min-height: 46px; padding: 0 17px; border: 1px solid #1a4e47; border-radius: 30px;
  font: 600 14px var(--sans); color: #fff; background: #245b51; box-shadow: 0 8px 26px #173d3b38;
  cursor: pointer;
}
.agent-trigger span { color: #f4d588; font-size: 19px; }
.agent-trigger:hover, .agent-trigger[aria-expanded="true"] { background: #17483f; }
.agent-panel {
  --panel-width: 420px;
  bottom: calc(var(--agent-edge) + 57px);
  width: min(var(--panel-width), calc(100vw - 2 * var(--agent-edge)));
  height: min(640px, calc(100vh - 100px));
  height: min(640px, calc(100dvh - 100px));
  display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto;
  border: 1px solid #cbdad4; border-radius: 15px; overflow: hidden;
  background: var(--surface); box-shadow: 0 22px 70px #183b3333;
  font: 13px/1.6 var(--sans);
}
.agent-panel[data-wide="true"] { --panel-width: 860px; }
.agent-header, .agent-toolbar, .agent-composer { display: flex; align-items: center; gap: 9px; padding: 12px 14px; }
.agent-header { justify-content: space-between; gap: 8px; padding: 13px 15px; color: #fff; background: #245b51; }
.agent-title, .header-actions { display: flex; align-items: center; gap: 7px; min-width: 0; }
.agent-title { gap: 10px; }
.agent-title div { min-width: 0; }
.agent-title h2 { margin: 0; font: 600 17px/1.3 var(--serif); }
.agent-title p { margin: 2px 0 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #e4f1ed; }
.agent-icon { display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: #f2d18c; background: #ffffff19; font-size: 18px; }
.agent-command {
  flex: none; white-space: nowrap; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px;
  background: transparent; color: var(--brand); font: inherit; cursor: pointer;
}
.agent-command:hover { background: var(--brandsoft); }
.header-actions .agent-command { color: #fff; }
.header-actions .agent-command:hover { background: #ffffff24; }
.agent-command.close { font-size: 24px; line-height: 1; padding: 4px 6px; }
.agent-toolbar { border-bottom: 1px solid var(--line); padding-block: 8px; background: var(--soft); }
.history-label { color: #52635e; white-space: nowrap; }
.agent-toolbar select {
  min-width: 0; flex: 1; padding: 5px 7px; border: 1px solid var(--line);
  border-radius: 6px; color: var(--ink); background: var(--surface); font: inherit;
}
.agent-timeline { overflow: auto; overscroll-behavior: contain; padding: 17px 14px; background: #f5f8f6; }
.welcome, .view-state { margin: 12px 0; }
.welcome h3 { margin: 0; font: 600 22px/1.4 var(--serif); color: #22463c; }
.welcome p, .view-state { color: #54645f; }
.prompt {
  display: flex; justify-content: space-between; gap: 12px; width: 100%; margin-top: 8px; padding: 9px 12px;
  text-align: left; color: #2c5348; background: var(--surface); border: 1px solid #d4e4dd;
  border-radius: 7px; font: inherit; cursor: pointer;
}
.prompt:hover { background: #edf6f1; border-color: #89b4a5; }
.prompt span { color: var(--brand); }
.agent-entry { display: flex; margin: 0 0 14px; min-width: 0; }
.agent-entry[data-role="user"] { justify-content: flex-end; }
.user-message, .assistant-message { min-width: 0; overflow-wrap: anywhere; }
.user-message { max-width: 89%; padding: 8px 11px; border-radius: 10px 10px 2px 10px; white-space: pre-wrap; background: #e0efe8; }
.assistant-message { display: grid; gap: 9px; width: 100%; }
.progress-status { color: var(--brand); font-size: 12px; }
.steps { padding: 6px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
.steps summary { color: #42635a; cursor: pointer; }
.steps ul { display: grid; gap: 4px; padding: 0 0 0 15px; margin: 5px 0 0; }
.steps li span { margin-inline-start: 6px; color: #52635e; font-size: 12px; }
.agent-notice { padding: 8px 10px; border: 1px solid #e6d6af; border-radius: 7px; background: #fcf7e8; }
.agent-notice p { margin: 0 0 3px; }
.agent-composer { align-items: flex-end; background: var(--surface); border-top: 1px solid var(--line); }
.agent-composer textarea {
  flex: 1; min-width: 0; min-height: 49px; max-height: 130px; resize: vertical; padding: 7px 9px;
  border: 1px solid #d5e1dc; border-radius: 7px; color: var(--ink); font: inherit;
}
.agent-panel button:focus-visible, .agent-panel select:focus-visible, .agent-panel textarea:focus-visible,
.agent-trigger:focus-visible { outline: 2px solid var(--brand2); outline-offset: 2px; }
.agent-panel button:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 520px) {
  .agent-trigger, .agent-panel { --agent-edge: 12px; }
  .agent-panel { height: min(640px, calc(100dvh - 82px)); }
  .agent-toolbar { gap: 5px; padding-inline: 9px; }
  .agent-toolbar .agent-command { padding-inline: 3px; }
  .resize { display: none; }
}
</style>
