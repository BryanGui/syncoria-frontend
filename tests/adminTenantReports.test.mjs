import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAdminTenantReportPdfUrl, fetchAdminTenantReports } from '../src/api/adminTenantReports.ts'
import { TENANT_WORKSPACE_SECTIONS, ADMIN_TENANT_WORKSPACE_SECTIONS } from '../src/tenantWorkspace/model.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const report = {
  id: 'audit-example', title: 'Audit exemple', status: 'completed',
  sources_analyzed: 3, sources_retained: 2, sources_excluded: 1,
  records_retained: 7, decisions_required: 1,
}

test('loads tenant-scoped metadata using the admin cookie and abort signal', async () => {
  const signal = new AbortController().signal
  const request = async (url, options) => {
    assert.equal(url, `https://api.example.com/admin/tenants/${tenantId}/reports`)
    assert.equal(options.credentials, 'include')
    assert.equal(options.signal, signal)
    assert.equal(options.method, 'GET')
    return Response.json([{ ...report, internal: 'discard-this-field' }])
  }
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, signal, request), { status: 'loaded', reports: [report] })
})

test('distinguishes no reports from failures and expired sessions', async () => {
  for (const [status, expected] of [[401, 'unauthenticated'], [404, 'not_found'], [503, 'error']]) {
    assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json({ detail: 'internal failure' }, { status })), { status: expected })
  }
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json([])), { status: 'loaded', reports: [] })
  assert.deepEqual(await fetchAdminTenantReports(null, tenantId), { status: 'error' })
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => { throw new Error('internal failure') }), { status: 'error' })
})

test('rejects malformed metadata and inconsistent counts', async () => {
  for (const payload of [{}, [{ ...report, id: '../other' }], [{ ...report, sources_retained: -1 }], [{ ...report, sources_analyzed: 99 }], [{ ...report, status: 'pending' }], [report, report]]) {
    assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json(payload)), { status: 'error' })
  }
})

test('allows omission of the decision counter via null', async () => {
  const withoutCount = { ...report, decisions_required: null }
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json([withoutCount])), { status: 'loaded', reports: [withoutCount] })
})

test('constructs only the bounded PDF endpoint for the selected tenant', () => {
  const prefix = `https://api.example.com/admin/tenants/${tenantId}/reports/audit-example/pdf`
  assert.equal(buildAdminTenantReportPdfUrl('https://api.example.com', tenantId, 'audit-example'), prefix)
  assert.equal(buildAdminTenantReportPdfUrl('https://api.example.com', tenantId, 'audit-example', true), `${prefix}?download=true`)
  for (const invalid of ['../other', '%2e%2e', '/tmp/report', 'file.pdf']) {
    assert.equal(buildAdminTenantReportPdfUrl('https://api.example.com', tenantId, invalid), undefined)
  }
  assert.equal(buildAdminTenantReportPdfUrl('https://api.example.com', '../other', 'audit-example'), undefined)
})

test('audit navigation exists only in the admin workspace', () => {
  assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes('Audit & cartographie'), true)
  assert.equal(TENANT_WORKSPACE_SECTIONS.includes('Audit & cartographie'), false)
})
