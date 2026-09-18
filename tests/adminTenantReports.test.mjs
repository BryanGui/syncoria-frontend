import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { archiveAdminTenantReport, buildAdminTenantReportPdfUrl, fetchAdminTenantReports } from '../src/api/adminTenantReports.ts'
import { formatLocalCalendarDate } from '../src/tenantReports/model.ts'
import { TENANT_WORKSPACE_SECTIONS, ADMIN_TENANT_WORKSPACE_SECTIONS } from '../src/tenantWorkspace/model.ts'

const tenantId = '11111111-1111-4111-8111-111111111111'
const adminWorkspaceSource = await readFile(
  new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url),
  'utf8',
)
const tenantWorkspaceSource = await readFile(
  new URL('../src/components/TenantWorkspace.tsx', import.meta.url),
  'utf8',
)
const auditReportsSource = await readFile(
  new URL('../src/components/AdminTenantReports.tsx', import.meta.url),
  'utf8',
)
const report = {
  id: 'audit-example', title: 'Audit exemple', status: 'completed',
  provider: 'notion', report_date: '2026-09-07',
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

test('accepts reports with pending sources absent from list metadata', async () => {
  const pendingSourcesReport = {
    ...report,
    id: 'audit-pending-sources',
    sources_analyzed: 11,
    sources_retained: 8,
    sources_excluded: 0,
    decisions_required: 3,
    records_retained: 186,
  }
  assert.deepEqual(await fetchAdminTenantReports(
    'https://api.example.com', tenantId, undefined,
    async () => Response.json([pendingSourcesReport]),
  ), { status: 'loaded', reports: [pendingSourcesReport] })
})

test('keeps the paired runtime audit references and accepts legacy null references', async () => {
  const referenced = {
    ...report,
    correlation_id: '33333333-3333-4333-8333-333333333333',
    tenant_provider_record_id: '22222222-2222-4222-8222-222222222222',
  }
  const legacy = { ...report, id: 'audit-legacy', report_date: '2026-09-06', correlation_id: null, tenant_provider_record_id: null }
  assert.deepEqual(await fetchAdminTenantReports(
    'https://api.example.com', tenantId, undefined,
    async () => Response.json([referenced, legacy]),
  ), { status: 'loaded', reports: [referenced, { ...report, id: 'audit-legacy', report_date: '2026-09-06' }] })
  for (const invalid of [
    { ...report, correlation_id: 'not-a-uuid', tenant_provider_record_id: null },
    { ...report, correlation_id: '33333333-3333-4333-8333-333333333333' },
  ]) {
    assert.deepEqual(await fetchAdminTenantReports(
      'https://api.example.com', tenantId, undefined,
      async () => Response.json([invalid]),
    ), { status: 'error' })
  }
})

test('distinguishes no reports from failures and expired sessions', async () => {
  for (const [status, expected] of [[401, 'unauthenticated'], [404, 'not_found'], [503, 'error']]) {
    assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json({ detail: 'internal failure' }, { status })), { status: expected })
  }
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json([])), { status: 'loaded', reports: [] })
  assert.deepEqual(await fetchAdminTenantReports(null, tenantId), { status: 'error' })
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => { throw new Error('internal failure') }), { status: 'error' })
})

