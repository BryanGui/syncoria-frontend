import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fetchAdminTenantProviderAudit,
  fetchLatestAdminTenantProviderAudit,
  launchAdminTenantProviderAudit,
  parseAdminProviderAuditResponse,
} from '../src/api/adminTenantAudits.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const providerRecordId = '22222222-2222-4222-8222-222222222222'
const correlationId = '33333333-3333-4333-8333-333333333333'

function operation(status = 'pending') {
  const phase = status === 'pending' ? 'preparing' : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'collecting'
  return {
    tenant_id: tenantId,
    tenant_provider_record_id: providerRecordId,
    provider: 'notion',
    correlation_id: correlationId,
    status,
    codex_thread_id: status === 'pending' ? null : 'thread-1',
    created_at: '2026-09-11T10:00:00Z',
    started_at: status === 'pending' ? null : '2026-09-11T10:00:01Z',
    completed_at: status === 'completed' || status === 'failed' ? '2026-09-11T10:00:05Z' : null,
    error_code: status === 'failed' ? 'audit_failed' : null,
    report_id: status === 'completed' ? 'audit-notion-2026-09-11' : null,
    sources_total: 3,
    sources_retained: 2,
    sources_excluded: 1,
    sources_pending: 0,
    records_retained: 7,
    decisions_required: 0,
    phase,
    progress_current: phase === 'collecting' ? 2 : null,
    progress_total: phase === 'collecting' ? 3 : null,
    progress_unit: phase === 'collecting' ? 'source' : null,
  }
}

test('strictly parses every backend audit state and rejects malformed payloads', () => {
  for (const status of ['pending', 'running', 'completed', 'failed']) {
    assert.equal(parseAdminProviderAuditResponse(operation(status)).status, status)
  }
  for (const phase of ['preparing', 'collecting', 'analyzing', 'generating_report', 'publishing', 'completed', 'failed']) {
    const parsed = parseAdminProviderAuditResponse({
      ...operation(phase === 'completed' ? 'completed' : phase === 'failed' ? 'failed' : 'running'),
      phase,
      progress_current: phase === 'collecting' ? 2 : null,
      progress_total: phase === 'collecting' ? 3 : null,
      progress_unit: phase === 'collecting' ? 'source' : null,
    })
    assert.equal(parsed?.phase, phase)
  }
  for (const progress of [
    { progress_current: 1, progress_total: null, progress_unit: null },
    { progress_current: null, progress_total: 3, progress_unit: 'source' },
    { progress_current: null, progress_total: null, progress_unit: 'item' },
    { progress_current: 2, progress_total: 3, progress_unit: 'source' },
  ]) {
    const parsed = parseAdminProviderAuditResponse({
      ...operation('running'),
      ...progress,
    })
    assert.deepEqual(
      parsed && {
        progress_current: parsed.progress_current,
        progress_total: parsed.progress_total,
        progress_unit: parsed.progress_unit,
      },
      progress,
    )
  }
  for (const invalid of [
    { ...operation(), provider: 'n8n' },
    { ...operation(), sources_total: 4 },
    { ...operation(), created_at: 'not-a-date' },
    { ...operation(), unexpected: 'payload' },
    { ...operation(), secret: 'must-not-enter-client-state' },
    { ...operation(), correlation_id: '../other' },
    { ...operation(), phase: 'unknown' },
    { ...operation(), progress_current: -1 },
    { ...operation(), progress_total: -1 },
    { ...operation(), progress_current: 4, progress_total: 3 },
    { ...operation(), progress_unit: 'percent' },
  ]) {
    assert.equal(parseAdminProviderAuditResponse(invalid), null)
  }
})

test('launches the tenant-scoped audit with the admin cookie and validates its response', async () => {
  const signal = new AbortController().signal
  let captured
  const request = async (url, options) => {
    captured = { url, options }
    return Response.json(operation('pending'), { status: 202 })
  }
  const result = await launchAdminTenantProviderAudit(
    'https://api.example.com', tenantId, providerRecordId, signal, request,
  )
  assert.equal(result.status, 'loaded')
  assert.equal(captured.url, 'https://api.example.com/admin/tenants/' + tenantId + '/providers/' + providerRecordId + '/audits')
  assert.equal(captured.options.method, 'POST')
  assert.equal(captured.options.credentials, 'include')
  assert.equal(captured.options.signal, signal)
})

test('maps auth, latest-not-found, conflict, invalid and generic HTTP failures', async () => {
  const responses = [
    [401, 'unauthenticated'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'invalid'],
    [503, 'error'],
  ]
  for (const [status, expected] of responses) {
    const result = await launchAdminTenantProviderAudit(
      'https://api.example.com', tenantId, providerRecordId, undefined,
      async () => Response.json({ detail: 'internal provider payload' }, { status }),
    )
    assert.equal(result.status, expected)
  }
  const latest = await fetchLatestAdminTenantProviderAudit(
    'https://api.example.com', tenantId, providerRecordId, undefined,
    async () => Response.json({}, { status: 404 }),
  )
  assert.deepEqual(latest, { status: 'not_found' })
})

test('fetches an operation by correlation id and rejects unbounded identifiers', async () => {
  let requestedUrl
  const result = await fetchAdminTenantProviderAudit(
    'https://api.example.com', tenantId, providerRecordId, correlationId, undefined,
    async (url, options) => {
      requestedUrl = url
      assert.equal(options.method, 'GET')
      return Response.json(operation('running'))
    },
  )
  assert.equal(result.status, 'loaded')
  assert.equal(requestedUrl, 'https://api.example.com/admin/tenants/' + tenantId + '/providers/' + providerRecordId + '/audits/' + correlationId)
  assert.deepEqual(
    await fetchAdminTenantProviderAudit('https://api.example.com', tenantId, providerRecordId, '../other', undefined, () => {
      throw new Error('must not request')
    }),
    { status: 'error' },
  )
})
