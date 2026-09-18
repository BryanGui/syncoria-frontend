import { test, expect, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const activeId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'
const archivedId = '55555555-5555-4555-8555-555555555555'
const sourceDdlId = '66666666-6666-4666-8666-666666666666'
const importedDdlId = '77777777-7777-4777-8777-777777777777'
const generatedDdlId = '88888888-8888-4888-8888-888888888888'
const generatedDraftId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const providerRecordId = '99999999-9999-4999-8999-999999999999'
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
const archived = integration(archivedId, 3, 'archived', 'Novalia historique', {
  namespace_key: 'v3',
  selected_ddl_id: sourceDdlId,
})

const sourceDdl: Ddl = {
  id: sourceDdlId,
  title: 'Notion — Audit Notion — 2026-09-16 [abc123]',
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
  title: 'novalia-modele-v1.sql',
  kind: 'imported',
  source_report_id: null,
  source_filename: null,
  created_at: '2026-09-17T10:00:00Z',
  is_selected: false,
  source_provider: null,
  source_audit_title: null,
  source_report_date: null,
  ddl_content: '-- imported\nCREATE TABLE v1_table (id integer);\n',
}

const ingestion: Ingestion = {
  tenant_provider_record_id: providerRecordId,
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

interface BackendOptions {
  tenantStatus?: 'active' | 'archived'
  integrations?: Integration[]
  ddls?: Record<string, Ddl[]>
  ingestions?: Record<string, Ingestion[]>
}

interface MockBackend {
  integrations: Integration[]
  ddls: Record<string, Ddl[]>
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
  const backend: MockBackend = {
    integrations,
    ddls: copyCollections(options.ddls ?? {
      [activeId]: [sourceDdl],
      [draftId]: [importedDdl],
    }),
    requests: [],
  }
  const ingestions = copyCollections(options.ingestions ?? {
    [activeId]: [ingestion],
    [draftId]: [],
  })
  for (const item of integrations) {
    backend.ddls[item.id] ??= []
    ingestions[item.id] ??= []
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
    if (url.pathname === `${prefix}/reports`) return route.fulfill({ json: [{
      id: 'audit-notion-2026-09-16',
      title: 'Audit Notion',
      provider: 'notion',
      correlation_id: correlationId,
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
        const created = integration(
          generatedDraftId, 2, 'draft', 'Client synthétique v2',
          { based_on_integration_id: null, selected_ddl_id: null },
        )
        backend.integrations.unshift(created)
        backend.ddls[created.id] = []
        ingestions[created.id] = []
        return route.fulfill({ status: 201, json: created })
      }
    }

    const integrationPath = `${prefix}/integrations/`
    if (url.pathname.startsWith(integrationPath)) {
      const parts = url.pathname.slice(integrationPath.length).split('/')
      const integrationId = parts[0]
      const current = backend.integrations.find((item) => item.id === integrationId)
      if (!current) return route.fulfill({ status: 404, json: { detail: { code: 'not_found', message: 'Not found.' } } })

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
  await expect(page.getByRole('heading', { name: 'Étape 1 — Choisir un DDL', exact: true })).toBeVisible()
}

function ddlList(page: Page) {
  return page.locator('[aria-label="DDL disponibles"]')
}

function importedRow(page: Page, title: string) {
  return page.locator('.versioned-integration__ddl-row--imported').filter({ hasText: title })
}

test('shows only the product language for step one and does not create a draft on open', async ({ page }) => {
  const backend = await openIntegration(page, {
    integrations: [active],
    ddls: { [activeId]: [sourceDdl] },
  })
  await openCreate(page)

  await expect(page.getByRole('heading', { name: 'Intégration', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Charger un DDL', exact: true })).toBeVisible()
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
})

test('shows the audit DDL as selectable default provenance without mutation actions', async ({ page }) => {
  await openIntegration(page)
  await openCreate(page)

  const row = page.locator('.versioned-integration__ddl-row').filter({ hasText: 'DDL audit — Audit Notion' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Source : Audit', { exact: true })).toBeVisible()
  await expect(row.getByText('Par défaut', { exact: true })).toBeVisible()
  await expect(row.getByRole('radio', { name: 'Sélectionner DDL audit — Audit Notion', exact: true })).toBeVisible()
  await expect(row.locator('.ui-action-menu')).toHaveCount(0)
  await expect(row.getByRole('button', { name: /Renommer|Supprimer/ })).toHaveCount(0)
})

test('loads a SQL file under its exact filename into the same list with a hidden draft', async ({ page }) => {
  const backend = await openIntegration(page, {
    integrations: [active],
    ddls: { [activeId]: [sourceDdl] },
  })
  await openCreate(page)

  await expect(page.getByLabel('Titre')).toHaveCount(0)
  await page.getByLabel('Fichier DDL à charger').setInputFiles({
    name: `${'x'.repeat(117)}.sql`,
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE rejected_title (id integer);'),
  })
  await expect(page.getByText('Le nom du fichier doit contenir au maximum 120 octets UTF-8.', { exact: true })).toBeVisible()
  expect(backend.requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  await page.getByLabel('Fichier DDL à charger').setInputFiles({
    name: 'novalia-modele-v2.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('CREATE TABLE novalia_v2 (id integer);'),
  })

  const list = ddlList(page)
  await expect(list.getByText('DDL audit — Audit Notion', { exact: true })).toBeVisible()
  await expect(list.getByText('novalia-modele-v2.sql', { exact: true })).toBeVisible()
  const imports = backend.requests.filter((request) => request.path.endsWith('/ddls') && request.method === 'POST')
  expect(imports).toHaveLength(1)
  expect(imports[0].body).toEqual({
    title: 'novalia-modele-v2.sql',
    content: 'CREATE TABLE novalia_v2 (id integer);',
  })
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations` && request.method === 'POST')).toHaveLength(1)
  expect(backend.integrations.find((item) => item.id === generatedDraftId)?.status).toBe('draft')
  expect(backend.integrations.some((item) => item.id === generatedDraftId && item.status === 'active')).toBe(false)
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
  const patches = backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ddls/${importedDdlId}` && request.method === 'PATCH')
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
  expect(backend.requests.filter((request) => request.path === `${prefix}/integrations/${draftId}/ddls/${importedDdlId}` && request.method === 'DELETE')).toHaveLength(1)
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
  await activeLibrary.locator('.versioned-integration__ddl-title').click()
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
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
    await page.screenshot({ path: testInfo.outputPath(`integration-ddl-step-${viewport.width}.png`), fullPage: true })
  })
}