test('rejects malformed metadata and invalid counts', async () => {
  for (const payload of [{}, [{ ...report, id: '../other' }], [{ ...report, sources_retained: -1 }], [{ ...report, records_retained: 1.5 }], [{ ...report, status: 'pending' }], [report, report]]) {
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

test('reports remain available through the admin integration audit step', () => {
  assert.equal(ADMIN_TENANT_WORKSPACE_SECTIONS.includes('Rapports'), false)
  assert.equal(TENANT_WORKSPACE_SECTIONS.includes('Rapports'), false)
  assert.match(adminWorkspaceSource, /adminReports=\{/)
  assert.match(adminWorkspaceSource, /<AdminTenantReports/)
  assert.match(tenantWorkspaceSource, /activeSection === 'Audit'[\s\S]*?adminReports/)
})

test('uses the backend audit capability instead of a provider-specific launcher branch', () => {
  assert.match(auditReportsSource, /audit_supported/)
  assert.match(auditReportsSource, /<SelectableList/)
  assert.match(auditReportsSource, /ariaLabel="Providers à auditer"/)
  assert.match(auditReportsSource, /provider\.status === 'active'/)
  assert.doesNotMatch(auditReportsSource, /<select/)
  assert.doesNotMatch(auditReportsSource, /provider\.provider\s*[!=]==?\s*['"]notion['"]/
  )
  assert.doesNotMatch(auditReportsSource, /selectedProvider\.provider\s*!==\s*'notion'/)
  assert.doesNotMatch(auditReportsSource, /selectedProvider\.provider\s*===\s*'notion'/)
})

test('restores only active audit operations in the launcher', () => {
  assert.match(auditReportsSource, /function isActiveAuditOperation\(operation: AdminProviderAuditOperation\)/)
  assert.match(auditReportsSource, /latest\.status === 'loaded' && isActiveAuditOperation\(latest\.operation\)/)
  assert.doesNotMatch(auditReportsSource, /Ce titre sera visible dans l’historique et le rapport\./)
})

test('keeps report actions in the compact row menu without spacing hacks', async () => {
  assert.match(auditReportsSource, /ActionMenu ariaLabel="Actions de l’audit" label="⋯"/)
  assert.match(auditReportsSource, /tenant-audit__history-summary/)
  assert.match(auditReportsSource, /tenant-audit__open-report/)
  assert.doesNotMatch(auditReportsSource, /handleRowClick|handleRowKeyDown/)
  const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
  assert.doesNotMatch(styles, /tenant-audit__history-actions--primary[^\n]*nth-child/)
})

test('formats the calendar date from the browser local time', () => {
  assert.equal(formatLocalCalendarDate(new Date(2026, 8, 7)), '2026-09-07')
})


test('keeps same-provider reports and archives sorted newest first', async () => {
  const newer = { ...report, id: 'audit-notion-2026-10-15', report_date: '2026-10-15' }
  const archived = { ...report, id: 'audit-notion-2026-08-01', report_date: '2026-08-01', status: 'archived' }
  assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json([archived, report, newer])), { status: 'loaded', reports: [newer, report, archived] })
})

test('rejects impossible, implicit and missing dates', async () => {
  for (const report_date of ['2026-02-30', '2026-13-01', '07/09/2026', '2026-09-07T00:00:00Z', '0000-01-01', null, undefined]) {
    assert.deepEqual(await fetchAdminTenantReports('https://api.example.com', tenantId, undefined, async () => Response.json([{ ...report, report_date }])), { status: 'error' })
  }
})

test('archives only the selected report and validates returned state', async () => {
  const archived = { ...report, status: 'archived' }
  const signal = new AbortController().signal
  const request = async (url, options) => {
    assert.equal(url, `https://api.example.com/admin/tenants/${tenantId}/reports/audit-example/archive`)
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'include')
    assert.equal(options.signal, signal)
    return Response.json(archived)
  }
  assert.deepEqual(await archiveAdminTenantReport('https://api.example.com', tenantId, report.id, signal, request), { status: 'archived', report: archived })
  for (const payload of [report, { ...archived, id: 'other' }]) {
    assert.deepEqual(await archiveAdminTenantReport('https://api.example.com', tenantId, report.id, undefined, async () => Response.json(payload)), { status: 'error' })
  }
})

test('archive handles expired session, missing report and sanitized failures', async () => {
  for (const [status, expected] of [[401, 'unauthenticated'], [404, 'not_found'], [503, 'error']]) {
    assert.deepEqual(await archiveAdminTenantReport('https://api.example.com', tenantId, report.id, undefined, async () => Response.json({ detail: 'internal failure' }, { status })), { status: expected })
  }
  assert.deepEqual(await archiveAdminTenantReport('https://api.example.com', tenantId, '../other', undefined, () => { throw new Error('must not request') }), { status: 'error' })
})
