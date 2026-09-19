import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const activeId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'
const archivedId = '55555555-5555-4555-8555-555555555555'
const sourceDdlId = '66666666-6666-4666-8666-666666666666'
const importedDdlId = '77777777-7777-4777-8777-777777777777'
const generatedDdlId = '88888888-8888-4888-8888-888888888888'
const auditNotionDdlId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
const auditGlobalAbOldDdlId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac'
const auditGlobalADdlId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad'
const auditGlobalAbcDdlId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae'
const generatedDraftId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const providerAId = '99999999-9999-4999-8999-999999999999'
const providerBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const providerCId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const prefix = `/admin/tenants/${tenantId}`

type IntegrationStatus = 'draft' | 'active' | 'archived'

interface Integration {
  id: string
  tenant_id: string
  version_number: number
  display_name: string
  namespace_key: string
  status: IntegrationStatus
  based_on_integration_id: string | null
  design_note: string | null
  selected_ddl_id: string | null
  created_at: string
  updated_at: string
}

interface Ddl {
  id: string
  title: string
  kind: 'source' | 'imported'
  source_report_id: string | null
  source_filename: string | null
  created_at: string
  is_selected: boolean
  source_provider: string | null
  source_audit_title: string | null
  source_report_date: string | null
  source_kind: 'audit' | 'manual'
  content_sha256: string
  generated_at: string
  is_default?: boolean
  provider_scope: string[]
  ddl_content?: string
}

interface Ingestion {
  tenant_provider_record_id: string
  provider: string
  correlation_id: string
  status: string
  archived: boolean
  started_at: string
  completed_at: string | null
  items_received: number
  items_inserted: number
  items_duplicate: number
  created_at: string
}

interface AuditReport {
  id: string
  title: string
  provider: string
  correlation_id?: string
  tenant_provider_record_id?: string
  report_date: string
  status: 'completed' | 'archived'
  sources_analyzed: number
  sources_retained: number
  sources_excluded: number
  records_retained: number
  decisions_required: number
  scope_kind: 'individual' | 'global'
  tenant_provider_record_ids: string[]
  created_at: string
  has_usable_ddl: boolean
}

interface ProviderRecord {
  id: string
  tenant_id: string
  provider: string
  audit_supported: boolean
  initial_ingestion_supported: boolean
  credential_type: string
  name: string
  status: string
  configuration: Record<string, string>
  credential_configured: boolean
  created_at: string
  updated_at: string
  last_verified_at: string | null
  last_verification_status: string | null
  last_verification_http_status: number | null
  last_verification_code: string | null
  last_verification_message: string | null
}

interface RecordedRequest {
  path: string
  method: string
  body?: unknown
}

function integration(
  id: string,
  version: number,
  status: IntegrationStatus,
  displayName: string,
  overrides: Partial<Integration> = {},
): Integration {
  return {
    id,
    tenant_id: tenantId,
    version_number: version,
    display_name: displayName,
    namespace_key: `v${version}`,
    status,
    based_on_integration_id: version > 1 ? activeId : null,
    design_note: status === 'active' ? 'Version stable' : null,
    selected_ddl_id: status === 'active' ? sourceDdlId : null,
    created_at: `2026-09-${String(10 + version).padStart(2, '0')}T10:00:00Z`,
    updated_at: `2026-09-${String(10 + version).padStart(2, '0')}T10:00:00Z`,
    ...overrides,
  }
}

const active = integration(activeId, 1, 'active', 'Novalia Talents v1')
const draft = integration(draftId, 2, 'draft', 'Novalia Talents v2')
const archived = integration(archivedId, 3, 'archived', 'Novalia historique', {
  namespace_key: 'v3',
  selected_ddl_id: sourceDdlId,
})

const sourceDdl: Ddl = {
  id: sourceDdlId,
  title: 'Source DDL',
  kind: 'source',
  source_report_id: 'audit-notion-2026-09-16',
  source_filename: null,
  created_at: '2026-09-16T10:00:00Z',
  is_selected: true,
  source_provider: 'notion',
  source_audit_title: 'Audit Notion',
  source_report_date: '2026-09-16',
  source_kind: 'audit',
  content_sha256: '1'.repeat(64),
  generated_at: '2026-09-16T10:00:00Z',
  provider_scope: [providerAId],
  ddl_content: '-- source\nCREATE TABLE source_table (id integer);\n',
}

