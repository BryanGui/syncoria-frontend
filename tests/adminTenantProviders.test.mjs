import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import {
  createAdminTenantProvider,
  deleteAdminTenantProvider,
  fetchAdminTenantProviders,
  replaceAdminTenantProviderCredential,
  updateAdminTenantProvider,
  verifyAdminTenantProvider,
} from '../src/api/adminTenantProviders.ts'


const tenantId = '11111111-1111-4111-8111-111111111111'
const notionRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: tenantId,
  provider: 'notion',
  name: 'Notion recrutement',
  status: 'active',
  configuration: { workspace_reference: 'workspace-example' },
  credential_configured: true,
  created_at: '2026-08-13T08:00:00Z',
  updated_at: '2026-08-13T08:00:00Z',
  last_verified_at: null,
  last_verification_status: null,
  last_verification_http_status: null,
  last_verification_code: null,
  last_verification_message: null,
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

test('loads a tenant-scoped provider list and supports the empty state', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json([notionRecord])
  }
  assert.deepEqual(
    await fetchAdminTenantProviders('https://api.example.com', tenantId, undefined, request),
    { status: 'loaded', providers: [notionRecord] },
  )
  assert.equal(
    capturedUrl,
    `https://api.example.com/admin/tenants/${tenantId}/providers`,
  )
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')

  const emptyRequest = async () => Response.json([])
  assert.deepEqual(
    await fetchAdminTenantProviders(
      'https://api.example.com', tenantId, undefined, emptyRequest,
    ),
    { status: 'loaded', providers: [] },
  )
})

test('creates Notion and n8n using only their expected non-sensitive configuration', async () => {
  for (const input of [
    {
      provider: 'notion',
      name: 'Notion recrutement',
      configuration: { workspace_reference: 'workspace-example' },
    },
    {
      provider: 'n8n',
      name: 'n8n production',
      configuration: { base_url: 'https://automation.example.com' },
    },
  ]) {
    const syntheticSecret = randomBytes(24).toString('base64url')
    let capturedOptions
    const responseRecord = {
      ...notionRecord,
      provider: input.provider,
      name: input.name,
      configuration: input.configuration,
    }
    const request = async (_url, options) => {
      capturedOptions = options
      return Response.json(responseRecord, { status: 201 })
    }
    const result = await createAdminTenantProvider(
      'https://api.example.com',
      tenantId,
      { ...input, secret: syntheticSecret },
      request,
    )
    assert.equal(result.status, 'saved')
    assert.equal(capturedOptions.method, 'POST')
    assert.deepEqual(JSON.parse(capturedOptions.body), {
      ...input,
      secret: syntheticSecret,
    })
    assert.doesNotMatch(JSON.stringify(result), new RegExp(syntheticSecret))
  }
})

test('updates configuration and keeps the backend verification invalidation', async () => {
  let capturedOptions
  const invalidatedRecord = {
    ...notionRecord,
    configuration: { workspace_reference: 'workspace-updated' },
    updated_at: '2026-08-13T08:05:00Z',
  }
  const request = async (_url, options) => {
    capturedOptions = options
    return Response.json(invalidatedRecord)
  }
  const result = await updateAdminTenantProvider(
    'https://api.example.com',
    tenantId,
    notionRecord.id,
    {
      name: notionRecord.name,
      configuration: invalidatedRecord.configuration,
    },
    request,
  )
  assert.deepEqual(result, { status: 'saved', provider: invalidatedRecord })
  assert.equal(capturedOptions.method, 'PATCH')
  assert.equal(result.provider.last_verified_at, null)
  assert.equal(result.provider.last_verification_status, null)
})

test('replaces a credential without returning or logging the submitted secret', async () => {
  const syntheticSecret = randomBytes(24).toString('base64url')
  let capturedUrl
  let capturedOptions
  const { entries, logger } = createLoggerSpy()
  const rotatedRecord = {
    ...notionRecord,
    updated_at: '2026-08-13T08:10:00Z',
  }
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json(rotatedRecord)
  }
  const result = await replaceAdminTenantProviderCredential(
    'https://api.example.com',
    tenantId,
    notionRecord.id,
    syntheticSecret,
    request,
    logger,
  )
  assert.equal(
    capturedUrl,
    `https://api.example.com/admin/tenants/${tenantId}/providers/${notionRecord.id}/credential`,
  )
  assert.equal(capturedOptions.method, 'PUT')
  assert.deepEqual(JSON.parse(capturedOptions.body), { secret: syntheticSecret })
  assert.equal(result.status, 'saved')
  assert.equal(result.provider.id, notionRecord.id)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(syntheticSecret))
  assert.doesNotMatch(JSON.stringify(entries), new RegExp(syntheticSecret))
})

test('returns sanitized successful and failed verification results', async () => {
  for (const verification of [
    {
      status: 'ok',
      checked_at: '2026-08-13T08:12:00Z',
      provider: 'notion',
      http_status: 200,
      code: null,
      message: 'Authentification confirmée.',
    },
    {
      status: 'error',
      checked_at: '2026-08-13T08:13:00Z',
      provider: 'notion',
      http_status: 401,
      code: 'authentication_refused',
      message: 'Credential refusé.',
    },
  ]) {
    let capturedOptions
    const request = async (_url, options) => {
      capturedOptions = options
      return Response.json({ ...verification, ignored_provider_body: 'not retained' })
    }
    const result = await verifyAdminTenantProvider(
      'https://api.example.com', tenantId, notionRecord.id, request,
    )
    assert.deepEqual(result, { status: 'verified', verification })
    assert.equal(capturedOptions.method, 'POST')
    assert.doesNotMatch(JSON.stringify(result), /ignored_provider_body|not retained/)
  }
})

test('disables a provider through the tenant-scoped DELETE endpoint', async () => {
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return new Response(null, { status: 204 })
  }
  assert.deepEqual(
    await deleteAdminTenantProvider(
      'https://api.example.com', tenantId, notionRecord.id, request,
    ),
    { status: 'deleted' },
  )
  assert.equal(
    capturedUrl,
    `https://api.example.com/admin/tenants/${tenantId}/providers/${notionRecord.id}`,
  )
  assert.equal(capturedOptions.method, 'DELETE')
})

test('maps backend errors without retaining response details', async () => {
  for (const [httpStatus, expectedStatus] of [
    [401, 'unauthenticated'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'invalid'],
    [503, 'error'],
  ]) {
    const { entries, logger } = createLoggerSpy()
    const request = async () => Response.json(
      { detail: 'sensitive upstream detail' },
      { status: httpStatus },
    )
    const result = await updateAdminTenantProvider(
      'https://api.example.com', tenantId, notionRecord.id, { name: 'Notion' },
      request, logger,
    )
    assert.deepEqual(result, { status: expectedStatus })
    assert.doesNotMatch(JSON.stringify(entries), /sensitive upstream detail/)
  }
})

test('allowlists response fields and never imports a credential value', async () => {
  const syntheticSecret = randomBytes(24).toString('base64url')
  const request = async () => Response.json([{
    ...notionRecord,
    credential: syntheticSecret,
    provider_response_body: 'ignored',
  }])
  const result = await fetchAdminTenantProviders(
    'https://api.example.com', tenantId, undefined, request,
  )
  assert.equal(result.status, 'loaded')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(syntheticSecret))
  assert.doesNotMatch(JSON.stringify(result), /provider_response_body|ignored/)
})
