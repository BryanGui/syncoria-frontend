import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInternalContext,
  parseAgentSettings,
  parseAgentSettingsProfile,
  parseInternalDiagnostics,
  internalAssistantRequest,
  createAgentSettingsApi,
  createChatWorkspaceApi,
} from '../src/api/internalAssistant.ts'
import { ChatRequestError, parseDiagnostics } from '../src/api/operatorChat.ts'

const tenant = '11111111-1111-4111-8111-111111111111',
  thread = '22222222-2222-4222-8222-222222222222'
const settings = {
  model: 'catalogue-model-1',
  reasoning_effort: 'high',
  capabilities: { shell: true, workspace: true, python: true, multi_agent: false },
  mcp_concurrency: 2,
  tool_budget: 16,
  timeout_seconds: 300,
}
const profile = {
  revision: 1,
  settings,
  defaults: settings,
  catalogue: {
    models: [
      {
        id: 'catalogue-model-1',
        label: 'Modèle autorisé',
        reasoning_efforts: ['medium', 'high', 'ultra'],
        default_reasoning_effort: 'medium',
      },
    ],
    preferred_model_id: null,
    astra_available: false,
    astra_reason: 'Absent du catalogue connecté.',
    runtime_version: 'synthetic-test',
  },
  capabilities: Object.keys(settings.capabilities).map((id) => ({
    id,
    label: id,
    supported: true,
    reason: null,
  })),
  mcp: [
    { name: 'syncoria_chat_memory_search', read_only: true },
    { name: 'syncoria_provider_request', read_only: true },
  ],
  bounds: {
    mcp_concurrency: { min: 1, max: 4 },
    tool_budget: { min: 1, max: 32 },
    timeout_seconds: { min: 30, max: 900 },
  },
  validation_error: null,
}
const snapshot = {
  model: settings.model,
  reasoning_effort: settings.reasoning_effort,
  runtime_provider: 'codex',
  runtime_version: 'synthetic-test',
  capabilities: settings.capabilities,
  mcp: profile.mcp.map((tool) => tool.name),
  sandbox: 'workspace-write',
  privacy: 'private',
  network: 'private-egress-disabled',
  policy_version: 'operator-chat-internal',
  config_hash: 'a'.repeat(64),
  correlation_id: thread,
  timestamp: '2026-10-06T10:00:00Z',
}
const diagnostic = {
  correlation_id: thread,
  snapshot,
  status: 'succeeded',
  duration_ms: 100,
  created_at: snapshot.timestamp,
  tools: [],
  chosen_settings: settings,
  timings: {
    request_received_at: snapshot.timestamp,
    runtime_ready_ms: 10,
    mcp_ready_ms: 20,
    first_event_ms: 30,
    first_text_ms: 50,
    context_ready_ms: 25,
    worker_wait_ms: 2,
    final_response_ms: 100,
    tools: [
      { tool: 'syncoria_provider_request', phase: 'started', at_ms: 35 },
      { tool: 'syncoria_provider_request', phase: 'completed', at_ms: 45 },
    ],
  },
}
test('internal context accepts only a server UUID, never names/credentials/alternate scope', () => {
  assert.deepEqual(parseInternalContext({ tenant_id: tenant }), { tenant_id: tenant })
  for (const value of [
    { tenant_id: 'demo:1' },
    { tenant_id: tenant, name: 'Private' },
    { tenant_id: tenant, token: 'synthetic-secret' },
    {},
    null,
  ])
    assert.throws(() => parseInternalContext(value))
})
test('settings accept announced high/ultra effort identifiers and coherent sandbox flags', () => {
  assert.deepEqual(parseAgentSettings(settings), settings)
  assert.equal(
    parseAgentSettings({ ...settings, reasoning_effort: 'ultra' }).reasoning_effort,
    'ultra',
  )
  for (const value of [
    { ...settings, model: '' },
    { ...settings, reasoning_effort: 'HIGH' },
    { ...settings, capabilities: { ...settings.capabilities, python: false } },
    { ...settings, mcp_concurrency: 0 },
    { ...settings, mcp_concurrency: 5 },
    { ...settings, tool_budget: 33 },
    { ...settings, timeout_seconds: 29 },
    { ...settings, timeout_seconds: 901 },
    { ...settings, timeout_seconds: 50.5 },
    { ...settings, api_key: 'synthetic-secret' },
  ])
    assert.throws(() => parseAgentSettings(value))
})
test('profile accepts unavailable persisted models explicitly without silently substituting defaults', () => {
  assert.deepEqual(parseAgentSettingsProfile(profile), profile)
  const unavailable = {
    ...profile,
    settings: { ...settings, model: 'removed-model' },
    validation_error: 'model_unavailable',
  }
  assert.equal(parseAgentSettingsProfile(unavailable).settings.model, 'removed-model')
  assert.equal(
    parseAgentSettingsProfile(unavailable).validation_error,
    'model_unavailable',
  )
  assert.equal(
    parseAgentSettingsProfile({
      ...profile,
      catalogue: { ...profile.catalogue, models: [] },
    }).catalogue.models.length,
    0,
  )
})
test('profile accepts the runtime catalogue limit of 256 models and rejects overflow', () => {
  const models = Array.from({ length: 256 }, (_, index) => ({
    ...profile.catalogue.models[0],
    id: `catalogue-model-${index}`,
  }))
  const bounded = { ...profile, catalogue: { ...profile.catalogue, models } }
  assert.equal(parseAgentSettingsProfile(bounded).catalogue.models.length, 256)
  assert.throws(() =>
    parseAgentSettingsProfile({
      ...bounded,
      catalogue: {
        ...bounded.catalogue,
        models: [...models, { ...models[0], id: 'catalogue-model-256' }],
      },
    }),
  )
})
test('preferred model must be a real catalogue identifier; model without effort does not invent an effort', () => {
  const astra = {
    ...profile,
    catalogue: {
      ...profile.catalogue,
      preferred_model_id: settings.model,
      astra_available: true,
      astra_reason: null,
    },
  }
  assert.equal(
    parseAgentSettingsProfile(astra).catalogue.preferred_model_id,
    settings.model,
  )
  assert.throws(() =>
    parseAgentSettingsProfile({
      ...astra,
      catalogue: { ...astra.catalogue, preferred_model_id: 'guessed-astra' },
    }),
  )
  assert.throws(() =>
    parseAgentSettingsProfile({
      ...astra,
      catalogue: { ...astra.catalogue, preferred_model_id: null },
    }),
  )
  const unsupported = {
    id: 'plain-model',
    label: 'Sans effort',
    reasoning_efforts: [],
    default_reasoning_effort: null,
  }
  assert.deepEqual(
    parseAgentSettingsProfile({
      ...profile,
      catalogue: { ...profile.catalogue, models: [unsupported] },
    }).catalogue.models[0],
    unsupported,
  )
})
test('profile rejects duplicate models/efforts, invalid defaults, secrets, unsafe tools and invalid bounds', () => {
  const model = profile.catalogue.models[0]
  for (const value of [
    { ...profile, token: 'synthetic-secret' },
    { ...profile, revision: -1 },
    { ...profile, catalogue: { ...profile.catalogue, models: [model, model] } },
    {
      ...profile,
      catalogue: {
        ...profile.catalogue,
        models: [{ ...model, reasoning_efforts: ['high', 'high'] }],
      },
    },
    {
      ...profile,
      catalogue: {
        ...profile.catalogue,
        models: [{ ...model, default_reasoning_effort: 'unsupported' }],
      },
    },
    { ...profile, capabilities: [] },
    { ...profile, capabilities: [...profile.capabilities, profile.capabilities[0]] },
    { ...profile, mcp: [{ name: 'write_everything', read_only: false }] },
    { ...profile, mcp: [profile.mcp[0], profile.mcp[0]] },
    { ...profile, bounds: { ...profile.bounds, mcp_concurrency: { min: 1, max: 5 } } },
    {
      ...profile,
      bounds: { ...profile.bounds, timeout_seconds: { min: 100, max: 30 } },
    },
  ])
    assert.throws(() => parseAgentSettingsProfile(value))
})
test('diagnostics distinguish chosen/effective and first event/text without changing tenant contract', () => {
  const chosen = { ...settings, model: 'chosen-catalogue-model' }
  const parsed = parseInternalDiagnostics([
    { ...diagnostic, chosen_settings: chosen },
  ])[0]
  assert.equal(parsed.chosen_settings.model, 'chosen-catalogue-model')
  assert.equal(parsed.snapshot.model, settings.model)
  assert.equal(parsed.timings.first_event_ms, 30)
  assert.equal(parsed.timings.first_text_ms, 50)
  assert.ok(
    parseInternalDiagnostics([{ ...diagnostic, chosen_settings: null, timings: null }]),
  )
  const { chosen_settings: _chosenSettings, timings: _timings, ...legacy } = diagnostic
  assert.deepEqual(parseDiagnostics([legacy])[0], legacy)
  assert.throws(() => parseDiagnostics([diagnostic]))
})
test('diagnostics reject private leakage, malformed timing values and invalid privacy', () => {
  for (const value of [
    { ...diagnostic, credentials: 'synthetic-secret' },
    { ...diagnostic, timings: { ...diagnostic.timings, first_text_ms: -1 } },
    { ...diagnostic, timings: { ...diagnostic.timings, worker_wait_ms: '30' } },
    {
      ...diagnostic,
      timings: { ...diagnostic.timings, request_received_at: 'yesterday' },
    },
    {
      ...diagnostic,
      timings: {
        ...diagnostic.timings,
        tools: [
          { tool: 'shell', phase: 'started', at_ms: 1, arguments: 'synthetic-secret' },
        ],
      },
    },
    { ...diagnostic, snapshot: { ...snapshot, privacy: 'public' } },
  ])
    assert.throws(() => parseInternalDiagnostics([value]))
})
test('settings client persists and resets with optimistic revision and authenticated internal routes', async () => {
  const original = globalThis.fetch,
    calls = [],
    controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json(profile)
  }
  try {
    const api = createAgentSettingsApi('https://api.example.test')
    assert.deepEqual(await api.load(controller.signal), profile)
    assert.deepEqual(await api.save(1, settings, controller.signal), profile)
    assert.deepEqual(await api.reset(1, controller.signal), profile)
    assert.deepEqual(
      calls.map((call) => [call.url, call.method]),
      [
        ['https://api.example.test/admin/operator-chat/internal/settings', 'GET'],
        ['https://api.example.test/admin/operator-chat/internal/settings', 'PUT'],
        [
          'https://api.example.test/admin/operator-chat/internal/settings/reset',
          'POST',
        ],
      ],
    )
    assert.deepEqual(JSON.parse(calls[1].body), { revision: 1, settings })
    assert.deepEqual(JSON.parse(calls[2].body), { revision: 1 })
    assert.ok(
      calls.every(
        (call) => call.credentials === 'include' && call.signal === controller.signal,
      ),
    )
  } finally {
    globalThis.fetch = original
  }
})
for (const status of [401, 409, 422, 503])
  test(`internal API sanitizes HTTP ${status} and never retries settings writes`, async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      return Response.json({ detail: 'synthetic-secret' }, { status })
    }
    try {
      await assert.rejects(
        createAgentSettingsApi('https://api.example.test').save(1, settings),
        (error) =>
          error instanceof ChatRequestError &&
          error.status === status &&
          !error.message.includes('synthetic-secret'),
      )
      assert.equal(calls, 1)
    } finally {
      globalThis.fetch = original
    }
  })
