import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activateAdminIntegration,
  addAdminIntegrationDdlFromAudit,
  cloneAdminIntegration,
  createAdminIntegration,
  deleteAdminIntegrationDdl,
  deleteAdminIntegrationIngestion,
  fetchAdminIntegration,
  fetchAdminIntegrationDdls,
  fetchAdminIntegrationIngestionCandidates,
  fetchAdminIntegrationIngestions,
  fetchAdminIntegrationProviders,
  fetchAdminIntegrations,
  getDdlValidationError,
  importAdminIntegrationDdl,
  MAX_DDL_BYTES,
  patchAdminIntegration,
  renameAdminIntegrationDdl,
  replaceAdminIntegrationProviders,
  selectAdminIntegrationDdl,
  selectAdminIntegrationIngestion,
} from '../src/api/adminIntegrations.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const integrationId = '22222222-2222-4222-8222-222222222222'
const ddlId = '33333333-3333-4333-8333-333333333333'
const providerRecordId = '44444444-4444-4444-8444-444444444444'
const correlationId = '55555555-5555-4555-8555-555555555555'
const secondProviderRecordId = '66666666-6666-4666-8666-666666666666'
const ddl = {
  id: ddlId,
  title: 'Novalia global v1',
  kind: 'imported',
  source_report_id: null,
  source_filename: 'novalia.sql',
  created_at: '2026-09-17T10:00:00Z',
  is_selected: true,
  source_provider: null,
  source_audit_title: null,
  source_report_date: null,
}

function integration(overrides = {}) {
  return {
    id: integrationId,
    tenant_id: tenantId,
    version_number: 1,
    display_name: 'Novalia Talents v1',
    namespace_key: 'v1',
    status: 'active',
    based_on_integration_id: null,
    design_note: null,
    selected_ddl_id: ddlId,
    created_at: '2026-09-17T10:00:00Z',
    updated_at: '2026-09-17T10:00:00Z',
    ...overrides,
  }
}

function ingestion(overrides = {}) {
  return {
    tenant_provider_record_id: providerRecordId,
    provider: 'notion',
    correlation_id: correlationId,
    status: 'completed',
    archived: false,
    started_at: '2026-09-17T09:00:00Z',
    completed_at: '2026-09-17T09:01:00Z',
    items_received: 90,
    items_inserted: 88,
    items_duplicate: 2,
    created_at: '2026-09-17T09:02:00Z',
    ...overrides,
  }
}

test('uses the tenant-scoped version contract with credentials', async () => {
  const calls = []
  const request = async (url, options) => {
    calls.push({ url, options })
    return Response.json(url.endsWith(integrationId) ? integration() : [integration()])
  }
  const list = await fetchAdminIntegrations('https://api.example.com', tenantId, undefined, request)
  const detail = await fetchAdminIntegration('https://api.example.com', tenantId, integrationId, undefined, request)
  assert.equal(list.status, 'loaded')
  assert.equal(detail.status, 'loaded')
  assert.equal(calls[0].url, `https://api.example.com/admin/tenants/${tenantId}/integrations`)
  assert.equal(calls[1].url, `https://api.example.com/admin/tenants/${tenantId}/integrations/${integrationId}`)
  assert.equal(calls[1].options.credentials, 'include')
})

test('creates, patches, clones and activates versions without local copying', async () => {
  const calls = []
  const request = async (url, options) => {
    calls.push({ url, options })
    return Response.json(integration({ status: url.endsWith('/activate') ? 'active' : 'draft' }))
  }
  assert.equal((await createAdminIntegration('https://api.example.com', tenantId, undefined, undefined, request)).status, 'loaded')
  assert.equal((await patchAdminIntegration('https://api.example.com', tenantId, integrationId, { display_name: 'v2', design_note: 'Note' }, undefined, request)).status, 'loaded')
  assert.equal((await cloneAdminIntegration('https://api.example.com', tenantId, integrationId, undefined, undefined, request)).status, 'loaded')
  assert.equal((await activateAdminIntegration('https://api.example.com', tenantId, integrationId, undefined, request)).status, 'loaded')
  assert.deepEqual(JSON.parse(calls[0].options.body), {})
  assert.deepEqual(JSON.parse(calls[1].options.body), { display_name: 'v2', design_note: 'Note' })
  assert.equal(calls[2].url, `https://api.example.com/admin/tenants/${tenantId}/integrations/${integrationId}/clone`)
  assert.equal(calls[3].options.method, 'PUT')
})