const importedDdl: Ddl = {
  id: importedDdlId,
  title: 'novalia-modele-v1.sql',
  kind: 'imported',
  source_report_id: null,
  source_filename: null,
  created_at: '2026-09-17T10:00:00Z',
  is_selected: false,
  source_provider: null,
  source_audit_title: null,
  source_report_date: null,
  source_kind: 'manual',
  content_sha256: '2'.repeat(64),
  generated_at: '2026-09-17T10:00:00Z',
  provider_scope: [providerAId, providerBId],
  ddl_content: '-- imported\nCREATE TABLE v1_table (id integer);\n',
}

const auditNotionDdl: Ddl = {
  ...sourceDdl,
  id: auditNotionDdlId,
  title: 'DDL audit — Audit Notion',
  source_report_id: 'audit-notion-2026-09-16',
  source_audit_title: 'Audit Notion',
  source_report_date: '2026-09-16',
  content_sha256: '3'.repeat(64),
  generated_at: '2026-09-18T13:00:00Z',
  provider_scope: [providerAId, providerBId],
  ddl_content: '-- audit\nCREATE TABLE audit_notion (id integer);\n',
}

const auditGlobalAbOldDdl: Ddl = {
  ...auditNotionDdl,
  id: auditGlobalAbOldDdlId,
  title: 'DDL audit — Audit global A+B ancien',
  source_report_id: 'audit-global-ab-old',
  source_audit_title: 'Audit global A+B ancien',
  content_sha256: '4'.repeat(64),
  generated_at: '2026-09-16T09:00:00Z',
}

const auditGlobalADdl: Ddl = {
  ...sourceDdl,
  id: auditGlobalADdlId,
  title: 'DDL audit — Audit global A',
  source_report_id: 'audit-global-a',
  source_audit_title: 'Audit global A',
  content_sha256: '5'.repeat(64),
  generated_at: '2026-09-18T12:00:00Z',
  provider_scope: [providerAId],
}

const auditGlobalAbcDdl: Ddl = {
  ...auditNotionDdl,
  id: auditGlobalAbcDdlId,
  title: 'DDL audit — Audit global A+B+C',
  source_report_id: 'audit-global-abc',
  source_audit_title: 'Audit global A+B+C',
  content_sha256: '6'.repeat(64),
  generated_at: '2026-09-18T11:00:00Z',
  provider_scope: [providerAId, providerBId, providerCId],
}

const ingestion: Ingestion = {
  tenant_provider_record_id: providerAId,
  provider: 'notion',
  correlation_id: correlationId,
  status: 'completed',
  archived: false,
  started_at: '2026-09-16T09:00:00Z',
  completed_at: '2026-09-16T09:01:00Z',
  items_received: 10,
  items_inserted: 8,
  items_duplicate: 2,
  created_at: '2026-09-16T09:02:00Z',
}

function provider(id: string, providerSlug: string, name: string): ProviderRecord {
  return {
    id,
    tenant_id: tenantId,
    provider: providerSlug,
    audit_supported: true,
    initial_ingestion_supported: true,
    credential_type: 'api_key',
    name,
    status: 'active',
    configuration: {},
    credential_configured: true,
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-10T10:00:00Z',
    last_verified_at: null,
    last_verification_status: null,
    last_verification_http_status: null,
    last_verification_code: null,
    last_verification_message: null,
  }
}

const providerRecords = [
  provider(providerAId, 'notion', 'Notion RH'),
  provider(providerBId, 'google_sheets', 'Sheets candidats'),
  provider(providerCId, 'hubspot', 'HubSpot CRM'),
]

function auditReport(
  id: string,
  title: string,
  scopeKind: AuditReport['scope_kind'],
  providerIds: string[],
  createdAt: string,
  status: AuditReport['status'] = 'completed',
): AuditReport {
  return {
    id,
    title,
    provider: 'multi',
    report_date: createdAt.slice(0, 10),
    status,
    sources_analyzed: 3,
    sources_retained: 2,
    sources_excluded: 1,
    records_retained: 10,
    decisions_required: 0,
    scope_kind: scopeKind,
    tenant_provider_record_ids: providerIds,
    created_at: createdAt,
    has_usable_ddl: true,
  }
}

