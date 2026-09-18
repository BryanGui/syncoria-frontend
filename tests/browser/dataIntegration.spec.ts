import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const activeId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'
const otherDraftId = '44444444-4444-4444-8444-444444444444'
const archivedId = '55555555-5555-4555-8555-555555555555'
const sourceDdlId = '66666666-6666-4666-8666-666666666666'
const importedDdlId = '77777777-7777-4777-8777-777777777777'
const addedDdlId = '88888888-8888-4888-8888-888888888888'
const providerRecordId = '99999999-9999-4999-8999-999999999999'
const n1CorrelationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const n2CorrelationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
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
const otherDraft = integration(otherDraftId, 3, 'draft', 'Novalia Talents v3')
const archived = integration(archivedId, 1, 'archived', 'Novalia historique', {
  namespace_key: 'legacy',
  based_on_integration_id: null,
  selected_ddl_id: sourceDdlId,
})

const sourceDdl: Ddl = {
  id: sourceDdlId,
  title: 'Audit Notion',
  kind: 'source',
  source_report_id: 'audit-notion-2026-09-16',
  source_filename: null,
  created_at: '2026-09-16T10:00:00Z',
  is_selected: true,
  source_provider: 'notion',
  source_audit_title: 'Audit Notion',
  source_report_date: '2026-09-16',
  ddl_content: '-- source\nCREATE TABLE source_table (id integer);\n',
}

const importedDdl: Ddl = {
  id: importedDdlId,
  title: 'DDL importé v2',
  kind: 'imported',
  source_report_id: null,
  source_filename: 'novalia-v2.sql',
  created_at: '2026-09-17T10:00:00Z',
  is_selected: false,
  source_provider: null,
  source_audit_title: null,
  source_report_date: null,
  ddl_content: '-- imported\nCREATE TABLE v2_table (id integer);\n',
}

function ingestion(correlationId: string, day: number, received: number): Ingestion {
  return {
    tenant_provider_record_id: providerRecordId,
    provider: 'notion',
    correlation_id: correlationId,
    status: 'completed',
    archived: false,
    started_at: `2026-09-${day}T09:00:00Z`,
    completed_at: `2026-09-${day}T09:01:00Z`,
    items_received: received,
    items_inserted: received - 2,
    items_duplicate: 2,
    created_at: `2026-09-${day}T09:02:00Z`,
  }
}

const n1 = ingestion(n1CorrelationId, 16, 10)
const n2 = ingestion(n2CorrelationId, 17, 20)

interface BackendOptions {
  tenantStatus?: 'active' | 'archived'
  integrations?: Integration[]
  ddls?: Record<string, Ddl[]>
  ingestions?: Record<string, Ingestion[]>
  candidates?: Record<string, Ingestion[]>
  ddlFailures?: Record<string, number>
  candidateFailures?: Record<string, number>
  slowIntegrationIds?: string[]
  slowDelay?: number
  mutationDelay?: number
  importErrors?: string[]
  addAuditErrors?: string[]
}