test('internal workspace uses server-resolved routes for conversation, cancel and memory without client scope URL', async () => {
  const original = globalThis.fetch,
    calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({})
  }
  try {
    const api = createChatWorkspaceApi('https://api.example.test', tenant, 'internal')
    await api.threads('', 'POST')
    await api.threads(`/${thread}/messages`, 'POST', undefined, 'Message synthétique')
    await api.threads(`/${thread}/cancel`, 'POST')
    await api.memory('', 'POST', {
      thread_id: thread,
      kind: 'summary',
      content: 'Synthétique',
    })
    await api.memory('/search?q=test')
    assert.ok(
      calls.every(
        (call) =>
          call.url.includes('/operator-chat/internal/') &&
          !call.url.includes(`/tenants/${tenant}`),
      ),
    )
    assert.deepEqual(JSON.parse(calls[1].body), { content: 'Message synthétique' })
    await createChatWorkspaceApi('https://api.example.test', tenant, 'tenant').threads(
      '',
    )
    assert.equal(
      calls.at(-1).url,
      `https://api.example.test/admin/operator-chat/tenants/${tenant}/threads`,
    )
  } finally {
    globalThis.fetch = original
  }
})
test('internal API without configured origin is explicitly unavailable', async () => {
  await assert.rejects(
    internalAssistantRequest(null, '/context'),
    (error) => error.status === 503,
  )
})

