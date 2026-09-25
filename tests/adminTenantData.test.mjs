import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fetchExplorerSummary, fetchExplorerProfile, fetchExplorerRows } from '../src/api/dataExplorer.ts'
import { businessColumns, rangeToTsv, reorderColumn, resizeColumn, trustedSorts } from '../src/dataExplorer/gridState.ts'
import { ADMIN_DASHBOARD_NAVIGATION } from '../src/navigation/dashboardNavigation.ts'

const tenant = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const summary = { integration_version_id: version, table_count: 1, total_row_count: 5,
  materialized_at: '2026-09-20T12:00:00Z', profiled_at: '2026-09-21T12:00:00Z',
  sources: [{ provider: 'notion', source_id: 'crm', source_name: 'CRM Clients' }],
  tables: [{ name: 'clients', row_count: 5, column_count: 3, sources: [{ provider: 'notion', source_id: 'crm', source_name: 'CRM Clients' }] }] }

test('global Données is a page and both entry points mount the same explorer', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const global = await readFile(new URL('../src/pages/GlobalDataPage.tsx', import.meta.url), 'utf8')
  const tenantPage = await readFile(new URL('../src/pages/AdminTenantWorkspacePage.tsx', import.meta.url), 'utf8')
  assert.equal(ADMIN_DASHBOARD_NAVIGATION.find((item) => item.label === 'Données')?.page, 'data')
  assert.match(app, /<GlobalDataPage/)
  assert.match(global, /<AdminTenantData/)
  assert.match(global, /Choisir un client/)
  assert.match(tenantPage, /<AdminTenantData/)
})

test('summary, profile and bounded cursor rows use credentialed backend contracts', async () => {
  const seen = []
  const request = async (url, options) => {
    seen.push({ url, options })
    if (url.endsWith('/summary')) return Response.json(summary)
    if (url.endsWith('/profile')) return Response.json({ name: 'clients', columns: [
      { name: 'name', ordinal_position: 1, data_type: 'text', type_family: 'text', is_technical: false },
      { name: '__syncoria_source', ordinal_position: 2, data_type: 'text', type_family: 'text', is_technical: true },
    ] })
    return Response.json({ columns: ['name'], rows: [{ name: 'Alice' }], table_row_count: 5, has_more: false, next_cursor: null })
  }
  assert.equal((await fetchExplorerSummary('https://api.test', tenant, version, undefined, request)).value.total_row_count, 5)
  const profile = await fetchExplorerProfile('https://api.test', tenant, version, 'clients', undefined, request)
  assert.equal(profile.status, 'loaded')
  assert.deepEqual(businessColumns(profile.value.columns).map((column) => column.name), ['name'])
  const query = { columns: ['name'], sorts: [{ column: 'name', direction: 'asc' }], search: 'Ali', cursor: 'opaque', limit: 100 }
  assert.equal((await fetchExplorerRows('https://api.test', tenant, version, 'clients', query, undefined, request)).value.rows[0].name, 'Alice')
  assert.equal(seen.length, 3)
  for (const item of seen) assert.equal(item.options.credentials, 'include')
  assert.deepEqual(JSON.parse(seen[2].options.body), query)
  assert.match(seen[2].url, /\/data\/tables\/clients\/rows$/)
})

test('column state is local, technical fields are excluded, and copy is spreadsheet compatible', () => {
  const columns = businessColumns([
    { name: 'name', ordinal_position: 1, is_technical: false },
    { name: '__syncoria_id', ordinal_position: 2, is_technical: false },
    { name: 'city', ordinal_position: 3, is_technical: false },
  ])
  assert.deepEqual(columns.map((column) => column.name), ['name', 'city'])
  assert.equal(resizeColumn(columns, 'name', 250)[0].width, 250)
  assert.deepEqual(reorderColumn(columns, 'city', 'name').map((column) => column.name), ['city', 'name'])
  assert.deepEqual(trustedSorts([{ column: '__syncoria_id', direction: 'asc' }, { column: 'city', direction: 'desc' }], columns), [{ column: 'city', direction: 'desc' }])
  assert.equal(businessColumns([{ name: 'payload', ordinal_position: 1, type_family: 'other', data_type: 'jsonb', is_technical: false }])[0].sortable, false)
  assert.equal(rangeToTsv([{ name: 'A\tB', city: 'Paris' }, { name: 'Cara', city: 'Lyon' }], ['name', 'city'],
    { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }), '"A\tB"\tParis\r\nCara\tLyon')
})

test('backend errors and malformed row pages remain sanitized', async () => {
  for (const [code, expected] of [[404, 'not_found'], [409, 'conflict'], [422, 'invalid'], [503, 'unavailable']]) {
    const result = await fetchExplorerSummary('https://api.test', tenant, version, undefined,
      async () => Response.json({ detail: 'SQL SELECT secret' }, { status: code }))
    assert.deepEqual(result, { status: expected })
  }
  const invalid = await fetchExplorerRows('https://api.test', tenant, version, 'clients',
    { columns: ['name'], sorts: [], search: null, cursor: null, limit: 100 }, undefined,
    async () => Response.json({ columns: ['name'], rows: [], table_row_count: 5, has_more: true, next_cursor: null }))
  assert.deepEqual(invalid, { status: 'error' })
})