interface MockBackend {
  integrations: Integration[]
  ddls: Record<string, Ddl[]>
  ingestions: Record<string, Ingestion[]>
  candidates: Record<string, Ingestion[]>
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
  const defaultDdls: Record<string, Ddl[]> = {
    [activeId]: [sourceDdl],
    [draftId]: [importedDdl],
  }
  const defaultIngestions: Record<string, Ingestion[]> = {
    [activeId]: [n1],
    [draftId]: [n1],
  }
  const defaultCandidates: Record<string, Ingestion[]> = {
    [activeId]: [],
    [draftId]: [n2],
  }
  const backend: MockBackend = {
    integrations,
    ddls: copyCollections(options.ddls ?? defaultDdls),
    ingestions: copyCollections(options.ingestions ?? defaultIngestions),
    candidates: copyCollections(options.candidates ?? defaultCandidates),
    requests: [],
  }
  for (const item of integrations) {
    backend.ddls[item.id] ??= []
    backend.ingestions[item.id] ??= []
    backend.candidates[item.id] ??= []
  }
  const ddlFailures = { ...(options.ddlFailures ?? {}) }
  const candidateFailures = { ...(options.candidateFailures ?? {}) }
  const slowIntegrationIds = new Set(options.slowIntegrationIds ?? [])
  const importErrors = [...(options.importErrors ?? [])]
  const addAuditErrors = [...(options.addAuditErrors ?? [])]
  let generatedVersion = Math.max(0, ...integrations.map((item) => item.version_number))
  let generatedIdIndex = 0
  const generatedIds = [
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  ]

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
    if (url.pathname === `${prefix}/reports`) return route.fulfill({ json: [{
      id: 'audit-notion-2026-09-16',
      title: 'Audit Notion',
      provider: 'notion',
      correlation_id: n1CorrelationId,
      tenant_provider_record_id: providerRecordId,
      report_date: '2026-09-16',
      status: 'completed',
      sources_analyzed: 3,
      sources_retained: 2,
      sources_excluded: 1,
      records_retained: 10,
      decisions_required: 0,
    }] })

    if (url.pathname === `${prefix}/integrations`) {
      if (method === 'GET') return route.fulfill({ json: backend.integrations })
      if (method === 'POST') {
        if (options.mutationDelay) await new Promise((resolve) => setTimeout(resolve, options.mutationDelay))
        const payload = (body ?? {}) as { display_name?: string }
        generatedVersion += 1
        const created = integration(
          generatedIds[generatedIdIndex++] ?? `f0000000-0000-4000-8000-${String(generatedIdIndex).padStart(12, '0')}`,
          generatedVersion,
          'draft',
          payload.display_name ?? `Novalia Talents v${generatedVersion}`,
          { based_on_integration_id: null, selected_ddl_id: null },
        )
        backend.integrations.unshift(created)
        backend.ddls[created.id] = []
        backend.ingestions[created.id] = []
        backend.candidates[created.id] = []
        return route.fulfill({ status: 201, json: created })
      }
    }