test('MCP timing projections accept bounded metrics and refuse status/provider/arguments extensions', () => {
  const call = { stage: 'mcp_tool_completed', at_ms: 60, queue_wait_ms: 2, execution_ms: 20, duration_ms: null, active: 2, queued: 0, calls: 2 }
  const value = { ...diagnostic, timings: { ...diagnostic.timings, mcp_calls: [call] } }
  assert.deepEqual(parseInternalDiagnostics([value])[0].timings.mcp_calls, [call])
  for (const invalid of [{ ...call, stage: 'raw_provider_response' }, { ...call, at_ms: -1 }, { ...call, execution_ms: 1_000_000_001 }, { ...call, status: 'secret' }, { ...call, provider: 'private.example.test' }, { ...call, arguments: 'synthetic-secret' }, { ...call, calls: undefined }]) assert.throws(() => parseInternalDiagnostics([{ ...value, timings: { ...value.timings, mcp_calls: [invalid] } }]))
  assert.throws(() => parseInternalDiagnostics([{ ...value, timings: { ...value.timings, mcp_calls: Array(257).fill(call) } }]))
})

test('tool timings cannot expose unknown native tool names or private provider labels', () => {
  for (const tool of ['raw_sdk_tool', 'private@example.test']) assert.throws(() => parseInternalDiagnostics([{ ...diagnostic, timings: { ...diagnostic.timings, tools: [{ tool, phase: 'started', at_ms: 1 }] } }]))
})