test('reads and atomically replaces the exact provider-record set', async () => {
  const calls = []
  const providers = [
    {
      tenant_provider_record_id: providerRecordId,
      provider: 'notion',
      name: 'Notion RH',
      created_at: '2026-09-18T10:00:00Z',
    },
    {
      tenant_provider_record_id: secondProviderRecordId,
      provider: 'google_sheets',
      name: 'Sheets candidats',
      created_at: '2026-09-18T10:00:00Z',
    },
  ]
  const request = async (url, options) => {
    calls.push({ url, options })
    return Response.json(providers)
  }
  const loaded = await fetchAdminIntegrationProviders(
    'https://api.example.com', tenantId, integrationId, undefined, request,
  )
  const replaced = await replaceAdminIntegrationProviders(
    'https://api.example.com', tenantId, integrationId,
    [providerRecordId, secondProviderRecordId], undefined, request,
  )
  assert.equal(loaded.status, 'loaded')
  assert.equal(replaced.status, 'loaded')
  assert.equal(calls[0].url, `https://api.example.com/admin/tenants/${tenantId}/integrations/${integrationId}/providers`)
  assert.equal(calls[1].options.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    tenant_provider_record_ids: [providerRecordId, secondProviderRecordId],
  })
  assert.deepEqual(await replaceAdminIntegrationProviders(
    'https://api.example.com', tenantId, integrationId,
    [providerRecordId, providerRecordId], undefined,
    () => { throw new Error('must not request') },
  ), { status: 'invalid' })
})

test('keeps source and imported DDL in one version-scoped library', async () => {
  const calls = []
  const source = { ...ddl, id: '66666666-6666-4666-8666-666666666666', kind: 'source', source_report_id: 'audit-notion-2026-09-17', source_filename: null, source_provider: 'notion', source_audit_title: 'Audit Notion', source_report_date: '2026-09-17', is_selected: false }
  const request = async (url, options) => {
    calls.push({ url, options })
    if (options.method === 'GET' && url.endsWith('/ddls')) return Response.json([source, ddl])
    if (url.endsWith(`/ddls/${ddlId}/selection`)) return Response.json({ ...ddl, ddl_content: 'CREATE TABLE example (id integer);' })
    return Response.json(ddl)
  }
  const list = await fetchAdminIntegrationDdls('https://api.example.com', tenantId, integrationId, undefined, request)
  const added = await addAdminIntegrationDdlFromAudit('https://api.example.com', tenantId, integrationId, 'audit-notion-2026-09-17', undefined, request)
  const imported = await importAdminIntegrationDdl('https://api.example.com', tenantId, integrationId, 'Experiment', 'CREATE TABLE experiment (id integer);', undefined, request)
  const selected = await selectAdminIntegrationDdl('https://api.example.com', tenantId, integrationId, ddlId, undefined, request)
  assert.equal(list.status, 'loaded')
  assert.equal(list.ddls[0].kind, 'source')
  assert.equal(added.status, 'loaded')
  assert.equal(imported.status, 'loaded')
  assert.equal(selected.status, 'loaded')
  assert.deepEqual(JSON.parse(calls[1].options.body), { source_report_id: 'audit-notion-2026-09-17' })
  assert.deepEqual(JSON.parse(calls[2].options.body), { title: 'Experiment', content: 'CREATE TABLE experiment (id integer);' })
  assert.equal(calls[3].url, `https://api.example.com/admin/tenants/${tenantId}/integrations/${integrationId}/ddls/${ddlId}/selection`)
})

test('renames and deletes imported DDLs through the canonical artifact route', async () => {
  const calls = []
  const renamed = await renameAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId, ddlId, ' renamed.sql ', undefined,
    async (url, options) => {
      calls.push({ url, options })
      return Response.json({ ...ddl, title: 'renamed.sql' })
    },
  )
  const deleted = await deleteAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId, ddlId, undefined,
    async (url, options) => {
      calls.push({ url, options })
      return new Response(null, { status: 204 })
    },
  )

  assert.equal(renamed.status, 'loaded')
  assert.equal(renamed.ddl.title, 'renamed.sql')
  assert.equal(deleted.status, 'deleted')
  assert.equal(calls[0].url, `https://api.example.com/admin/tenants/${tenantId}/integrations/${integrationId}/ddls/${ddlId}`)
  assert.equal(calls[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[0].options.body), { title: 'renamed.sql' })
  assert.equal(calls[1].options.method, 'DELETE')
})

test('preserves the exact upload filename as the imported DDL title', async () => {
  let body
  const result = await importAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId,
    'novalia-modèle-v2.sql', 'CREATE TABLE exact_filename (id integer);', undefined,
    async (_url, options) => {
      body = JSON.parse(options.body)
      return Response.json({ ...ddl, title: 'novalia-modèle-v2.sql' })
    },
  )

  assert.equal(result.status, 'loaded')
  assert.equal(body.title, 'novalia-modèle-v2.sql')
})