    const integrationPath = `${prefix}/integrations/`
    if (url.pathname.startsWith(integrationPath)) {
      const parts = url.pathname.slice(integrationPath.length).split('/')
      const integrationId = parts[0]
      const current = backend.integrations.find((item) => item.id === integrationId)
      if (!current) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })
      if (method === 'GET' && slowIntegrationIds.has(integrationId)) {
        await new Promise((resolve) => setTimeout(resolve, options.slowDelay ?? 600))
      }

      if (parts[1] === 'clone' && method === 'POST') {
        if (options.mutationDelay) await new Promise((resolve) => setTimeout(resolve, options.mutationDelay))
        generatedVersion += 1
        const cloned = integration(
          generatedIds[generatedIdIndex++] ?? `f0000000-0000-4000-8000-${String(generatedIdIndex).padStart(12, '0')}`,
          generatedVersion,
          'draft',
          `Novalia Talents v${generatedVersion}`,
          { based_on_integration_id: current.id, selected_ddl_id: current.selected_ddl_id },
        )
        backend.integrations.unshift(cloned)
        backend.ddls[cloned.id] = (backend.ddls[current.id] ?? []).map((ddl) => ({ ...ddl }))
        backend.ingestions[cloned.id] = (backend.ingestions[current.id] ?? []).map((item) => ({ ...item }))
        backend.candidates[cloned.id] = (backend.candidates[current.id] ?? []).map((item) => ({ ...item }))
        return route.fulfill({ status: 201, json: cloned })
      }

      if (parts[1] === 'activate' && method === 'PUT') {
        if (options.mutationDelay) await new Promise((resolve) => setTimeout(resolve, options.mutationDelay))
        backend.integrations = backend.integrations.map((item) => item.id === integrationId
          ? { ...item, status: 'active' as const, updated_at: '2026-09-18T10:00:00Z' }
          : item.status === 'active'
            ? { ...item, status: 'archived' as const, updated_at: '2026-09-18T10:00:00Z' }
            : item)
        return route.fulfill({ json: backend.integrations.find((item) => item.id === integrationId) })
      }

      if (parts[1] === 'ddls') {
        if (parts.length === 2 && method === 'GET') {
          if ((ddlFailures[integrationId] ?? 0) > 0) {
            ddlFailures[integrationId] -= 1
            return route.fulfill({ status: 503, json: { detail: { code: 'unavailable', message: 'Technical outage.' } } })
          }
          return route.fulfill({ json: backend.ddls[integrationId] ?? [] })
        }
        if (parts[2] === 'from-audit' && method === 'POST') {
          const errorCode = addAuditErrors.shift()
          if (errorCode) return route.fulfill({ status: 409, json: { detail: { code: errorCode, message: 'Sensitive backend detail.' } } })
          const added: Ddl = {
            ...sourceDdl,
            id: addedDdlId,
            title: 'Audit Notion ajouté',
            is_selected: false,
          }
          backend.ddls[integrationId] = [...(backend.ddls[integrationId] ?? []), added]
          return route.fulfill({ status: 201, json: added })
        }
        if (parts.length === 2 && method === 'POST') {
          const errorCode = importErrors.shift()
          if (errorCode) return route.fulfill({ status: 409, json: { detail: { code: errorCode, message: 'SQL supplied by user: SECRET.' } } })
          const payload = body as { title: string; content: string }
          const added: Ddl = {
            ...importedDdl,
            id: addedDdlId,
            title: payload.title,
            source_filename: null,
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
        if (parts.length === 3 && method === 'GET') {
          return route.fulfill({ json: { ...ddl, ddl_content: ddl.ddl_content ?? 'CREATE TABLE preview (id integer);' } })
        }
      }

      if (parts[1] === 'ingestion-candidates' && method === 'GET') {
        if ((candidateFailures[integrationId] ?? 0) > 0) {
          candidateFailures[integrationId] -= 1
          return route.fulfill({ status: 503, json: { detail: { code: 'unavailable', message: 'Technical outage.' } } })
        }
        return route.fulfill({ json: backend.candidates[integrationId] ?? [] })
      }

      if (parts[1] === 'ingestions') {
        if (parts.length === 2 && method === 'GET') return route.fulfill({ json: backend.ingestions[integrationId] ?? [] })
        if (parts.length === 3 && method === 'PUT') {
          const payload = body as { correlation_id: string }
          const previous = (backend.ingestions[integrationId] ?? []).find((item) => item.tenant_provider_record_id === parts[2])
          const selected = (backend.candidates[integrationId] ?? []).find((item) => item.correlation_id === payload.correlation_id)
          if (!selected) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })
          backend.ingestions[integrationId] = [selected]
          backend.candidates[integrationId] = [
            ...(backend.candidates[integrationId] ?? []).filter((item) => item.correlation_id !== selected.correlation_id),
            ...(previous ? [previous] : []),
          ]
          return route.fulfill({ json: selected })
        }
        if (parts.length === 3 && method === 'DELETE') {
          const previous = (backend.ingestions[integrationId] ?? []).find((item) => item.tenant_provider_record_id === parts[2])
          backend.ingestions[integrationId] = (backend.ingestions[integrationId] ?? []).filter((item) => item.tenant_provider_record_id !== parts[2])
          if (previous && !(backend.candidates[integrationId] ?? []).some((item) => item.correlation_id === previous.correlation_id)) {
            backend.candidates[integrationId] = [...(backend.candidates[integrationId] ?? []), previous]
          }
          return route.fulfill({ status: 204, body: '' })
        }
      }

      if (parts.length === 1 && method === 'PATCH') {
        const payload = body as { display_name?: string; design_note?: string | null }
        Object.assign(current, payload, { updated_at: '2026-09-18T10:00:00Z' })
        return route.fulfill({ json: current })
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

function ddlSection(page: Page) {
  return page.locator('section.versioned-integration__section').filter({ hasText: 'DDL disponibles' })
}

async function openDdlAction(page: Page, action: 'Ajouter depuis un audit' | 'Importer un DDL') {
  const section = ddlSection(page)
  await section.locator('.ui-action-menu > summary').click()
  await section.getByRole('button', { name: action, exact: true }).click()
}

test('shows the empty Active view when the backend has no active integration', async ({ page }) => {
  await openIntegration(page, {
    integrations: [],
    ddls: {},
    ingestions: {},
    candidates: {},
  })

  await page.getByRole('button', { name: 'Active', exact: true }).click()
  const integrationPanel = page.locator('section.versioned-integration')
  await expect(integrationPanel.getByRole('heading', { name: 'Aucune intégration active.', exact: true })).toBeVisible()
  await expect(integrationPanel.getByText('Une intégration apparaîtra ici après son activation.', { exact: true })).toBeVisible()
  await expect(integrationPanel.getByText('Actif', { exact: true })).toHaveCount(0)
  await expect(integrationPanel.getByText('Novalia Talents v1', { exact: true })).toHaveCount(0)
  await expect(integrationPanel.getByText('DDL sélectionné', { exact: true })).toHaveCount(0)
  await expect(integrationPanel.getByText('Sources de DDL', { exact: true })).toHaveCount(0)
  await expect(integrationPanel.getByText('Ingestions de référence', { exact: true })).toHaveCount(0)
  await expect(integrationPanel.getByText('Note de conception', { exact: true })).toHaveCount(0)
})

test('shows a genuinely active integration in the Active view', async ({ page }) => {
  await openIntegration(page, {
    integrations: [active],
    ddls: { [activeId]: [sourceDdl] },
    ingestions: { [activeId]: [n1] },
    candidates: { [activeId]: [] },
  })

  await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Novalia Talents v1', exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__version-heading').getByText('Actif', { exact: true })).toBeVisible()
  await expect(page.getByText('DDL sélectionné', { exact: true })).toBeVisible()
  await expect(page.getByText('Sources de DDL', { exact: true })).toBeVisible()
  await expect(page.getByText('Ingestions de référence', { exact: true })).toBeVisible()
  await expect(page.getByText('Note de conception', { exact: true })).toBeVisible()
})

