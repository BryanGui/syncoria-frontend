import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAdminIntegrationWorkspaceFromAudit,
  createAdminIntegrationWorkspaceFromUpload,
  fetchAdminIntegrationWorkspace,
  fetchAdminIntegrationWorkspaceAuditSources,
  fetchAdminIntegrationWorkspaces,
  getDdlValidationError,
  MAX_DDL_BYTES,
  replaceAdminIntegrationWorkspaceWorkingDdl,
} from '../src/api/adminIntegrationWorkspaces.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const sourceDdl = '-- source\nCREATE TABLE source_table (id integer);\n'
const targetDdl = '-- target\nCREATE TABLE target_table (id integer);\n'

function workspace(overrides = {}) {
  return {
    id: workspaceId,
    tenant_id: tenantId,
    source_type: 'upload',
    source_report_id: null,
    source_filename: 'source.sql',
    source_ddl: sourceDdl,
    working_ddl: sourceDdl,
    version: 1,
    status: 'draft',
    created_at: '2026-09-16T10:00:00Z',
    updated_at: '2026-09-16T10:00:00Z',
    ...overrides,
  }
}

test('loads tenant-scoped workspaces and details with encoded IDs and cookies', async () => {
  const encodedTenant = '11111111-1111-4111-8111-111111111111'
  let calls = []
  const request = async (url, options) => {
    calls.push({ url, options })
    return Response.json(url.endsWith(workspaceId) ? workspace() : [workspace()])
  }
  const list = await fetchAdminIntegrationWorkspaces('https://api.example.com', encodedTenant, undefined, request)
  const detail = await fetchAdminIntegrationWorkspace('https://api.example.com', tenantId, workspaceId, undefined, request)
  assert.equal(list.status, 'loaded')
  assert.equal(detail.status, 'loaded')
  assert.equal(calls[0].url, `https://api.example.com/admin/tenants/${tenantId}/integration-workspaces`)
  assert.equal(calls[1].url, `https://api.example.com/admin/tenants/${tenantId}/integration-workspaces/${workspaceId}`)
  assert.equal(calls[1].options.credentials, 'include')
  assert.equal(calls[1].options.method, 'GET')
})

test('loads published audit sources and creates workspaces from audit or upload', async () => {
  const source = { report_id: 'audit-notion-2026-09-16', provider: 'notion', title: 'Audit Notion', report_date: '2026-09-16' }
  let captured = []
  const request = async (url, options) => {
    captured.push({ url, options })
    if (url.endsWith('/audit-sources')) return Response.json([source])
    return Response.json(workspace({ source_type: 'audit', source_report_id: source.report_id, source_filename: null }))
  }
  const sources = await fetchAdminIntegrationWorkspaceAuditSources('https://api.example.com', tenantId, undefined, request)
  const fromAudit = await createAdminIntegrationWorkspaceFromAudit('https://api.example.com', tenantId, source.report_id, undefined, request)
  const fromUpload = await createAdminIntegrationWorkspaceFromUpload('https://api.example.com', tenantId, targetDdl, 'target.sql', undefined, request)
  assert.deepEqual(sources, { status: 'loaded', sources: [source] })
  assert.equal(fromAudit.status, 'loaded')
  assert.equal(fromUpload.status, 'loaded')
  assert.deepEqual(JSON.parse(captured[1].options.body), { source_report_id: source.report_id })
  assert.deepEqual(JSON.parse(captured[2].options.body), { content: targetDdl, source_filename: 'target.sql' })
  assert.equal(captured[1].options.credentials, 'include')
})

test('replaces only working_ddl through the explicit PUT contract', async () => {
  let captured
  const result = await replaceAdminIntegrationWorkspaceWorkingDdl(
    'https://api.example.com', tenantId, workspaceId, targetDdl, undefined,
    async (url, options) => {
      captured = { url, options }
      return Response.json(workspace({ source_ddl: sourceDdl, working_ddl: targetDdl, version: 2 }))
    },
  )
  assert.equal(result.status, 'loaded')
  assert.equal(result.workspace.working_ddl, targetDdl)
  assert.equal(result.workspace.source_ddl, sourceDdl)
  assert.equal(result.workspace.version, 2)
  assert.equal(captured.url, `https://api.example.com/admin/tenants/${tenantId}/integration-workspaces/${workspaceId}/working-ddl`)
  assert.equal(captured.options.method, 'PUT')
  assert.equal(captured.options.credentials, 'include')
  assert.deepEqual(JSON.parse(captured.options.body), { content: targetDdl })
})

test('rejects empty, NUL-containing and oversized SQL before making a request', async () => {
  assert.equal(getDdlValidationError(' \n\t'), 'empty')
  assert.equal(getDdlValidationError('SELECT\u0000 1'), 'invalid')
  assert.equal(getDdlValidationError('x'.repeat(MAX_DDL_BYTES + 1)), 'too_large')
  let requestCount = 0
  const request = async () => { requestCount += 1; return Response.json(workspace()) }
  assert.deepEqual(
    await createAdminIntegrationWorkspaceFromUpload('https://api.example.com', tenantId, '', null, undefined, request),
    { status: 'invalid' },
  )
  assert.deepEqual(
    await replaceAdminIntegrationWorkspaceWorkingDdl('https://api.example.com', tenantId, workspaceId, 'x'.repeat(MAX_DDL_BYTES + 1), undefined, request),
    { status: 'invalid' },
  )
  assert.equal(requestCount, 0)
})

test('maps tenant isolation and HTTP failures without exposing backend details', async () => {
  const secret = 'sensitive SQL or backend detail'
  const mismatch = await fetchAdminIntegrationWorkspace(
    'https://api.example.com', tenantId, workspaceId, undefined,
    async () => Response.json(workspace({ tenant_id: '33333333-3333-4333-8333-333333333333', source_ddl: secret, working_ddl: secret })),
  )
  assert.deepEqual(mismatch, { status: 'error' })
  for (const [status, expected] of [[401, 'unauthenticated'], [404, 'not_found'], [409, 'conflict'], [422, 'invalid'], [503, 'error']]) {
    const result = await replaceAdminIntegrationWorkspaceWorkingDdl(
      'https://api.example.com', tenantId, workspaceId, targetDdl, undefined,
      async () => Response.json({ detail: secret }, { status }),
    )
    assert.equal(result.status, expected)
    assert.doesNotMatch(JSON.stringify(result), /sensitive SQL|backend detail/)
  }
})