test('replaces one version ingestion reference and never deletes the raw operation', async () => {
  let captured
  const result = await selectAdminIntegrationIngestion(
    'https://api.example.com', tenantId, integrationId, providerRecordId, correlationId, undefined,
    async (url, options) => {
      captured = { url, options }
      return Response.json(ingestion())
    },
  )
  assert.equal(result.status, 'loaded')
  assert.deepEqual(JSON.parse(captured.options.body), { correlation_id: correlationId })
  assert.equal(captured.options.method, 'PUT')
  assert.equal((await deleteAdminIntegrationIngestion(
    'https://api.example.com', tenantId, integrationId, providerRecordId, undefined,
    async (url, options) => {
      captured = { url, options }
      return new Response(null, { status: 204 })
    },
  )).status, 'deleted')
  assert.equal(captured.options.method, 'DELETE')
})

test('loads selected references and candidates independently', async () => {
  const request = async (url) => Response.json(url.endsWith('/ingestion-candidates') ? [ingestion({ correlation_id: '77777777-7777-4777-8777-777777777777' })] : [ingestion()])
  const selected = await fetchAdminIntegrationIngestions('https://api.example.com', tenantId, integrationId, undefined, request)
  const candidates = await fetchAdminIntegrationIngestionCandidates('https://api.example.com', tenantId, integrationId, undefined, request)
  assert.equal(selected.status, 'loaded')
  assert.equal(candidates.status, 'loaded')
  assert.notEqual(selected.ingestions[0].correlation_id, candidates.ingestions[0].correlation_id)
})

test('validates files and never exposes backend or SQL details', async () => {
  assert.equal(getDdlValidationError(' \n\t'), 'empty')
  assert.equal(getDdlValidationError('SELECT\u0000 1'), 'invalid')
  assert.equal(getDdlValidationError('x'.repeat(MAX_DDL_BYTES + 1)), 'too_large')
  const result = await fetchAdminIntegration(
    'https://api.example.com', tenantId, integrationId, undefined,
    async () => Response.json({ detail: 'sensitive SQL or backend detail' }, { status: 503 }),
  )
  assert.deepEqual(result, { status: 'error' })
  assert.doesNotMatch(JSON.stringify(result), /sensitive SQL|backend detail/)
})

test('reads only sanitized integration codes from the FastAPI detail envelope', async () => {
  const conflict = (code) => async () => Response.json({
    detail: { code, message: 'Technical backend message that must stay hidden.' },
  }, { status: 409 })
  const title = await importAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId, 'Duplicate title',
    'CREATE TABLE duplicate_title (id integer);', undefined, conflict('duplicate_title'),
  )
  const content = await importAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId, 'Duplicate content',
    'CREATE TABLE duplicate_content (id integer);', undefined, conflict('duplicate_content'),
  )
  const audit = await addAdminIntegrationDdlFromAudit(
    'https://api.example.com', tenantId, integrationId, 'audit-notion-2026-09-17',
    undefined, conflict('duplicate_audit'),
  )
  const invalid = await createAdminIntegration(
    'https://api.example.com', tenantId, undefined, undefined,
    async () => Response.json({ detail: { code: 'invalid', message: 'Invalid integration request.' } }, { status: 422 }),
  )
  const tooLarge = await importAdminIntegrationDdl(
    'https://api.example.com', tenantId, integrationId, 'Too large',
    'CREATE TABLE too_large (id integer);', undefined,
    async () => Response.json({ detail: { code: 'too_large', message: 'Invalid integration request.' } }, { status: 413 }),
  )
  const genericConflict = await activateAdminIntegration(
    'https://api.example.com', tenantId, integrationId, undefined,
    async () => Response.json({ detail: { code: 'conflict', message: 'Current state is private.' } }, { status: 409 }),
  )
  const notFound = await fetchAdminIntegration(
    'https://api.example.com', tenantId, integrationId, undefined,
    async () => Response.json({ detail: { code: 'not_found', message: 'Private identifier.' } }, { status: 404 }),
  )

  assert.deepEqual(title, { status: 'conflict', code: 'duplicate_title' })
  assert.deepEqual(content, { status: 'conflict', code: 'duplicate_content' })
  assert.deepEqual(audit, { status: 'conflict', code: 'duplicate_audit' })
  assert.deepEqual(invalid, { status: 'invalid', code: 'invalid' })
  assert.deepEqual(tooLarge, { status: 'invalid', code: 'too_large' })
  assert.deepEqual(genericConflict, { status: 'conflict', code: 'conflict' })
  assert.deepEqual(notFound, { status: 'not_found', code: 'not_found' })
  assert.doesNotMatch(
    JSON.stringify([title, content, audit, invalid, tooLarge, genericConflict, notFound]),
    /Technical backend|Invalid integration request|Current state is private|Private identifier/,
  )
})