test('shows zero drafts without creating one automatically', async ({ page }) => {
  const backend = await openIntegration(page, { integrations: [active] })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(page.getByText('Aucun brouillon en cours.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer une version vide', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cloner cette version', exact: true })).toBeVisible()
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(0)
})

for (const draftCount of [1, 2]) {
  test(`shows and resumes ${draftCount} existing draft${draftCount > 1 ? 's' : ''} without hiding creation choices`, async ({ page }) => {
    const drafts = draftCount === 1 ? [draft] : [draft, otherDraft]
    await openIntegration(page, { integrations: [active, ...drafts] })
    await page.getByRole('button', { name: 'Créer', exact: true }).click()
    const picker = page.getByRole('radiogroup', { name: 'Brouillons existants', exact: true })
    await expect(picker.getByRole('radio')).toHaveCount(draftCount)
    await expect(page.getByRole('button', { name: 'Créer une version vide', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cloner cette version', exact: true })).toBeVisible()
    const draftToResume = drafts[drafts.length - 1]
    await picker.getByRole('radio', { name: new RegExp(draftToResume.display_name) }).check()
    await expect(page.getByRole('heading', { name: draftToResume.display_name, exact: true })).toBeVisible()
  })
}

test('creates an empty version despite an existing draft and blocks double submission', async ({ page }) => {
  const backend = await openIntegration(page, { mutationDelay: 250 })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await page.getByLabel('Nouvelle version vide').fill('Version créée une fois')
  await page.getByRole('button', { name: 'Créer une version vide', exact: true }).dblclick()
  await expect(page.getByRole('heading', { name: 'Version créée une fois', exact: true })).toBeVisible()
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(1)
})

test('clones an existing version while another draft already exists', async ({ page }) => {
  const backend = await openIntegration(page)
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await page.getByLabel('Créer depuis une version').selectOption(activeId)
  await page.getByRole('button', { name: 'Cloner cette version', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Novalia Talents v3', exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__version-heading').getByText('Basée sur Novalia Talents v1 · v1', { exact: true })).toBeVisible()
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${activeId}/clone` && request.method === 'POST')).toHaveLength(1)
})

test('activates a draft from the canonical list and leaves exactly one active version', async ({ page }) => {
  const backend = await openIntegration(page)
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await page.getByRole('button', { name: 'Activer cette version', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer l’activation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: draft.display_name, exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__version-heading')).toContainText('Actif')
  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  const rows = page.locator('.versioned-integration__version-row')
  const archivedRow = rows.filter({ has: page.locator('strong').filter({ hasText: active.display_name }) })
  const activeRow = rows.filter({ has: page.locator('strong').filter({ hasText: draft.display_name }) })
  await expect(archivedRow).toContainText('Archivé')
  await expect(activeRow).toContainText('Actif')
  await expect(rows.filter({ hasText: 'Actif' })).toHaveCount(1)
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'GET')).toHaveLength(2)
})

test('maps duplicate_audit and keeps a first audit DDL unselected until explicit selection', async ({ page }) => {
  const backend = await openIntegration(page, {
    ddls: { [activeId]: [sourceDdl], [draftId]: [] },
    addAuditErrors: ['duplicate_audit'],
  })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await openDdlAction(page, 'Ajouter depuis un audit')
  const form = page.getByRole('region', { name: 'Ajouter un audit', exact: true })
  await form.getByLabel('Audit publié').selectOption('audit-notion-2026-09-16')
  await form.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Cet audit est déjà associé à cette version.', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Sensitive backend detail')
  await form.getByRole('button', { name: 'Ajouter', exact: true }).click()
  const addedRadio = page.getByRole('radio', { name: 'Sélectionner Audit Notion ajouté', exact: true })
  await expect(addedRadio).not.toBeChecked()
  await addedRadio.click()
  await expect(page.getByRole('radio', { name: 'Sélectionner Audit Notion ajouté', exact: true })).toBeChecked()
  expect(backend.requests.filter((request) => request.path.endsWith(`/ddls/${addedDdlId}/selection`) && request.method === 'PUT')).toHaveLength(1)
})

test('keeps a valid file after duplicate_title, then imports it unselected and resets the form', async ({ page }) => {
  await openIntegration(page, { importErrors: ['duplicate_title'] })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await openDdlAction(page, 'Importer un DDL')
  const form = page.getByRole('region', { name: 'Importer un DDL', exact: true })
  await form.getByLabel('Titre').fill('Titre existant')
  await form.getByLabel('Fichier .sql').setInputFiles({
    name: 'valid.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE valid_file (id integer);'),
  })
  await form.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Ce titre existe déjà. Choisissez un autre titre.')
  await expect(form.getByText('valid.sql', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('SQL supplied by user')
  await form.getByLabel('Titre').fill('Titre disponible')
  await form.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(form).toHaveCount(0)
  const importedRadio = page.getByRole('radio', { name: 'Sélectionner Titre disponible', exact: true })
  await expect(importedRadio).not.toBeChecked()
  await openDdlAction(page, 'Importer un DDL')
  const resetForm = page.getByRole('region', { name: 'Importer un DDL', exact: true })
  await expect(resetForm.getByLabel('Titre')).toHaveValue('')
  await expect(resetForm.getByLabel('Fichier .sql')).toHaveValue('')
})

test('maps duplicate_content and discards the file that cannot be imported', async ({ page }) => {
  await openIntegration(page, { importErrors: ['duplicate_content'] })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await openDdlAction(page, 'Importer un DDL')
  const form = page.getByRole('region', { name: 'Importer un DDL', exact: true })
  await form.getByLabel('Titre').fill('Contenu dupliqué')
  await form.getByLabel('Fichier .sql').setInputFiles({
    name: 'duplicate.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE duplicate_content (id integer);'),
  })
  await form.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Ce DDL est déjà présent dans l’intégration.')
  await expect(form.getByText('duplicate.sql', { exact: true })).toHaveCount(0)
  await expect(form.getByLabel('Fichier .sql')).toHaveValue('')
})

test('replaces a previously valid file with no file when the new selection is invalid', async ({ page }) => {
  await openIntegration(page)
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await openDdlAction(page, 'Importer un DDL')
  const form = page.getByRole('region', { name: 'Importer un DDL', exact: true })
  const validFile = { name: 'valid.sql', mimeType: 'text/plain', buffer: Buffer.from('CREATE TABLE valid_file (id integer);') }

  await form.getByLabel('Fichier .sql').setInputFiles(validFile)
  await expect(form.getByText('valid.sql', { exact: true })).toBeVisible()
  await form.getByLabel('Fichier .sql').setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not sql') })
  await expect(form.getByRole('alert')).toHaveText('Le fichier doit être au format .sql.')
  await expect(form.getByText('valid.sql', { exact: true })).toHaveCount(0)
  await expect(form.getByLabel('Fichier .sql')).toHaveValue('')

  await form.getByLabel('Fichier .sql').setInputFiles(validFile)
  await form.getByLabel('Fichier .sql').setInputFiles({ name: 'empty.sql', mimeType: 'text/plain', buffer: Buffer.from(' \n\t') })
  await expect(form.getByRole('alert')).toHaveText('Le fichier SQL est vide.')
  await expect(form.getByText('valid.sql', { exact: true })).toHaveCount(0)

  await form.getByLabel('Fichier .sql').setInputFiles(validFile)
  await form.getByLabel('Fichier .sql').setInputFiles({ name: 'large.sql', mimeType: 'text/plain', buffer: Buffer.alloc(1024 * 1024 + 1, 120) })
  await expect(form.getByRole('alert')).toHaveText('Le fichier dépasse la taille maximale de 1 MiB.')
  await expect(form.getByText('valid.sql', { exact: true })).toHaveCount(0)
})

test('reloads selected ingestions and candidates after PUT and DELETE without changing v1', async ({ page }) => {
  const backend = await openIntegration(page)
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  const ingestionSection = page.locator('section.versioned-integration__section').filter({ hasText: 'Ingestions de référence' })
  await expect(ingestionSection).toContainText('10 reçus')
  await ingestionSection.locator('.ui-action-menu > summary').click()
  await ingestionSection.getByRole('button', { name: /Choisir.*20 reçus/ }).click()
  const selectedSummary = ingestionSection.locator('.versioned-integration__ingestion-row > div > span')
  await expect(selectedSummary).toContainText('20 reçus')
  await expect(selectedSummary).not.toContainText('10 reçus')
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestions` && request.method === 'GET')).toHaveLength(2)
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestion-candidates` && request.method === 'GET')).toHaveLength(2)

  await ingestionSection.locator('.ui-action-menu > summary').click()
  await expect(ingestionSection.getByRole('button', { name: /Choisir.*10 reçus/ })).toBeVisible()
  await ingestionSection.getByRole('button', { name: 'Retirer la référence', exact: true }).click()
  await expect(ingestionSection).toContainText('Aucune ingestion choisie')
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestions` && request.method === 'GET')).toHaveLength(3)
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestion-candidates` && request.method === 'GET')).toHaveLength(3)

  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect(page.locator('.versioned-integration__readonly')).toContainText('10 reçus')
  await expect(page.locator('.versioned-integration__readonly')).not.toContainText('20 reçus')
})

test('distinguishes a structural DDL failure from an empty collection and recovers on retry', async ({ page }) => {
  await openIntegration(page, {
    ddls: { [activeId]: [sourceDdl], [draftId]: [] },
    ddlFailures: { [draftId]: 1 },
  })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  const section = ddlSection(page)
  const failure = section.getByRole('alert')
  await expect(failure).toContainText('Impossible de charger les DDL de cette version.')
  await expect(section).not.toContainText('Aucun DDL n’est encore associé à cette version.')
  await failure.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(section.getByText('Aucun DDL n’est encore associé à cette version.', { exact: true })).toBeVisible()
  await expect(failure).toHaveCount(0)
})

test('treats a candidates failure as structural and reloads both ingestion collections on retry', async ({ page }) => {
  const backend = await openIntegration(page, { candidateFailures: { [draftId]: 1 } })
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  const section = page.locator('section.versioned-integration__section').filter({ hasText: 'Ingestions de référence' })
  const failure = section.getByRole('alert')
  await expect(failure).toContainText('Impossible de charger les ingestions de référence.')
  await expect(section).not.toContainText('Aucune ingestion de référence choisie.')
  await failure.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(section).toContainText('10 reçus')
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestions` && request.method === 'GET')).toHaveLength(2)
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ingestion-candidates` && request.method === 'GET')).toHaveLength(2)
})

test('never lets a late response from version A overwrite version B', async ({ page }) => {
  const slowDraft = integration(draftId, 2, 'draft', 'Version A lente')
  const fastDraft = integration(otherDraftId, 3, 'draft', 'Version B rapide')
  const slowDdl = { ...importedDdl, id: importedDdlId, title: 'DDL lent A' }
  const fastDdl = { ...importedDdl, id: addedDdlId, title: 'DDL rapide B' }
  await openIntegration(page, {
    integrations: [active, slowDraft, fastDraft],
    ddls: { [activeId]: [sourceDdl], [draftId]: [slowDdl], [otherDraftId]: [fastDdl] },
    ingestions: { [activeId]: [n1], [draftId]: [n1], [otherDraftId]: [n2] },
    candidates: { [activeId]: [], [draftId]: [n2], [otherDraftId]: [] },
    slowIntegrationIds: [draftId],
    slowDelay: 650,
  })
  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  await page.getByRole('button', { name: /Version A lente/ }).click()
  await page.getByRole('button', { name: /Version B rapide/ }).click()
  await expect(page.getByRole('heading', { name: 'Version B rapide', exact: true })).toBeVisible()
  await expect(page.getByText('DDL rapide B', { exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__readonly')).toContainText('20 reçus')
  await page.waitForTimeout(800)
  await expect(page.getByRole('heading', { name: 'Version B rapide', exact: true })).toBeVisible()
  await expect(page.getByText('DDL lent A', { exact: true })).toHaveCount(0)
  await expect(page.locator('.versioned-integration__readonly')).not.toContainText('10 reçus')
})

test('shows real DDL radios only for drafts and keeps read-only DDLs identifiable and previewable', async ({ page }) => {
  const archivedVersion = { ...archived, version_number: 3, display_name: 'Novalia historique v3' }
  const archivedDdl = { ...sourceDdl, title: 'Audit archivé', source_audit_title: 'Audit archivé' }
  await openIntegration(page, {
    integrations: [active, draft, archivedVersion],
    ddls: { [activeId]: [sourceDdl], [draftId]: [importedDdl], [archivedId]: [archivedDdl] },
  })

  const activeLibrary = ddlSection(page)
  await expect(activeLibrary.locator('input[type="radio"]')).toHaveCount(0)
  await expect(activeLibrary.locator('.versioned-integration__ddl-radio')).toHaveCount(0)
  await expect(activeLibrary.getByText('Sélectionné', { exact: true })).toBeVisible()
  const activeTitle = activeLibrary.locator('.versioned-integration__ddl-title').filter({ hasText: 'Audit Notion' })
  await expect(activeTitle).toBeVisible()
  await activeTitle.click()
  await expect(page.getByRole('region', { name: 'Aperçu de Audit Notion', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  const draftLibrary = ddlSection(page)
  await expect(draftLibrary.locator('input[type="radio"]')).toHaveCount(1)
  await expect(draftLibrary.getByRole('radio', { name: 'Sélectionner DDL importé v2', exact: true })).toBeVisible()
  await expect(draftLibrary.locator('.versioned-integration__ddl-radio')).toHaveCount(0)

  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  await page.getByRole('button', { name: /Novalia historique v3/ }).click()
  const archivedLibrary = ddlSection(page)
  await expect(archivedLibrary.locator('input[type="radio"]')).toHaveCount(0)
  await expect(archivedLibrary.locator('.versioned-integration__ddl-radio')).toHaveCount(0)
  await expect(archivedLibrary.getByText('Sélectionné', { exact: true })).toBeVisible()
  const archivedTitle = archivedLibrary.locator('.versioned-integration__ddl-title').filter({ hasText: 'Audit archivé' })
  await expect(archivedTitle).toBeVisible()
  await archivedTitle.click()
  await expect(page.getByRole('region', { name: 'Aperçu de Audit archivé', exact: true })).toBeVisible()
})

test('keeps an archived tenant fully consultable and entirely read-only', async ({ page }) => {
  const backend = await openIntegration(page, {
    tenantStatus: 'archived',
    integrations: [active, archived],
    ddls: { [activeId]: [sourceDdl], [archivedId]: [{ ...sourceDdl }] },
    ingestions: { [activeId]: [n1], [archivedId]: [n2] },
    candidates: { [activeId]: [], [archivedId]: [] },
  })
  await expect(page.getByRole('heading', { name: active.display_name, exact: true })).toBeVisible()
  await expect(page.getByText('Audit Notion', { exact: true }).first()).toBeVisible()
  await page.locator('.versioned-integration__ddl-title').first().click()
  await expect(page.getByRole('region', { name: 'Aperçu de Audit Notion', exact: true })).toContainText('CREATE TABLE source_table')
  await expect(page.getByRole('radio', { name: /Sélectionner/ })).toHaveCount(0)
  await expect(ddlSection(page).locator('.ui-action-menu')).toHaveCount(0)
  await page.getByRole('button', { name: 'Versions', exact: true }).click()
  await page.getByRole('button', { name: /Novalia historique/ }).click()
  await expect(page.getByRole('heading', { name: 'Novalia historique', exact: true })).toBeVisible()
  await expect(page.locator('.versioned-integration__readonly')).toContainText('20 reçus')
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Client archivé', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer une version vide', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cloner cette version', exact: true })).toHaveCount(0)
  expect(backend.requests.filter((request) => request.path.startsWith(`${prefix}/integrations`) && request.method !== 'GET')).toHaveLength(0)
})

for (const width of [1440, 390]) {
  test(`keeps the version workflow within the viewport at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await openIntegration(page, { integrations: [active, draft, otherDraft] })
    const readOnlyLibrary = ddlSection(page)
    const readOnlyRow = readOnlyLibrary.locator('.versioned-integration__ddl-row').first()
    await expect(readOnlyRow).toBeVisible()
    await expect(readOnlyRow.locator('input[type="radio"], .versioned-integration__ddl-radio')).toHaveCount(0)
    const rowBox = await readOnlyRow.boundingBox()
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(rowBox).not.toBeNull()
    expect(rowBox!.x).toBeGreaterThanOrEqual(0)
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(clientWidth)
    await page.screenshot({ path: testInfo.outputPath(`integration-readonly-${width}.png`), fullPage: true })
    await page.locator('.versioned-integration__ddl-title').first().click()
    await expect(page.getByRole('region', { name: 'Aperçu de Audit Notion', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Créer', exact: true }).click()
    await expect(page.getByRole('radiogroup', { name: 'Brouillons existants', exact: true }).getByRole('radio')).toHaveCount(2)
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
    await page.screenshot({ path: testInfo.outputPath(`integration-${width}.png`), fullPage: true })
  })
}
