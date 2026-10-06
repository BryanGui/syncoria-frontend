import {
  chatRequest,
  operatorRequest,
  ChatRequestError,
  parseDiagnostics,
  type ChatDiagnostic,
} from './operatorChat.ts'

export interface AgentSettings {
  model: string
  reasoning_effort: string
  capabilities: {
    shell: boolean
    workspace: boolean
    python: boolean
    multi_agent: boolean
  }
  mcp_concurrency: number
  tool_budget: number
  timeout_seconds: number
}
export interface AgentModel {
  id: string
  label: string
  reasoning_efforts: string[]
  default_reasoning_effort: string | null
}
export interface AgentSettingsProfile {
  revision: number
  settings: AgentSettings
  defaults: AgentSettings
  catalogue: {
    models: AgentModel[]
    preferred_model_id: string | null
    astra_available: boolean
    astra_reason: string | null
    runtime_version: string
  }
  capabilities: {
    id: string
    label: string
    supported: boolean
    reason: string | null
  }[]
  mcp: { name: string; read_only: true }[]
  bounds: {
    mcp_concurrency: { min: number; max: number }
    tool_budget: { min: number; max: number }
    timeout_seconds: { min: number; max: number }
  }
  validation_error: string | null
}
export interface AgentTimings {
  request_received_at: string
  runtime_ready_ms: number | null
  mcp_ready_ms: number | null
  first_event_ms: number | null
  first_text_ms: number | null
  context_ready_ms: number | null
  worker_wait_ms: number | null
  final_response_ms: number | null
  tools: { tool: string; phase: 'started' | 'completed'; at_ms: number }[]
  mcp_calls?: {
    stage:
      | 'mcp_tool_queued'
      | 'mcp_tool_started'
      | 'mcp_tool_completed'
      | 'mcp_tool_rejected'
      | 'mcp_child_ready'
    at_ms: number
    queue_wait_ms: number | null
    execution_ms: number | null
    duration_ms: number | null
    active: number | null
    queued: number | null
    calls: number | null
  }[]
}
export interface InternalChatDiagnostic extends ChatDiagnostic {
  chosen_settings: AgentSettings | null
  timings: AgentTimings | null
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const flagKeys = ['shell', 'workspace', 'python', 'multi_agent']
const text = (value: unknown, max = 200): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  !value.includes('\0')
const nullableText = (value: unknown, max = 400) => value === null || text(value, max)
const instant = (value: unknown) =>
  typeof value === 'string' &&
  /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value))
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_response')
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('invalid_response')
}
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
export function parseInternalContext(value: unknown): { tenant_id: string } {
  const context = row(value)
  exact(context, ['tenant_id'])
  if (typeof context.tenant_id !== 'string' || !uuid.test(context.tenant_id))
    throw new Error('invalid_response')
  return context as { tenant_id: string }
}
export function parseAgentSettings(value: unknown): AgentSettings {
  const settings = row(value)
  exact(settings, [
    'model',
    'reasoning_effort',
    'capabilities',
    'mcp_concurrency',
    'tool_budget',
    'timeout_seconds',
  ])
  const capabilities = row(settings.capabilities)
  exact(capabilities, flagKeys)
  if (
    !text(settings.model) ||
    !text(settings.reasoning_effort, 64) ||
    !/^[a-z][a-z0-9_]*$/.test(settings.reasoning_effort) ||
    Object.values(capabilities).some((flag) => typeof flag !== 'boolean') ||
    capabilities.shell !== capabilities.workspace ||
    capabilities.shell !== capabilities.python ||
    !integer(settings.mcp_concurrency, 1, 4) ||
    !integer(settings.tool_budget, 1, 32) ||
    !integer(settings.timeout_seconds, 30, 900)
  )
    throw new Error('invalid_response')
  return settings as unknown as AgentSettings
}
export function parseAgentSettingsProfile(value: unknown): AgentSettingsProfile {
  const profile = row(value)
  exact(profile, [
    'revision',
    'settings',
    'defaults',
    'catalogue',
    'capabilities',
    'mcp',
    'bounds',
    'validation_error',
  ])
  if (
    !integer(profile.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !nullableText(profile.validation_error)
  )
    throw new Error('invalid_response')
  parseAgentSettings(profile.settings)
  parseAgentSettings(profile.defaults)
  const catalogue = row(profile.catalogue)
  exact(catalogue, [
    'models',
    'preferred_model_id',
    'astra_available',
    'astra_reason',
    'runtime_version',
  ])
  if (
    !Array.isArray(catalogue.models) ||
    catalogue.models.length > 256 ||
    !nullableText(catalogue.preferred_model_id, 200) ||
    typeof catalogue.astra_available !== 'boolean' ||
    !nullableText(catalogue.astra_reason) ||
    !text(catalogue.runtime_version)
  )
    throw new Error('invalid_response')
  const models = new Set<string>()
  for (const value of catalogue.models) {
    const model = row(value)
    exact(model, ['id', 'label', 'reasoning_efforts', 'default_reasoning_effort'])
    if (
      !text(model.id) ||
      models.has(model.id) ||
      !text(model.label) ||
      !Array.isArray(model.reasoning_efforts) ||
      model.reasoning_efforts.length > 32 ||
      model.reasoning_efforts.some(
        (effort) => !text(effort, 64) || !/^[a-z][a-z0-9_]*$/.test(effort),
      ) ||
      new Set(model.reasoning_efforts).size !== model.reasoning_efforts.length ||
      !(
        model.default_reasoning_effort === null ||
        (typeof model.default_reasoning_effort === 'string' &&
          model.reasoning_efforts.includes(model.default_reasoning_effort))
      )
    )
      throw new Error('invalid_response')
    models.add(model.id)
  }
  if (
    catalogue.preferred_model_id !== null &&
    !models.has(String(catalogue.preferred_model_id))
  )
    throw new Error('invalid_response')
  if (catalogue.astra_available && catalogue.preferred_model_id === null)
    throw new Error('invalid_response')
  if (
    !Array.isArray(profile.capabilities) ||
    profile.capabilities.length > 32 ||
    !Array.isArray(profile.mcp) ||
    profile.mcp.length > 64
  )
    throw new Error('invalid_response')
  const capabilities = new Set<string>()
  for (const value of profile.capabilities) {
    const capability = row(value)
    exact(capability, ['id', 'label', 'supported', 'reason'])
    if (
      !text(capability.id, 64) ||
      !/^[a-z][a-z0-9_]*$/.test(capability.id) ||
      capabilities.has(capability.id) ||
      !text(capability.label, 160) ||
      typeof capability.supported !== 'boolean' ||
      !nullableText(capability.reason)
    )
      throw new Error('invalid_response')
    capabilities.add(capability.id)
  }
  if (flagKeys.some((key) => !capabilities.has(key)))
    throw new Error('invalid_response')
  const tools = new Set<string>()
  for (const value of profile.mcp) {
    const tool = row(value)
    exact(tool, ['name', 'read_only'])
    if (
      !text(tool.name, 100) ||
      !/^[a-z][a-z0-9_]*$/.test(tool.name) ||
      tools.has(tool.name) ||
      tool.read_only !== true
    )
      throw new Error('invalid_response')
    tools.add(tool.name)
  }
  const bounds = row(profile.bounds)
  exact(bounds, ['mcp_concurrency', 'tool_budget', 'timeout_seconds'])
  for (const [key, maximum] of [
    ['mcp_concurrency', 4],
    ['tool_budget', 32],
    ['timeout_seconds', 900],
  ] as const) {
    const bound = row(bounds[key])
    exact(bound, ['min', 'max'])
    const minimum = key === 'timeout_seconds' ? 30 : 1
    if (
      !integer(bound.min, minimum, maximum) ||
      !integer(bound.max, Number(bound.min), maximum)
    )
      throw new Error('invalid_response')
  }
  return profile as unknown as AgentSettingsProfile
}
export function parseInternalDiagnostics(value: unknown): InternalChatDiagnostic[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid_response')
  return value.map((value) => {
    const diagnostic = row(value)
    exact(diagnostic, [
      'correlation_id',
      'snapshot',
      'status',
      'duration_ms',
      'created_at',
      'tools',
      'chosen_settings',
      'timings',
    ])
    const { chosen_settings, timings, ...legacy } = diagnostic
    const parsed = parseDiagnostics([legacy])[0]
    if (chosen_settings !== null) parseAgentSettings(chosen_settings)
    if (timings !== null) {
      const metrics = row(timings)
      const keys = [
        'runtime_ready_ms',
        'mcp_ready_ms',
        'first_event_ms',
        'first_text_ms',
        'context_ready_ms',
        'worker_wait_ms',
        'final_response_ms',
      ]
      exact(metrics, [
        'request_received_at',
        ...keys,
        'tools',
        ...(Object.hasOwn(metrics, 'mcp_calls') ? ['mcp_calls'] : []),
      ])
      if (
        !instant(metrics.request_received_at) ||
        keys.some(
          (key) =>
            !(
              metrics[key] === null ||
              (typeof metrics[key] === 'number' &&
                Number.isFinite(metrics[key]) &&
                Number(metrics[key]) >= 0)
            ),
        ) ||
        !Array.isArray(metrics.tools) ||
        metrics.tools.length > 128
      )
        throw new Error('invalid_response')
      for (const value of metrics.tools) {
        const tool = row(value)
        exact(tool, ['tool', 'phase', 'at_ms'])
        if (
          !text(tool.tool, 100) ||
          !['shell', 'workspace', 'syncoria_provider_request', 'syncoria_chat_memory_search'].includes(String(tool.tool)) ||
          !['started', 'completed'].includes(String(tool.phase)) ||
          typeof tool.at_ms !== 'number' ||
          !Number.isFinite(tool.at_ms) ||
          tool.at_ms < 0
        )
          throw new Error('invalid_response')
      }
      if (Object.hasOwn(metrics, 'mcp_calls')) {
        if (!Array.isArray(metrics.mcp_calls) || metrics.mcp_calls.length > 256)
          throw new Error('invalid_response')
        for (const value of metrics.mcp_calls) {
          const call = row(value)
          const fields = [
            'queue_wait_ms',
            'execution_ms',
            'duration_ms',
            'active',
            'queued',
            'calls',
          ]
          exact(call, ['stage', 'at_ms', ...fields])
          if (
            ![
              'mcp_tool_queued',
              'mcp_tool_started',
              'mcp_tool_completed',
              'mcp_tool_rejected',
              'mcp_child_ready',
            ].includes(String(call.stage)) ||
            typeof call.at_ms !== 'number' ||
            !Number.isFinite(call.at_ms) ||
            call.at_ms < 0 ||
            call.at_ms > 1_000_000_000 ||
            fields.some(
              (field) =>
                !(
                  call[field] === null ||
                  (typeof call[field] === 'number' &&
                    Number.isFinite(call[field]) &&
                    Number(call[field]) >= 0 &&
                    Number(call[field]) <= 1_000_000_000)
                ),
            )
          )
            throw new Error('invalid_response')
        }
      }
    }
    return {
      ...parsed,
      chosen_settings: chosen_settings as AgentSettings | null,
      timings: timings as AgentTimings | null,
    }
  })
}

export async function internalAssistantRequest(
  apiBaseUrl: string | null,
  path: string,
  method = 'GET',
  signal?: AbortSignal,
  body?: unknown,
): Promise<Response> {
  if (!apiBaseUrl) throw new ChatRequestError(503)
  const response = await fetch(`${apiBaseUrl}/admin/operator-chat/internal${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new ChatRequestError(response.status)
  return response
}
export async function loadInternalContext(
  apiBaseUrl: string | null,
  signal?: AbortSignal,
) {
  return parseInternalContext(
    await (
      await internalAssistantRequest(apiBaseUrl, '/context', 'GET', signal)
    ).json(),
  )
}
export function createAgentSettingsApi(apiBaseUrl: string | null) {
  async function request(
    method: string,
    signal?: AbortSignal,
    body?: unknown,
    reset = false,
  ) {
    return parseAgentSettingsProfile(
      await (
        await internalAssistantRequest(
          apiBaseUrl,
          `/settings${reset ? '/reset' : ''}`,
          method,
          signal,
          body,
        )
      ).json(),
    )
  }
  return {
    load: (signal?: AbortSignal) => request('GET', signal),
    save: (revision: number, settings: AgentSettings, signal?: AbortSignal) =>
      request('PUT', signal, { revision, settings: parseAgentSettings(settings) }),
    reset: (revision: number, signal?: AbortSignal) =>
      request('POST', signal, { revision }, true),
  }
}

/** Route construction is shared here; the chat retains its existing interaction lifecycle. */
export function createChatWorkspaceApi(
  apiBaseUrl: string | null,
  tenantId: string,
  scope: 'internal' | 'tenant',
) {
  return {
    threads(
      path: string,
      method = 'GET',
      signal?: AbortSignal,
      body?: string | Record<string, unknown>,
    ) {
      return scope === 'internal'
        ? internalAssistantRequest(
            apiBaseUrl,
            `/threads${path}`,
            method,
            signal,
            typeof body === 'string' ? { content: body } : body,
          )
        : chatRequest(apiBaseUrl, tenantId, path, method, signal, body)
    },
    memory(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
      return scope === 'internal'
        ? internalAssistantRequest(
            apiBaseUrl,
            `/memory${path}`,
            method,
            signal,
            body,
          ).then((response) => response.json())
        : operatorRequest(
            apiBaseUrl,
            `/tenants/${tenantId}/memory${path}`,
            method,
            body,
            signal,
          )
    },
  }
}
