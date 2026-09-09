import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fetchAdminTenantIngestion,
  fetchLatestAdminTenantIngestion,
  launchAdminTenantIngestion,
  supportsInitialIngestionProvider,
} from '../src/api/adminTenantIngestions.ts'


const tenantId = '11111111-1111-4111-8111-111111111111'
const providerRecordId = '22222222-2222-4222-8222-222222222222'
const correlationId = '33333333-3333-4333-8333-333333333333'
const source = {
  external_source_id: '44444444-4444-4444-8444-444444444444',
  source_name: 'Source test',
  observed_record_count: 10,
  run_id: '55555555-5555-4555-8555-555555555555',
  status: 'running',
  started_at: '2026-09-09T08:00:00Z',
  completed_at: null,
  items_received: 8,
  items_processed: 8,
  items_inserted: 6,
  items_duplicate: 2,
  items_rejected: 0,
  items_not_attempted: 0,
  error_code: null,
}
const operation = {
  tenant_id: tenantId,
  tenant_provider_record_id: providerRecordId,
  provider: 'notion',
  correlation_id: correlationId,
  status: 'running',
  started_at: '2026-09-09T08:00:00Z',
  completed_at: null,
  items_expected: 10,
  items_received: 8,
  items_processed: 8,
  items_inserted: 6,
  items_duplicate: 2,
  items_rejected: 0,
  items_not_attempted: 0,
  sources_total: 1,
  sources_completed: 0,
  sources_in_progress: 1,
  sources_error: 0,
  sources: [source],
}

test('loads the latest tenant-scoped ingestion with the admin session cookie', async () => {
  const signal = new AbortController().signal
  let capturedUrl
  let capturedOptions
  const request = async (url, options) => {
    capturedUrl = url
    capturedOptions = options
    return Response.json({ ...operation, ignored: 'not retained' })
  }
  assert.deepEqual(
    await fetchLatestAdminTenantIngestion('https://api.example.com', tenantId, providerRecordId, signal, request),
    { status: 'loaded', operation },
  )
  assert.equal(capturedUrl, `https://api.example.com/admin/tenants/${tenantId}/providers/${providerRecordId}/ingestions/latest`)
  assert.equal(capturedOptions.method, 'GET')
  assert.equal(capturedOptions.credentials, 'include')
  assert.equal(capturedOptions.signal, signal)
})

test('treats a missing latest operation as an empty state and preserves session failures', async () => {
  for (const [httpStatus, status] of [[404, 'not_found'], [401, 'unauthenticated'], [503, 'error']]) {
    assert.deepEqual(
      await fetchLatestAdminTenantIngestion(
        'https://api.example.com', tenantId, providerRecordId, undefined,
        async () => Response.json({ detail: 'sensitive backend detail' }, { status: httpStatus }),
      ),
      { status },
    )
  }
})

test('launches without client-side source identifiers and follows the returned correlation', async () => {
  let launchOptions
  const launch = await launchAdminTenantIngestion(
    'https://api.example.com', tenantId, providerRecordId, 'notion', undefined,
    async (_url, options) => {
      launchOptions = options
      return Response.json(operation, { status: 202 })
    },
  )
  assert.deepEqual(launch, { status: 'loaded', operation })
  assert.equal(launchOptions.method, 'POST')
  assert.equal('body' in launchOptions, false)

  let statusUrl
  await fetchAdminTenantIngestion(
    'https://api.example.com', tenantId, providerRecordId, correlationId, undefined,
    async (url) => {
      statusUrl = url
      return Response.json(operation)
    },
  )
  assert.equal(statusUrl, `https://api.example.com/admin/tenants/${tenantId}/providers/${providerRecordId}/ingestions/${correlationId}`)
})

test('refuses unsupported providers before any launch POST is sent', async () => {
  let requestCount = 0
  const result = await launchAdminTenantIngestion(
    'https://api.example.com', tenantId, providerRecordId, 'n8n', undefined,
    async () => {
      requestCount += 1
      return Response.json(operation, { status: 202 })
    },
  )
  assert.equal(supportsInitialIngestionProvider('notion'), true)
  assert.equal(supportsInitialIngestionProvider('n8n'), false)
  assert.deepEqual(result, { status: 'unsupported' })
  assert.equal(requestCount, 0)
})

test('allowlists ingestion fields and rejects raw or inconsistent payloads', async () => {
  const secret = 'must-never-appear'
  const accepted = await fetchLatestAdminTenantIngestion(
    'https://api.example.com', tenantId, providerRecordId, undefined,
    async () => Response.json({
      ...operation,
      credential: secret,
      raw_payload: { secret },
      sources: [{ ...source, provenance: { secret } }],
    }),
  )
  assert.equal(accepted.status, 'loaded')
  assert.doesNotMatch(JSON.stringify(accepted), new RegExp(secret))
  assert.doesNotMatch(JSON.stringify(accepted), /raw_payload|provenance|credential/)

  for (const payload of [
    { ...operation, items_processed: -1 },
    { ...operation, tenant_id: 'other-tenant' },
    { ...operation, sources_total: 2 },
    { ...operation, sources: [{ ...source, observed_record_count: -1 }] },
  ]) {
    assert.deepEqual(
      await fetchLatestAdminTenantIngestion('https://api.example.com', tenantId, providerRecordId, undefined, async () => Response.json(payload)),
      { status: 'error' },
    )
  }
})
