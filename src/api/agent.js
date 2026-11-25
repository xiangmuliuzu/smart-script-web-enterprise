import { clearSession, getToken, isAuthFailure, request } from '../auth.js'
import { friendlyErrorMessage, networkErrorMessage } from '../utils/friendly-error.js'

const BASE_API = import.meta.env?.VITE_APP_BASE_API || '/dev-api'
const SESSIONS = '/api/v1/trade/agent/sessions'
export const LIMIT_MESSAGE = '今日 AI 选本咨询次数已达上限，请明天再来或直接联系平台客服'
const sessionPath = sessionId => SESSIONS + '/' + encodeURIComponent(sessionId)
const data = async (path, options) => (await request(path, options)).data

export const createAgentSession = title => data(SESSIONS, { method: 'POST', body: { title } })
export const listAgentSessions = () => data(SESSIONS)
export const listAgentMessages = sessionId => data(sessionPath(sessionId) + '/messages')
export const deleteAgentSession = sessionId => data(sessionPath(sessionId), { method: 'DELETE' })

function streamError(token, { status, code, message }) {
  const quota = Number(code) === 429 || Number(status) === 429
  const error = new Error(quota ? LIMIT_MESSAGE : friendlyErrorMessage({
    status,
    code,
    message,
    fallback: '选本回复中断，请稍后重试'
  }))
  error.status = status
  error.code = quota ? 429 : Number(code) || status
  if (token && getToken() === token && isAuthFailure(error)) clearSession()
  return error
}

export async function streamAgentChat(sessionId, { message, model }, { signal, onEvent }) {
  const token = getToken()
  const headers = { Accept: 'text/event-stream', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token

  let response
  try {
    response = await fetch(BASE_API + sessionPath(sessionId) + '/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, model }),
      signal
    })
  } catch (failure) {
    signal?.throwIfAborted()
    throw new Error(networkErrorMessage(failure))
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const result = await response.json().catch(() => null)
    throw streamError(token, { status: response.status, code: result?.code, message: result?.message || result?.msg })
  }
  if (!response.body) throw streamError(token, {})

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let lines = []
  let done = false
  const cancel = () => { reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })

  function consume(line) {
    if (line === '') {
      if (lines.length) {
        let payload
        try {
          payload = JSON.parse(lines.join('\n'))
        } catch {
          throw streamError(token, {})
        }
        onEvent?.(event, payload)
        if (event === 'error') throw streamError(token, payload || {})
        done = event === 'done'
      }
      event = 'message'
      lines = []
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      lines.push(line.slice(5).replace(/^ /, ''))
    }
  }

  try {
    while (!done) {
      signal?.throwIfAborted()
      let chunk
      try {
        chunk = await reader.read()
      } catch (failure) {
        signal?.throwIfAborted()
        throw new Error(networkErrorMessage(failure))
      }
      signal?.throwIfAborted()
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      let match
      while (!done && (match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
        consume(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
      }
      if (chunk.done) {
        if (buffer.endsWith('\r')) consume(buffer.slice(0, -1))
        if (!done) throw streamError(token, {})
        break
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}
