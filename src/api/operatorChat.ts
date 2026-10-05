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
  | { type: 'assistant_delta'; text: string }
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
    case 'assistant_delta':
      exact(row, ['type', 'text'])
      if (typeof row.text !== 'string' || row.text.length > 16000)
        throw new Error('invalid_response')
      break
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
        syncoria_chat_memory_search: 'Recherche mémoire tenant',
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
  content?: string | Record<string, unknown>,
): Promise<Response> {
  if (!apiBaseUrl || !uuid.test(tenantId)) throw new ChatRequestError(503)
  const response = await fetch(
    `${apiBaseUrl}/admin/operator-chat/tenants/${tenantId}/threads${path}`,
    {
      method,
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json' },
      ...(content !== undefined
        ? {
            body: JSON.stringify(
              typeof content === 'string' ? { content } : content,
            ),
          }
        : {}),
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

/** Future uploads use opaque tenant-scoped IDs; host paths are never accepted. */
export interface ChatAttachmentReference {
  attachment_id: string
}
export interface ChatCapability {
  id: string
  label: string
  supported: boolean
  enabled: boolean
  reason: string | null
}
export interface CapabilityProfile {
  capabilities: ChatCapability[]
  policy_version: string
}
export function parseCapabilities(value: unknown): CapabilityProfile {
  const row = record(value)
  exact(row, ['capabilities', 'policy_version'])
  if (
    !Array.isArray(row.capabilities) ||
    row.capabilities.length > 32 ||
    typeof row.policy_version !== 'string'
  )
    throw new Error('invalid_response')
  const ids = new Set<string>()
  const capabilities = row.capabilities.map((value) => {
    const item = record(value)
    exact(item, ['id', 'label', 'supported', 'enabled', 'reason'])
    if (
      typeof item.id !== 'string' ||
      !/^[a-z_]{1,64}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.label !== 'string' ||
      item.label.length > 160 ||
      typeof item.supported !== 'boolean' ||
      typeof item.enabled !== 'boolean' ||
      (!item.supported && item.enabled) ||
      !(
        item.reason === null ||
        (typeof item.reason === 'string' && item.reason.length <= 400)
      )
    )
      throw new Error('invalid_response')
    ids.add(item.id)
    return item as unknown as ChatCapability
  })
  return { capabilities, policy_version: row.policy_version }
}
export interface MemoryResult {
  thread_id: string
  title: string | null
  archived: boolean
  kind: string
  content: string
  rank: number
}
export function parseMemoryResults(value: unknown): MemoryResult[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('invalid_response')
  return value.map((value) => {
    const row = record(value)
    exact(row, ['thread_id', 'title', 'archived', 'kind', 'content', 'rank'])
    if (
      !identifier(row.thread_id) ||
      !(
        row.title === null ||
        (typeof row.title === 'string' && row.title.length <= 200)
      ) ||
      typeof row.archived !== 'boolean' ||
      typeof row.kind !== 'string' ||
      typeof row.content !== 'string' ||
      row.content.length > 16000 ||
      typeof row.rank !== 'number' ||
      !Number.isFinite(row.rank)
    )
      throw new Error('invalid_response')
    return row as unknown as MemoryResult
  })
}
export async function operatorRequest(
  apiBaseUrl: string | null,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!apiBaseUrl) throw new ChatRequestError(503)
  const response = await fetch(`${apiBaseUrl}/admin/operator-chat${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new ChatRequestError(response.status)
  return response.json()
}
export function conversationGroups(
  threads: ChatThread[],
  now = new Date(),
): { label: string; threads: ChatThread[] }[] {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const groups = [
    'Aujourd’hui',
    'Hier',
    '7 derniers jours',
    'Plus anciennes',
  ].map((label) => ({ label, threads: [] as ChatThread[] }))
  for (const thread of [...threads].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
  )) {
    const age = today - Date.parse(thread.updated_at)
    groups[
      age <= 0 ? 0 : age <= 86400000 ? 1 : age <= 6 * 86400000 ? 2 : 3
    ].threads.push(thread)
  }
  return groups.filter((group) => group.threads.length)
}
export interface ChatSnapshot {
  model: string
  reasoning_effort: string
  runtime_provider: 'codex'
  runtime_version: string
  capabilities: Record<string, boolean>
  mcp: string[]
  sandbox: 'workspace-write'
  privacy: 'private'
  network: 'private-egress-disabled'
  policy_version: string
  config_hash: string
  correlation_id: string
  timestamp: string
}
export interface ChatDiagnostic {
  correlation_id: string
  snapshot: ChatSnapshot | null
  status: string
  duration_ms: number | null
  created_at: string
  tools: { tool: string; label: string; status: string }[]
}
export function parseDiagnostics(value: unknown): ChatDiagnostic[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('invalid_response')
  return value.map((value) => {
    const row = record(value)
    exact(row, [
      'correlation_id',
      'snapshot',
      'status',
      'duration_ms',
      'created_at',
      'tools',
    ])
    if (
      !identifier(row.correlation_id) ||
      !['running', 'succeeded', 'failed', 'cancelled'].includes(
        String(row.status),
      ) ||
      !(
        row.duration_ms === null ||
        (typeof row.duration_ms === 'number' &&
          row.duration_ms >= 0 &&
          Number.isFinite(row.duration_ms))
      ) ||
      !date(row.created_at) ||
      !Array.isArray(row.tools) ||
      row.tools.length > 100
    )
      throw new Error('invalid_response')
    for (const tool of row.tools) {
      const item = record(tool)
      exact(item, ['tool', 'label', 'status'])
      parseChatEvent(
        {
          type: item.status === 'running' ? 'tool_started' : 'tool_completed',
          ...item,
        },
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      )
    }
    if (row.snapshot !== null) {
      const snapshot = record(row.snapshot)
      exact(snapshot, [
        'model',
        'reasoning_effort',
        'runtime_provider',
        'runtime_version',
        'capabilities',
        'mcp',
        'sandbox',
        'privacy',
        'network',
        'policy_version',
        'config_hash',
        'correlation_id',
        'timestamp',
      ])
      const flags = record(snapshot.capabilities)
      exact(flags, ['shell', 'workspace', 'python', 'multi_agent'])
      if (
        Object.values(flags).some((flag) => typeof flag !== 'boolean') ||
        !Array.isArray(snapshot.mcp) ||
        snapshot.mcp.length !== 2 || new Set(snapshot.mcp).size !== 2 ||
        snapshot.mcp.some(
          (tool) =>
            ![
              'syncoria_provider_request',
              'syncoria_chat_memory_search',
            ].includes(String(tool)),
        ) ||
        snapshot.runtime_provider !== 'codex' ||
        snapshot.sandbox !== 'workspace-write' ||
        snapshot.privacy !== 'private' ||
        snapshot.network !== 'private-egress-disabled' ||
        snapshot.correlation_id !== row.correlation_id ||
        !date(snapshot.timestamp) ||
        typeof snapshot.config_hash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(snapshot.config_hash) ||
        ['model', 'reasoning_effort', 'runtime_version', 'policy_version'].some(
          (key) =>
            typeof snapshot[key] !== 'string' ||
            String(snapshot[key]).length > 200,
        )
      )
        throw new Error('invalid_response')
    }
    return row as unknown as ChatDiagnostic
  })
}
export interface ChatAttachmentPolicy {
  available: false
  reference: 'attachment_id'
  tenant_scoped: true
  max_size_bytes: number
  allowed_media_types: string[]
  lifetime: 'turn'
  host_paths_allowed: false
}
export function parseAttachmentPolicy(value: unknown): ChatAttachmentPolicy {
  const row = record(value)
  exact(row, [
    'available',
    'reference',
    'tenant_scoped',
    'max_size_bytes',
    'allowed_media_types',
    'lifetime',
    'host_paths_allowed',
  ])
  if (
    row.available !== false ||
    row.reference !== 'attachment_id' ||
    row.tenant_scoped !== true ||
    row.max_size_bytes !== 10485760 ||
    !Array.isArray(row.allowed_media_types) ||
    row.allowed_media_types.length !== 2 ||
    !row.allowed_media_types.includes('text/plain') ||
    !row.allowed_media_types.includes('application/pdf') ||
    row.lifetime !== 'turn' ||
    row.host_paths_allowed !== false
  )
    throw new Error('invalid_response')
  return row as unknown as ChatAttachmentPolicy
}
export function parseAttachmentReference(
  value: unknown,
): ChatAttachmentReference {
  const row = record(value)
  exact(row, ['attachment_id'])
  if (!identifier(row.attachment_id)) throw new Error('invalid_response')
  return row as unknown as ChatAttachmentReference
}