const auditReports: AuditReport[] = [
  auditReport('audit-individual-a', 'Audit individual A', 'individual', [providerAId], '2026-09-18T13:00:00Z'),
  auditReport('audit-global-a', 'Audit global A', 'global', [providerAId], '2026-09-18T12:00:00Z'),
  auditReport('audit-global-ab-old', 'Audit global A+B ancien', 'global', [providerAId, providerBId], '2026-09-16T09:00:00Z'),
  auditReport('audit-notion-2026-09-16', 'Audit Notion', 'global', [providerBId, providerAId], '2026-09-18T10:00:00Z'),
  auditReport('audit-global-abc', 'Audit global A+B+C', 'global', [providerAId, providerBId, providerCId], '2026-09-18T11:00:00Z'),
  auditReport('audit-global-ab-archived', 'Audit global A+B archivé', 'global', [providerAId, providerBId], '2026-09-18T14:00:00Z', 'archived'),
]

interface BackendOptions {
  tenantStatus?: 'active' | 'archived'
  integrations?: Integration[]
  ddls?: Record<string, Ddl[]>
  catalogue?: Ddl[]
  ingestions?: Record<string, Ingestion[]>
  reports?: AuditReport[]
  providers?: ProviderRecord[]
  providerScopes?: Record<string, string[]>
}

interface MockBackend {
  integrations: Integration[]
  ddls: Record<string, Ddl[]>
  catalogue: Ddl[]
  providerScopes: Record<string, string[]>
  requests: RecordedRequest[]
}

function copyCollections<T extends object>(collections: Record<string, T[]>): Record<string, T[]> {
  return Object.fromEntries(Object.entries(collections).map(([key, values]) => [key, values.map((value) => ({ ...value }))]))
}

