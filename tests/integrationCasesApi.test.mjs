import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import {
  addIntegrationCaseJsonInput,
  configureIntegrationCaseCredential,
  createIntegrationCase,
  fetchIntegrationCase,
  fetchIntegrationCases,
} from '../src/api/integrationCases.ts'


const rawIntegrationCase = {
  id: '33333333-3333-4333-8333-333333333333',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  tenant_name: 'Example tenant',
  source_system: 'notion',
  source_reference: null,
  objective: 'Import selected business records',
  instructions: null,
  environment: 'sandbox',
  status: 'draft',
  credential: { configured: false, id: null, name: null },
  json_input_count: 0,
  json_inputs: [],
  created_at: '2026-08-12T13:00:00Z',
  updated_at: '2026-08-12T13:00:00Z',
}

const integrationCase = {
  id: rawIntegrationCase.id,
  tenantId: rawIntegrationCase.tenant_id,
  tenantName: rawIntegrationCase.tenant_name,
  sourceSystem: rawIntegrationCase.source_system,
  sourceReference: null,
  objective: rawIntegrationCase.objective,
  instructions: null,
  environment: 'sandbox',
  status: 'draft',
  credential: { configured: false, id: null, name: null },
  jsonInputCount: 0,
  jsonInputs: [],
  createdAt: rawIntegrationCase.created_at,
  updatedAt: rawIntegrationCase.updated_at,
}

function createLoggerSpy() {
  const entries = []
  return {
    entries,
    logger: {
      info: (message, context) => entries.push({ message, context }),
      warning: (message, context) => entries.push({ message, context }),
      error: (message, context) => entries.push({ message, context }),
    },
  }
}

test('loads the real integration list and supports an empty list', async () => {
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json([rawIntegrationCase])
  }
  assert.deepEqual(
    await fetchIntegrationCases('https://api.example.com', undefined, request),
    { status: 'loaded', integrationCases: [integrationCase] },
  )
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')

  const emptyRequest = async () => Response.json([])
  assert.deepEqual(
    await fetchIntegrationCases('https://api.example.com', undefined, emptyRequest),
    { status: 'loaded', integrationCases: [] },
  )
})

test('loads a persisted integration detail after navigation or reload', async () => {
  let capturedUrl
  const request = async (url) => {
    capturedUrl = url
    return Response.json(rawIntegrationCase)
  }
  assert.deepEqual(
    await fetchIntegrationCase(
      'https://api.example.com',
      rawIntegrationCase.id,
      undefined,
      request,
    ),
    { status: 'loaded', integrationCase },
  )
  assert.equal(
    capturedUrl,
    `https://api.example.com/admin/integration-cases/${rawIntegrationCase.id}`,
  )
})

test('creates a sandbox draft with the real selected tenant', async () => {
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json(rawIntegrationCase, { status: 201 })
  }
  const result = await createIntegrationCase(
    'https://api.example.com',
    {
      tenantId: rawIntegrationCase.tenant_id,
      sourceSystem: 'notion',
      sourceReference: '',
      objective: rawIntegrationCase.objective,
      instructions: '',
      environment: 'sandbox',
    },
    request,
  )
  assert.deepEqual(result, { status: 'loaded', integrationCase })
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    tenant_id: rawIntegrationCase.tenant_id,
    source_system: 'notion',
    source_reference: null,
    objective: rawIntegrationCase.objective,
    instructions: null,
    environment: 'sandbox',
  })
})

test('maps validation, missing records and expired sessions without API detail leakage', async () => {
  for (const [httpStatus, expectedStatus] of [
    [401, 'unauthenticated'],
    [404, 'not_found'],
    [422, 'invalid'],
    [503, 'error'],
  ]) {
    const request = async () => Response.json(
      { detail: 'internal database detail' },
      { status: httpStatus },
    )
    const { entries, logger } = createLoggerSpy()
    const result = await fetchIntegrationCase(
      'https://api.example.com',
      rawIntegrationCase.id,
      undefined,
      request,
      logger,
    )
    assert.deepEqual(result, { status: expectedStatus })
    assert.doesNotMatch(JSON.stringify(entries), /internal database detail/)
  }
})

test('submits a credential once and never places it in returned state or logs', async () => {
  const plaintext = randomBytes(24).toString('base64url')
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json({
      ...rawIntegrationCase,
      credential: {
        configured: true,
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Provider credential',
      },
    })
  }
  const { entries, logger } = createLoggerSpy()
  const result = await configureIntegrationCaseCredential(
    'https://api.example.com',
    rawIntegrationCase.id,
    { name: 'Provider credential', secret: plaintext },
    request,
    logger,
  )
  assert.equal(JSON.parse(capturedOptions.body).secret, plaintext)
  assert.equal(result.status, 'loaded')
  assert.equal(result.integrationCase.credential.configured, true)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(plaintext))
  assert.doesNotMatch(JSON.stringify(entries), new RegExp(plaintext))
})

test('uploads parsed JSON and keeps only file metadata in returned state', async () => {
  let capturedOptions
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json({
      ...rawIntegrationCase,
      json_input_count: 1,
      json_inputs: [{
        id: '55555555-5555-4555-8555-555555555555',
        filename: 'context.json',
        created_at: '2026-08-12T13:01:00Z',
      }],
    }, { status: 201 })
  }
  const result = await addIntegrationCaseJsonInput(
    'https://api.example.com',
    rawIntegrationCase.id,
    { filename: 'context.json', payload: { records: [] } },
    request,
  )
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    filename: 'context.json',
    payload: { records: [] },
  })
  assert.equal(result.status, 'loaded')
  assert.equal(result.integrationCase.jsonInputs[0].filename, 'context.json')
  assert.doesNotMatch(JSON.stringify(result.integrationCase.jsonInputs), /records/)
})
