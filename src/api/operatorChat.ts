/** Only route identifiers and visible user text cross the client boundary. */
export interface ChatThread {
  thread_id: string
  tenant_id: string
  operator_subject: string
  runtime_provider: 'codex'
  runtime_thread_ref: string | null
  status: 'active' | 'archived'
  title: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}
export interface ChatMessage {
  message_id: string
  thread_id: string
  tenant_id: string
  role: 'user' | 'assistant' | 'system_event'
  content: string
  created_at: string
  correlation_id: string | null
}
export type ChatEvent =
  | { type: 'message_started'; message: ChatMessage; correlation_id: string }
  | { type: 'assistant_message'; message: ChatMessage }
  | {
      type: 'context_ready'
      advisory: boolean
      estate: boolean
      integrations: number
      partial: boolean
    }
  | { type: 'runtime_state'; status: 'running' }
  | { type: 'privacy_state_changed'; state: 'private' }
  | {
      type: 'tool_started' | 'tool_completed'
      tool: string
      label: string
      status: 'running' | 'completed' | 'failed'
    }
  | { type: 'completed' | 'cancelled' }
  | { type: 'error'; code: string; message: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_response')
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    throw new Error('invalid_response')
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value)
}
function date(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
export function parseThread(value: unknown, tenantId: string): ChatThread {
  const row = record(value)
  exact(row, [
    'thread_id',
    'tenant_id',
    'operator_subject',
    'runtime_provider',
    'runtime_thread_ref',
    'status',
    'title',
    'created_at',
    'updated_at',
    'archived_at',
  ])
  if (
    !identifier(row.thread_id) ||
    row.tenant_id !== tenantId ||
    row.runtime_provider !== 'codex' ||
    typeof row.operator_subject !== 'string' ||
    row.runtime_thread_ref !== null ||
    !['active', 'archived'].includes(String(row.status)) ||
    !(
      row.title === null ||
      (typeof row.title === 'string' && row.title.length <= 200)
    ) ||
    !date(row.created_at) ||
    !date(row.updated_at) ||
    !(row.archived_at === null || date(row.archived_at))
  )
    throw new Error('invalid_response')
  return row as unknown as ChatThread
}
export function parseMessage(
  value: unknown,
  tenantId: string,
  threadId: string,
): ChatMessage {
  const row = record(value)
  exact(row, [
    'message_id',
    'thread_id',
    'tenant_id',
    'role',
    'content',
    'created_at',
    'correlation_id',
  ])
  if (
    !identifier(row.message_id) ||
    row.tenant_id !== tenantId ||
    row.thread_id !== threadId ||
    !['user', 'assistant', 'system_event'].includes(String(row.role)) ||
    typeof row.content !== 'string' ||
    row.content.length < 1 ||
    row.content.length > 16000 ||
    !date(row.created_at) ||
    !(row.correlation_id === null || identifier(row.correlation_id))
  )
    throw new Error('invalid_response')
  return row as unknown as ChatMessage
}
export function parseChatEvent(
  value: unknown,
  tenantId: string,
  threadId: string,
): ChatEvent {
  const row = record(value)
  switch (row.type) {
    case 'message_started':
      exact(row, ['type', 'message', 'correlation_id'])
      if (!identifier(row.correlation_id)) throw new Error('invalid_response')
      if (parseMessage(row.message, tenantId, threadId).role !== 'user')
        throw new Error('invalid_response')
      return {
        type: 'message_started',
        message: parseMessage(row.message, tenantId, threadId),
        correlation_id: row.correlation_id,
      }
    case 'assistant_message':
      exact(row, ['type', 'message'])
      if (parseMessage(row.message, tenantId, threadId).role !== 'assistant')
        throw new Error('invalid_response')
      return {
        type: 'assistant_message',
        message: parseMessage(row.message, tenantId, threadId),
      }
    case 'context_ready':
      exact(row, ['type', 'advisory', 'estate', 'integrations', 'partial'])
      if (
        typeof row.advisory !== 'boolean' ||
        typeof row.estate !== 'boolean' ||
        typeof row.partial !== 'boolean' ||
        typeof row.integrations !== 'number' ||
        !Number.isInteger(row.integrations) ||
        row.integrations < 0 ||
        row.integrations > 16
      )
        throw new Error('invalid_response')
      break
    case 'runtime_state':
      exact(row, ['type', 'status'])
      if (row.status !== 'running') throw new Error('invalid_response')
      break
    case 'privacy_state_changed':
      exact(row, ['type', 'state'])
      if (row.state !== 'private') throw new Error('invalid_response')
      break
    case 'tool_started':
    case 'tool_completed': {
      exact(row, ['type', 'tool', 'label', 'status'])
      const labels: Record<string, string> = {
        shell: 'Exécution sandbox',
        workspace: 'Fichiers temporaires',
        syncoria_provider_request: 'Lecture provider via MCP',
      }
      if (
        typeof row.tool !== 'string' ||
        row.label !== labels[row.tool] ||
        !(row.type === 'tool_started'
          ? row.status === 'running'
          : ['completed', 'failed'].includes(String(row.status)))
      )
        throw new Error('invalid_response')
      break
    }
    case 'completed':
    case 'cancelled':
      exact(row, ['type'])
      break
    case 'error':
      exact(row, ['type', 'code', 'message'])
      if (
        row.code !== 'runtime_unavailable' ||
        row.message !== "La réponse n'a pas pu être terminée."
      )
        throw new Error('invalid_response')
      break
    default:
      throw new Error('invalid_response')
  }
  return row as unknown as ChatEvent
}
export class ChatRequestError extends Error {
  status: number
  constructor(status: number) {
    super('chat_request_failed')
    this.status = status
  }
}
export async function chatRequest(
  apiBaseUrl: string | null,
  tenantId: string,
  path: string,
  method = 'GET',
  signal?: AbortSignal,
  content?: string,
): Promise<Response> {
  if (!apiBaseUrl || !uuid.test(tenantId)) throw new ChatRequestError(503)
  const response = await fetch(
    `${apiBaseUrl}/admin/operator-chat/tenants/${tenantId}/threads${path}`,
    {
      method,
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json' },
      ...(content !== undefined ? { body: JSON.stringify({ content }) } : {}),
    },
  )
  if (!response.ok) throw new ChatRequestError(response.status)
  return response
}
export async function readChatStream(
  response: Response,
  tenantId: string,
  threadId: string,
  onEvent: (event: ChatEvent) => void,
) {
  if (
    !response.headers.get('content-type')?.startsWith('text/event-stream') ||
    !response.body
  )
    throw new Error('invalid_stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = '',
    ended = false
  try {
    while (true) {
      const chunk = await reader.read()
      pending += decoder.decode(chunk.value, { stream: !chunk.done })
      if (pending.length > 100000) throw new Error('stream_limit')
      let boundary
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, boundary)
        pending = pending.slice(boundary + 2)
        if (frame.startsWith(':')) continue
        if (!frame.startsWith('data: ') || ended)
          throw new Error('invalid_stream')
        const event = parseChatEvent(
          JSON.parse(frame.slice(6)),
          tenantId,
          threadId,
        )
        onEvent(event)
        if (['completed', 'cancelled', 'error'].includes(event.type))
          ended = true
      }
      if (chunk.done) break
    }
    if (!ended || pending.trim()) throw new Error('incomplete_stream')
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