async function openIntegration(page: Page, options: BackendOptions = {}): Promise<MockBackend> {
  const tenant = {
    id: tenantId,
    name: 'Client synthétique',
    slug: 'synthetic',
    status: options.tenantStatus ?? 'active',
  }
  const integrations = (options.integrations ?? [active, draft]).map((item) => ({ ...item }))
  const catalogue = [...(options.catalogue ?? [
    sourceDdl, auditNotionDdl, auditGlobalAbOldDdl, auditGlobalADdl,
    auditGlobalAbcDdl, importedDdl,
  ])].map((item) => ({ ...item, provider_scope: [...item.provider_scope] }))
  const backend: MockBackend = {
    integrations,
    ddls: copyCollections(options.ddls ?? {
      [activeId]: [sourceDdl],
      [draftId]: [importedDdl],
    }),
    catalogue,
    providerScopes: Object.fromEntries(Object.entries(options.providerScopes ?? {
      [activeId]: [providerAId],
      [draftId]: [providerAId, providerBId],
    }).map(([key, values]) => [key, [...values]])),
    requests: [],
  }
  const ingestions = copyCollections(options.ingestions ?? {
    [activeId]: [ingestion],
    [draftId]: [],
  })
  const reports = (options.reports ?? auditReports).map((report) => ({ ...report }))
  const providers = (options.providers ?? providerRecords).map((item) => ({ ...item }))
  for (const item of integrations) {
    backend.ddls[item.id] ??= []
    ingestions[item.id] ??= []
    backend.providerScopes[item.id] ??= []
  }
  for (const ddl of Object.values(backend.ddls).flat()) {
    const replacement = { ...ddl, provider_scope: [...ddl.provider_scope] }
    const existingIndex = backend.catalogue.findIndex((candidate) => candidate.id === ddl.id)
    if (existingIndex === -1) backend.catalogue.push(replacement)
    else backend.catalogue[existingIndex] = replacement
  }

  const candidateDdlList = (integrationId: string): Ddl[] => {
    const scope = [...(backend.providerScopes[integrationId] ?? [])].sort()
    return backend.catalogue
      .filter((ddl) => JSON.stringify([...ddl.provider_scope].sort()) === JSON.stringify(scope))
      .sort((first, second) => second.generated_at.localeCompare(first.generated_at) || second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id))
      .map((ddl, index) => ({
        ...ddl,
        is_selected: backend.integrations.find((item) => item.id === integrationId)?.selected_ddl_id === ddl.id,
        is_default: index === 0,
      }))
  }

  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    const method = route.request().method()
    const rawBody = route.request().postData()
    const body = rawBody ? JSON.parse(rawBody) as unknown : undefined
    backend.requests.push({ path: url.pathname, method, ...(body === undefined ? {} : { body }) })

    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === `${prefix}/reports`) return route.fulfill({ json: reports })
    if (url.pathname === `${prefix}/providers`) return route.fulfill({ json: providers })

    if (url.pathname === `${prefix}/integrations`) {
      if (method === 'GET') return route.fulfill({ json: backend.integrations })
      if (method === 'POST') {
        const created = integration(
          generatedDraftId, 2, 'draft', 'Client synthétique v2',
          { based_on_integration_id: null, selected_ddl_id: null },
        )
        backend.integrations.unshift(created)
        backend.ddls[created.id] = []
        ingestions[created.id] = []
        backend.providerScopes[created.id] = []
        return route.fulfill({ status: 201, json: created })
      }
    }

    const integrationPath = `${prefix}/integrations/`
    if (url.pathname.startsWith(integrationPath)) {
      const parts = url.pathname.slice(integrationPath.length).split('/')
      const integrationId = parts[0]
      const current = backend.integrations.find((item) => item.id === integrationId)
      if (!current) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })

      if (parts[1] === 'providers') {
        if (method === 'PUT') {
          const payload = body as { tenant_provider_record_ids: string[] }
          const previous = backend.providerScopes[integrationId] ?? []
          const changed = previous.length !== payload.tenant_provider_record_ids.length
            || previous.some((providerId) => !payload.tenant_provider_record_ids.includes(providerId))
          backend.providerScopes[integrationId] = [...payload.tenant_provider_record_ids]
          if (changed) {
            current.selected_ddl_id = null
            backend.ddls[integrationId] = (backend.ddls[integrationId] ?? []).map((ddl) => ({ ...ddl, is_selected: false }))
            ingestions[integrationId] = []
          }
        }
        return route.fulfill({
          json: (backend.providerScopes[integrationId] ?? []).map((providerId) => {
            const record = providers.find((item) => item.id === providerId)!
            return {
              tenant_provider_record_id: record.id,
              provider: record.provider,
              name: record.name,
              created_at: '2026-09-18T10:00:00Z',
            }
          }),
        })
      }

      if (parts[1] === 'ddl-candidates') {
        if (parts.length === 2 && method === 'GET') return route.fulfill({ json: candidateDdlList(integrationId) })
        if (parts.length === 2 && method === 'POST') {
          const payload = body as { title: string; content: string }
          const added: Ddl = {
            ...importedDdl,
            id: generatedDdlId,
            title: payload.title,
            source_filename: payload.title,
            is_selected: false,
            is_default: false,
            generated_at: '2026-09-18T15:00:00Z',
            provider_scope: [...(backend.providerScopes[integrationId] ?? [])],
            content_sha256: '7'.repeat(64),
            ddl_content: payload.content,
          }
          backend.catalogue = [...backend.catalogue.filter((item) => item.id !== added.id), added]
          return route.fulfill({ status: 201, json: added })
        }
        const ddl = candidateDdlList(integrationId).find((item) => item.id === parts[2])
        if (!ddl) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })
        if (parts[3] === 'selection' && method === 'PUT') {
          current.selected_ddl_id = ddl.id
          return route.fulfill({ json: { ...ddl, is_selected: true, ddl_content: ddl.ddl_content ?? 'CREATE TABLE selected (id integer);' } })
        }
        if (parts.length === 3 && method === 'PATCH') {
          const payload = body as { title: string }
          backend.catalogue = backend.catalogue.map((item) => item.id === ddl.id ? { ...item, title: payload.title } : item)
          return route.fulfill({ json: candidateDdlList(integrationId).find((item) => item.id === ddl.id) })
        }
        if (parts.length === 3 && method === 'DELETE') {
          backend.catalogue = backend.catalogue.filter((item) => item.id !== ddl.id)
          if (current.selected_ddl_id === ddl.id) current.selected_ddl_id = null
          return route.fulfill({ status: 204, body: '' })
        }
        if (parts.length === 3 && method === 'GET') {
          return route.fulfill({ json: { ...ddl, ddl_content: ddl.ddl_content ?? 'CREATE TABLE preview (id integer);' } })
        }
      }

      if (parts[1] === 'ddls') {
        if (parts.length === 2 && method === 'GET') return route.fulfill({ json: backend.ddls[integrationId] ?? [] })
        if (parts[2] === 'from-audit' && method === 'POST') {
          const added = { ...sourceDdl, id: generatedDdlId, is_selected: false }
          backend.ddls[integrationId] = [...(backend.ddls[integrationId] ?? []), added]
          return route.fulfill({ status: 201, json: added })
        }
        if (parts.length === 2 && method === 'POST') {
          const payload = body as { title: string; content: string }
          const added: Ddl = {
            ...importedDdl,
            id: generatedDdlId,
            title: payload.title,
            is_selected: false,
            ddl_content: payload.content,
          }
          backend.ddls[integrationId] = [...(backend.ddls[integrationId] ?? []), added]
          return route.fulfill({ status: 201, json: added })
        }
        const ddl = (backend.ddls[integrationId] ?? []).find((item) => item.id === parts[2])
        if (!ddl) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })
        if (parts[3] === 'selection' && method === 'PUT') {
          backend.ddls[integrationId] = backend.ddls[integrationId].map((item) => ({ ...item, is_selected: item.id === ddl.id }))
          current.selected_ddl_id = ddl.id
          return route.fulfill({ json: { ...ddl, is_selected: true, ddl_content: ddl.ddl_content ?? 'CREATE TABLE selected (id integer);' } })
        }
        if (parts.length === 3 && method === 'PATCH') {
          const payload = body as { title: string }
          ddl.title = payload.title
          return route.fulfill({ json: ddl })
        }
        if (parts.length === 3 && method === 'DELETE') {
          backend.ddls[integrationId] = backend.ddls[integrationId].filter((item) => item.id !== ddl.id)
          if (current.selected_ddl_id === ddl.id) {
            const fallback = backend.ddls[integrationId].find((item) => item.kind === 'source') ?? null
            current.selected_ddl_id = fallback?.id ?? null
            backend.ddls[integrationId] = backend.ddls[integrationId].map((item) => ({ ...item, is_selected: item.id === fallback?.id }))
          }
          return route.fulfill({ status: 204, body: '' })
        }
        if (parts.length === 3 && method === 'GET') {
          return route.fulfill({ json: { ...ddl, ddl_content: ddl.ddl_content ?? 'CREATE TABLE preview (id integer);' } })
        }
      }

      if (parts[1] === 'ingestions' && parts.length === 2 && method === 'GET') {
        return route.fulfill({ json: ingestions[integrationId] ?? [] })
      }
      if (parts.length === 1 && method === 'GET') return route.fulfill({ json: current })
    }

    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await page.getByRole('button', { name: 'Intégration', exact: true }).click()
  return backend
}

async function openCreate(page: Page) {
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Étape 1 — Choisir les providers à intégrer', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Étape 2 — Choisir un DDL', exact: true })).toBeVisible()
}

function ddlList(page: Page) {
  return page.locator('[aria-label="DDL disponibles"]')
}

function importedRow(page: Page, title: string) {
  return page.locator('.versioned-integration__ddl-row--imported').filter({ hasText: title })
}

test('creates a draft lazily on the first provider change and persists A then A+B', async ({ page }) => {
  const backend = await openIntegration(page, {
    integrations: [active],
    ddls: { [activeId]: [sourceDdl] },
  })
  await openCreate(page)

  await expect(page.getByRole('heading', { name: 'Intégration', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Charger un DDL', exact: true })).toBeDisabled()
  await expect(page.getByText('Sélectionnez au moins un provider à l’étape 1.', { exact: true })).toBeVisible()
  for (const obsolete of [
    'Modèle versionné',
    'Construisez une version reproductible',
    'Atelier de version',
    'Créer ou reprendre',
    'Brouillons existants',
    'Nouvelle version vide',
    'Créer une version vide',
    'Créer depuis une version',
    'Cloner cette version',
  ]) {
    await expect(page.getByText(obsolete, { exact: false })).toHaveCount(0)
  }
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(0)

  const providerA = page.getByRole('checkbox', { name: 'Sélectionner Notion RH', exact: true })
  const providerB = page.getByRole('checkbox', { name: 'Sélectionner Sheets candidats', exact: true })
  await providerA.click()
  await expect(providerA).toBeChecked()
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(1)
  await providerB.click()
  await expect(providerA).toBeChecked()
  await expect(providerB).toBeChecked()
  const scopeWrites = backend.requests.filter((request) => request.path.endsWith('/providers') && request.method === 'PUT')
  expect(scopeWrites.map((request) => request.body)).toEqual([
    { tenant_provider_record_ids: [providerAId] },
    { tenant_provider_record_ids: [providerAId, providerBId] },
  ])
  expect(backend.integrations.find((item) => item.id === generatedDraftId)?.status).toBe('draft')
  expect(backend.integrations.some((item) => item.id === generatedDraftId && item.status === 'active')).toBe(false)
})

test('shows the audit DDL as selectable default provenance without mutation actions', async ({ page }) => {
  await openIntegration(page)
  await openCreate(page)

  const row = page.locator('.versioned-integration__ddl-row').filter({ hasText: 'DDL audit — Audit Notion' })
  await expect(row).toBeVisible()
  await expect(row.getByText(/Source : Audit/)).toBeVisible()
  await expect(row.getByText('Par défaut', { exact: true })).toBeVisible()
  await expect(row.getByRole('radio', { name: 'Sélectionner DDL audit — Audit Notion', exact: true })).toBeVisible()
  await expect(row.locator('.ui-action-menu')).toHaveCount(0)
  await expect(row.getByRole('button', { name: /Renommer|Supprimer/ })).toHaveCount(0)
})

test('offers only exact global A+B audits and marks the newest B+A report once', async ({ page }) => {
  const existingDefaultDdl: Ddl = {
    ...sourceDdl,
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    is_selected: false,
  }
  const backend = await openIntegration(page, {
    ddls: {
      [activeId]: [sourceDdl],
      [draftId]: [existingDefaultDdl, importedDdl],
    },
  })
  await openCreate(page)

  const list = ddlList(page)
  await expect(list.getByText('Par défaut', { exact: true })).toHaveCount(1)
  const newestRow = list.locator('.versioned-integration__ddl-row').filter({ hasText: 'DDL audit — Audit Notion' })
  await expect(newestRow.getByText('Par défaut', { exact: true })).toBeVisible()
  await expect(list.getByText('DDL audit — Audit global A+B ancien', { exact: true })).toBeVisible()
  await expect(list.getByText('DDL audit — Audit individual A', { exact: true })).toHaveCount(0)
  await expect(list.getByText('DDL audit — Audit global A', { exact: true })).toHaveCount(0)
  await expect(list.getByText('DDL audit — Audit global A+B+C', { exact: true })).toHaveCount(0)
  await expect(list.getByText('DDL audit — Audit global A+B archivé', { exact: true })).toHaveCount(0)
  await expect(list.getByText(importedDdl.title, { exact: true })).toBeVisible()
  await expect(list.locator('input[type="radio"]:checked')).toHaveCount(0)

  const defaultRadio = list.getByRole('radio', { name: 'Sélectionner DDL audit — Audit Notion', exact: true })
  await defaultRadio.click()
  await expect(defaultRadio).toBeChecked()
  expect(backend.requests.filter((request) => request.path.endsWith('/ddls/from-audit') && request.method === 'POST')).toHaveLength(0)
  expect(backend.requests.filter((request) => request.path.endsWith(`/${existingDefaultDdl.id}/selection`) && request.method === 'PUT')).toHaveLength(0)
  expect(backend.requests.filter((request) => request.path.endsWith(`/${auditNotionDdlId}/selection`) && request.method === 'PUT')).toHaveLength(1)
})

test('loads a SQL file under its exact filename into the same list with a hidden draft', async ({ page }) => {
  const backend = await openIntegration(page, {
    integrations: [active],
    ddls: { [activeId]: [sourceDdl] },
  })
  await openCreate(page)
  await page.getByRole('checkbox', { name: 'Sélectionner Notion RH', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Sélectionner Notion RH', exact: true })).toBeChecked()

  await expect(page.getByLabel('Titre')).toHaveCount(0)
  await page.getByLabel('Fichier DDL à charger').setInputFiles({
    name: `${'x'.repeat(117)}.sql`,
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE rejected_title (id integer);'),
  })
  await expect(page.getByText('Le nom du fichier doit contenir au maximum 120 octets UTF-8.', { exact: true })).toBeVisible()
  expect(backend.requests.filter((request) => request.path.endsWith('/ddl-candidates') && request.method === 'POST')).toHaveLength(0)
  await page.getByLabel('Fichier DDL à charger').setInputFiles({
    name: 'novalia-modele-v2.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE novalia_v2 (id integer);'),
  })

  const list = ddlList(page)
  await expect(list.getByText('DDL audit — Audit global A', { exact: true })).toBeVisible()
  await expect(list.getByText('novalia-modele-v2.sql', { exact: true })).toBeVisible()
  const imports = backend.requests.filter((request) => request.path.endsWith('/ddl-candidates') && request.method === 'POST')
  expect(imports).toHaveLength(1)
  expect(imports[0].body).toEqual({
    title: 'novalia-modele-v2.sql',
    content: 'CREATE TABLE novalia_v2 (id integer);',
  })
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(1)
  expect(backend.integrations.find((item) => item.id === generatedDraftId)?.status).toBe('draft')
  expect(backend.integrations.some((item) => item.id === generatedDraftId && item.status === 'active')).toBe(false)
})

test('changing A+B to A+C clears the DDL choice but preserves imported artifacts', async ({ page }) => {
  const selectedImport = { ...importedDdl, is_selected: true }
  const selectedDraft = { ...draft, selected_ddl_id: importedDdlId }
  const backend = await openIntegration(page, {
    integrations: [active, selectedDraft],
    ddls: { [activeId]: [sourceDdl], [draftId]: [selectedImport] },
  })
  await openCreate(page)

  const importedRadio = page.getByRole('radio', { name: `Sélectionner ${importedDdl.title}`, exact: true })
  await expect(importedRadio).toBeChecked()
  await page.getByRole('checkbox', { name: 'Sélectionner HubSpot CRM', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Sélectionner HubSpot CRM', exact: true })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Sélectionner Sheets candidats', exact: true }).click()

  await expect(page.getByRole('checkbox', { name: 'Sélectionner Notion RH', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Sélectionner HubSpot CRM', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Sélectionner Sheets candidats', exact: true })).not.toBeChecked()
  await expect(importedRadio).toHaveCount(0)
  await expect(page.getByText('Aucun DDL compatible avec les providers sélectionnés.', { exact: true })).toBeVisible()
  expect(backend.catalogue.some((ddl) => ddl.id === importedDdlId)).toBe(true)
  expect(backend.ddls[draftId]).toHaveLength(1)
  const scopeWrites = backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/providers` && request.method === 'PUT')
  expect(scopeWrites.at(-1)?.body).toEqual({ tenant_provider_record_ids: [providerAId, providerCId] })
})

test('offers exactly rename/delete for imported DDLs and performs a real PATCH', async ({ page }) => {
  const backend = await openIntegration(page)
  await openCreate(page)
  const row = importedRow(page, importedDdl.title)

  await row.getByLabel(`Actions pour ${importedDdl.title}`).click()
  const menu = row.locator('.ui-action-menu__content')
  await expect(menu.getByRole('button')).toHaveCount(2)
  await expect(menu.getByRole('button').allTextContents()).resolves.toEqual(['Renommer', 'Supprimer'])
  await menu.getByRole('button', { name: 'Renommer', exact: true }).click()
  await page.getByLabel('Nouveau titre du DDL').fill('novalia-modele-renomme.sql')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

  await expect(page.getByText('novalia-modele-renomme.sql', { exact: true })).toBeVisible()
  const patches = backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ddl-candidates/${importedDdlId}` && request.method === 'PATCH')
  expect(patches).toHaveLength(1)
  expect(patches[0].body).toEqual({ title: 'novalia-modele-renomme.sql' })
})

test('confirms deletion, calls DELETE and removes the imported row only after success', async ({ page }) => {
  const backend = await openIntegration(page)
  await openCreate(page)
  const row = importedRow(page, importedDdl.title)

  await row.getByLabel(`Actions pour ${importedDdl.title}`).click()
  await row.getByRole('button', { name: 'Supprimer', exact: true }).click()
  const confirmation = row.getByRole('alertdialog')
  await expect(confirmation.getByText('Supprimer ce DDL ?', { exact: true })).toBeVisible()
  await confirmation.getByRole('button', { name: 'Supprimer', exact: true }).click()

  await expect(page.getByText(importedDdl.title, { exact: true })).toHaveCount(0)
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ddl-candidates/${importedDdlId}` && request.method === 'DELETE')).toHaveLength(1)
})

test('keeps exactly one explicitly selected DDL across successive choices', async ({ page }) => {
  const backend = await openIntegration(page)
  await openCreate(page)
  const auditRadio = page.getByRole('radio', { name: 'Sélectionner DDL audit — Audit Notion', exact: true })
  const importedRadio = page.getByRole('radio', { name: `Sélectionner ${importedDdl.title}`, exact: true })

  await auditRadio.click()
  await expect(auditRadio).toBeChecked()
  await expect(ddlList(page).locator('input[type="radio"]:checked')).toHaveCount(1)
  await importedRadio.click()
  await expect(importedRadio).toBeChecked()
  await expect(auditRadio).not.toBeChecked()
  await expect(ddlList(page).locator('input[type="radio"]:checked')).toHaveCount(1)
  expect(backend.requests.filter((request) => request.path.endsWith('/selection') && request.method === 'PUT')).toHaveLength(2)
})

test('keeps Active and Versions read-only behavior intact', async ({ page }) => {
  await openIntegration(page, {
    integrations: [active, draft, archived],
    ddls: {
      [activeId]: [sourceDdl],
      [draftId]: [importedDdl],
      [archivedId]: [{ ...sourceDdl }],
    },
    ingestions: { [activeId]: [ingestion], [draftId]: [], [archivedId]: [] },
  })

  await expect(page.getByRole('heading', { name: active.display_name, exact: true })).toBeVisible()
  const activeLibrary = page.locator('[aria-label="Bibliothèque DDL"]')
  await expect(activeLibrary.locator('input[type="radio"]')).toHaveCount(0)
  await expect(activeLibrary.getByText('Sélectionné', { exact: true })).toBeVisible()
  await activeLibrary.getByRole('button', { name: new RegExp(sourceDdl.title) }).click()
  await expect(page.getByRole('region', { name: `Aperçu de ${sourceDdl.title}`, exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  await page.getByRole('button', { name: /Novalia historique/ }).click()
  await expect(page.getByRole('heading', { name: archived.display_name, exact: true })).toBeVisible()
  await expect(page.locator('[aria-label="Bibliothèque DDL"]').locator('input[type="radio"]')).toHaveCount(0)
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`keeps the DDL list and imported menu usable at ${viewport.width}px`, async ({ page }, testInfo) => {
    const longDdl = {
      ...importedDdl,
      title: 'modele-importe-avec-un-titre-tres-long-qui-doit-rester-lisible-sans-deborder-du-viewport.sql',
    }
    await page.setViewportSize(viewport)
    await openIntegration(page, {
      ddls: { [activeId]: [sourceDdl], [draftId]: [longDdl] },
    })
    await openCreate(page)

    const loadButton = page.getByRole('button', { name: 'Charger un DDL', exact: true })
    const radio = page.getByRole('radio', { name: `Sélectionner ${longDdl.title}`, exact: true })
    const row = importedRow(page, longDdl.title)
    await expect(loadButton).toBeVisible()
    await expect(radio).toBeVisible()
    await row.getByLabel(`Actions pour ${longDdl.title}`).click()
    const menu = row.locator('.ui-action-menu__content')
    await expect(menu.getByRole('button', { name: 'Renommer', exact: true })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Supprimer', exact: true })).toBeVisible()

    const menuBox = await menu.boundingBox()
    expect(menuBox).not.toBeNull()
    expect(menuBox!.x).toBeGreaterThanOrEqual(0)
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width)
    expect(menuBox!.y).toBeGreaterThanOrEqual(0)
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height)
    const isFullyInsideClippingAncestors = await menu.evaluate((element) => {
      const menuRect = element.getBoundingClientRect()
      let ancestor = element.parentElement
      while (ancestor !== null) {
        const style = window.getComputedStyle(ancestor)
        if (/(auto|clip|hidden|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
          const ancestorRect = ancestor.getBoundingClientRect()
          if (menuRect.left < ancestorRect.left || menuRect.right > ancestorRect.right
            || menuRect.top < ancestorRect.top || menuRect.bottom > ancestorRect.bottom) return false
        }
        ancestor = ancestor.parentElement
      }
      return true
    })
    expect(isFullyInsideClippingAncestors).toBe(true)
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
    await page.screenshot({ path: testInfo.outputPath(`integration-ddl-step-${viewport.width}.png`), fullPage: true })
  })
}
