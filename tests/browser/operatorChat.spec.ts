import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const a = '11111111-1111-4111-8111-111111111111',
  b = '33333333-3333-4333-8333-333333333333',
  thread = '22222222-2222-4222-8222-222222222222'
const now = '2026-10-02T10:00:00Z'
function threadRecord(tenant = a, status = 'active') {
  return {
    thread_id: thread,
    tenant_id: tenant,
    operator_subject: 'admin',
    runtime_provider: 'codex',
    runtime_thread_ref: null,
    status,
    title: null,
    created_at: now,
    updated_at: now,
    archived_at: status === 'archived' ? now : null,
  }
}
function message(role = 'assistant', content = 'Conseil visible', tenant = a) {
  return {
    message_id: role === 'user' ? b : thread,
    tenant_id: tenant,
    thread_id: thread,
    role,
    content,
    created_at: now,
    correlation_id: thread,
  }
}

function settingsProfile(
  settings: {
    model: string
    reasoning_effort: string
    capabilities: {
      shell: boolean
      workspace: boolean
      python: boolean
      multi_agent: boolean
    }
    mcp_concurrency: number
    tool_budget: number
    timeout_seconds: number
  },
  revision = 1,
) {
  return {
    revision,
    settings,
    defaults: {
      ...settings,
      model: 'catalogue-test-model',
      reasoning_effort: 'medium',
      capabilities: { shell: true, workspace: true, python: true, multi_agent: false },
      mcp_concurrency: 2,
      tool_budget: 16,
      timeout_seconds: 300,
    },
    catalogue: {
      models: [
        {
          id: 'catalogue-test-model',
          label: 'Modèle test autorisé',
          reasoning_efforts: ['medium', 'high', 'ultra'],
          default_reasoning_effort: 'medium',
        },
        {
          id: 'other-test-model',
          label: 'Autre modèle autorisé',
          reasoning_efforts: ['low', 'high'],
          default_reasoning_effort: 'low',
        },
      ],
      preferred_model_id: null as string | null,
      astra_available: false,
      astra_reason: 'Absent du catalogue de test connecté.' as string | null,
      runtime_version: 'synthetic-test',
    },
    capabilities: [
      ...Object.keys(settings.capabilities).map((id) => ({
        id,
        label: id === 'shell' ? 'Shell' : id,
        supported: true,
        reason: null,
      })),
      {
        id: 'web_search',
        label: 'Web Search',
        supported: false,
        reason: 'Runtime privé',
      },
      {
        id: 'syncoria_mcp',
        label: 'MCP Syncoria',
        supported: true,
        reason: 'Politique interne',
      },
    ],
    mcp: [
      { name: 'syncoria_provider_request', read_only: true },
      { name: 'syncoria_chat_memory_search', read_only: true },
    ],
    bounds: {
      mcp_concurrency: { min: 1, max: 4 },
      tool_budget: { min: 1, max: 32 },
      timeout_seconds: { min: 30, max: 900 },
    },
    validation_error: null,
  }
}

async function connect(
  page: Page,
  options: { bindingMissing?: boolean; registryUnavailable?: boolean } = {},
) {
  const state = {
    publicPrivacy: false,
    foreign: false,
    error: false,
    expired: false,
    cancel: 0,
    sends: 0,
    archive: 0,
    slow: false,
    archived: false,
    title: null as string | null,
    bindingMissing: options.bindingMissing ?? false,
    registryUnavailable: options.registryUnavailable ?? false,
    astraAvailable: false,
    catalogueMissing: false,
    diagnostics: [] as unknown[],
    settingsStatus: 200,
    settingsCalls: 0,
    internalRequests: [] as string[],
    revision: 1,
    settings: {
      model: 'catalogue-test-model',
      reasoning_effort: 'medium',
      capabilities: { shell: true, workspace: true, python: true, multi_agent: false },
      mcp_concurrency: 2,
      tool_budget: 16,
      timeout_seconds: 300,
    },
    capabilities: {
      shell: true,
      workspace: true,
      python: true,
      multi_agent: false,
    },
  }
  await page.route('https://api.bryanlab.ovh/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method()
    if (path === '/client/me') return route.fulfill({ status: 401, json: {} })
    if (path === '/admin/session')
      return route.fulfill({ json: { authenticated: true } })
    if (path === '/admin/tenants')
      return route.fulfill({
        status: state.registryUnavailable ? 503 : 200,
        json: state.registryUnavailable
          ? {}
          : [
              { id: a, slug: 'a', name: 'Client A', status: 'active' },
              { id: b, slug: 'b', name: 'Client B', status: 'active' },
            ],
      })
    if (path.includes('/operator-chat/')) {
      if (state.expired) return route.fulfill({ status: 401, json: {} })
      state.internalRequests.push(`${method} ${path}`)
      expect(path.startsWith('/admin/operator-chat/internal/')).toBe(true)
      const tenant = a
      if (path.endsWith('/context'))
        return route.fulfill({
          status: state.bindingMissing ? 503 : 200,
          json: state.bindingMissing
            ? { detail: 'Internal binding unavailable' }
            : { tenant_id: a },
        })
      if (path.endsWith('/settings') || path.endsWith('/settings/reset')) {
        if (state.catalogueMissing)
          return route.fulfill({
            status: 503,
            json: { detail: 'Private runtime detail' },
          })
        if (method !== 'GET') {
          state.settingsCalls++
          if (state.settingsStatus !== 200)
            return route.fulfill({
              status: state.settingsStatus,
              json: { detail: 'Private internal details' },
            })
          const body = route.request().postDataJSON()
          expect(body.revision).toBe(state.revision)
          state.settings = path.endsWith('/reset')
            ? {
                ...state.settings,
                model: 'catalogue-test-model',
                reasoning_effort: 'medium',
                capabilities: {
                  shell: true,
                  workspace: true,
                  python: true,
                  multi_agent: false,
                },
                mcp_concurrency: 2,
                tool_budget: 16,
                timeout_seconds: 300,
              }
            : body.settings
          state.revision++
        }
        const profile = settingsProfile(state.settings, state.revision)
        if (state.astraAvailable) {
          profile.catalogue.models.push({
            id: 'catalogue-astra-observed',
            label: 'Astra test runtime',
            reasoning_efforts: ['medium', 'high'],
            default_reasoning_effort: 'medium',
          })
          profile.catalogue.preferred_model_id = 'catalogue-astra-observed'
          profile.catalogue.astra_available = true
          profile.catalogue.astra_reason = null
        }
        return route.fulfill({ json: profile })
      }
      if (path.endsWith('/diagnostics'))
        return route.fulfill({ json: state.diagnostics })
      if (path.endsWith('/memory') && method === 'POST')
        return route.fulfill({
          json: { id: b, ...route.request().postDataJSON(), created_at: now },
        })
      if (path.endsWith('/memory/search'))
        return route.fulfill({
          json: [
            {
              thread_id: thread,
              title: 'Incident synthétique',
              archived: true,
              kind: 'resolution',
              content: 'Résolution synthétique',
              rank: 1,
            },
          ],
        })
      if (path.endsWith('/threads'))
        return route.fulfill({
          status: method === 'POST' ? 201 : 200,
          json:
            method === 'POST'
              ? threadRecord(tenant)
              : tenant === a
                ? new URL(route.request().url()).searchParams.get('status') ===
                  'archived'
                  ? state.archived
                    ? [{ ...threadRecord(a, 'archived'), title: state.title }]
                    : []
                  : state.archived
                    ? []
                    : [{ ...threadRecord(), title: state.title }]
                : [],
        })
      if (path.endsWith('/cancel')) {
        state.cancel++
        return route.fulfill({ json: { status: 'cancel_requested' } })
      }
      if (path.endsWith('/archive')) {
        state.archive++
        state.archived = true
        return route.fulfill({ json: threadRecord(tenant, 'archived') })
      }
      if (path.endsWith('/restore')) {
        state.archived = false
        return route.fulfill({
          json: { ...threadRecord(tenant), title: state.title },
        })
      }
      if (method === 'PATCH') {
        state.title = route.request().postDataJSON().title
        return route.fulfill({
          json: { ...threadRecord(tenant), title: state.title },
        })
      }
      if (path.endsWith('/messages')) {
        state.sends++
        if (!state.title) state.title = 'Préparer le rendez-vous'
        if (state.slow) await new Promise((resolve) => setTimeout(resolve, 700))
        const terminal = state.cancel
          ? { type: 'cancelled' }
          : state.error
            ? {
                type: 'error',
                code: 'runtime_unavailable',
                message: "La réponse n'a pas pu être terminée.",
              }
            : { type: 'completed' }
        const events = [
          {
            type: 'message_started',
            message: message('user', 'Prépare le rendez-vous', tenant),
            correlation_id: thread,
          },
          {
            type: 'context_ready',
            advisory: true,
            estate: true,
            integrations: 2,
            partial: true,
          },
          { type: 'runtime_state', status: 'running' },
          {
            type: 'tool_started',
            tool: 'shell',
            label: 'Exécution sandbox',
            status: 'running',
          },
          {
            type: 'tool_completed',
            tool: 'shell',
            label: 'Exécution sandbox',
            status: 'completed',
          },
          {
            type: 'privacy_state_changed',
            state: state.publicPrivacy ? 'public' : 'private',
          },
          ...(!state.error && !state.cancel
            ? [
                { type: 'assistant_delta', text: 'Conseil ' },
                { type: 'assistant_delta', text: 'visible' },
              ]
            : []),
          ...(!state.error && !state.cancel
            ? [
                {
                  type: 'assistant_message',
                  message: message('assistant', 'Conseil visible', tenant),
                },
              ]
            : []),
          terminal,
        ]
        return route.fulfill({
          contentType: 'text/event-stream',
          body: events
            .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
            .join(''),
        })
      }
      return route.fulfill({
        json: {
          thread: {
            ...threadRecord(tenant, state.archived ? 'archived' : 'active'),
            title: state.title,
          },
          messages: [
            message(
              'assistant',
              state.foreign ? 'FOREIGN_SENTINEL' : 'Historique visible',
              state.foreign ? b : tenant,
            ),
          ],
          next_before: null,
        },
      })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Assistant Syncoria', exact: true }).click()
  await expect(page.getByLabel('Client actif')).toHaveCount(0)
  return state
}

interface PendingTurnFixture {
  sends: number
  cancelCalls: number
  acknowledged: boolean
  acknowledge: () => void
  rejectAdmission: () => void
  releaseCancel: () => void
}
declare global {
  interface Window {
    operatorPendingTurn: PendingTurnFixture
  }
}

// Control admission, SSE completion and the cancel response independently.
// A buffered route.fulfill response cannot reproduce these distinct phases.
async function pendingTurn(page: Page, failFirstCancel = false) {
  await page.evaluate(({ messageStarted, failFirstCancel }) => {
    const originalFetch = window.fetch.bind(window)
    const encoder = new TextEncoder()
    let respond: ((response: Response) => void) | null = null
    let cancelRespond: ((response: Response) => void) | null = null
    let stream: ReadableStreamDefaultController<Uint8Array> | null = null
    const frame = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    const fixture: PendingTurnFixture = {
      sends: 0,
      cancelCalls: 0,
      acknowledged: false,
      acknowledge() {
        fixture.acknowledged = true
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller
            controller.enqueue(frame(messageStarted))
          },
        })
        respond!(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
      },
      rejectAdmission() {
        respond!(Response.json({}, { status: 503 }))
      },
      releaseCancel() {
        cancelRespond!(Response.json({ status: 'cancel_requested' }))
      },
    }
    window.operatorPendingTurn = fixture
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/messages') && init?.method === 'POST') {
        fixture.sends++
        if (fixture.sends === 1)
          return new Promise<Response>((resolve) => { respond = resolve })
      }
      if (url.endsWith('/cancel') && init?.method === 'POST') {
        fixture.cancelCalls++
        // As with the server, cancellation before admission is a harmless no-op.
        if (!fixture.acknowledged)
          return Response.json({ status: 'cancel_requested' })
        if (failFirstCancel && fixture.cancelCalls === 1)
          return Response.json({}, { status: 503 })
        stream!.enqueue(frame({ type: 'cancelled' }))
        stream!.close()
        return new Promise<Response>((resolve) => { cancelRespond = resolve })
      }
      return originalFetch(input, init)
    }
  }, {
    messageStarted: {
      type: 'message_started',
      message: message('user', 'Tour avec acquittement contrôlé'),
      correlation_id: thread,
    },
    failFirstCancel,
  })
}

test('new thread, send, confirmed tools, final, resume and archive', async ({
  page,
}) => {
  const state = await connect(page)
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  await expect(
    page.getByText('Assistant interne privé — accès Web public désactivé'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await expect(page.getByText('Recherche publique disponible')).toHaveCount(0)
  await page.getByLabel('Message opérateur').fill('Prépare le rendez-vous')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Préparer le rendez-vous' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Terminé')

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await mkdir('docs/screenshots/operator-chat', { recursive: true })
  await page.screenshot({
    path: 'docs/screenshots/operator-chat/chat-desktop.png',
    fullPage: false,
  })
  await page
    .getByRole('navigation', { name: 'Conversations récentes' })
    .getByRole('button')
    .first()
    .click()
  await expect(page.getByText('Historique visible', { exact: true })).toBeVisible()

  await expect(page.getByText('Recherche publique disponible')).toHaveCount(0)
  await page.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  expect(state.archive).toBe(1)
})
test('runtime error and early Stop keep final responses absent and wait for cancel before the next turn', async ({ page }) => {
  const state = await connect(page)
  state.error = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Hello')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    "La réponse n'a pas pu être terminée.",
  )
  state.error = false
  await pendingTurn(page)
  await page.getByLabel('Message opérateur').fill('Continue')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(0)
  await page.evaluate(() => window.operatorPendingTurn.acknowledge())
  await expect.poll(() => page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(1)
  await expect(page.getByRole('status')).toHaveText('Réponse interrompue')
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(0)
  // The stream has ended, but a late /cancel response must still block new work.
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Nouveau chat', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  await page.evaluate(() => window.operatorPendingTurn.releaseCancel())
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await page.getByLabel('Message opérateur').fill('Tour suivant')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(1)
  expect(await page.evaluate(() => window.operatorPendingTurn.sends)).toBe(2)
})

test('failed Stop can be explicitly retried without automatically repeating cancellation', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await pendingTurn(page, true)
  await page.getByLabel('Message opérateur').fill('Tour à arrêter')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.evaluate(() => window.operatorPendingTurn.acknowledge())
  await expect(page.getByText('Tour avec acquittement contrôlé', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText("La réponse n'a pas pu être terminée.")
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(1)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(2)
  await page.evaluate(() => window.operatorPendingTurn.releaseCancel())
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Réponse interrompue')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('an early Stop is discarded when turn admission fails and cannot cancel the next turn', async ({ page }) => {
  await connect(page)
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await pendingTurn(page)
  await page.getByLabel('Message opérateur').fill('Tour refusé')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.evaluate(() => window.operatorPendingTurn.rejectAdmission())
  await expect(page.getByRole('alert')).toHaveText("La réponse n'a pas pu être terminée.")
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(0)
  await page.getByLabel('Message opérateur').fill('Tour suivant')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.operatorPendingTurn.cancelCalls)).toBe(0)
})
test('foreign history fails closed without exposing or selecting another scope', async ({
  page,
}) => {
  const state = await connect(page)
  state.foreign = true
  await page
    .getByRole('navigation', { name: 'Conversations récentes' })
    .getByRole('button')
    .first()
    .click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('FOREIGN_SENTINEL')).toHaveCount(0)
  await expect(page.getByLabel('Client actif')).toHaveCount(0)
  expect(state.internalRequests.every((path) => !path.includes('/tenants/'))).toBe(true)
})
test('late stream after leaving the assistant is discarded', async ({ page }) => {
  const state = await connect(page)
  state.slow = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Hello')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Navigation opérateur' })
    .getByRole('button', { name: 'Clients', exact: true })
    .click()
  await expect(page.getByLabel('Message opérateur')).toHaveCount(0)
  await page.waitForTimeout(850)
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(0)
})
test('expired operator session returns to login', async ({ page }) => {
  const state = await connect(page)
  await expect(
    page
      .getByRole('navigation', { name: 'Conversations récentes' })
      .getByRole('button'),
  ).toHaveCount(1)
  state.expired = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Nouveau chat', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', {
      name: 'Pilotez le parc IA de vos entreprises clientes.',
    }),
  ).toBeVisible()
})
test('mobile composer stays visible and assistant has no demo controls', async ({
  page,
}) => {
  const state = await connect(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: 'Conversations récentes' }),
  ).toBeHidden()
  await expect(page.getByLabel('Message opérateur')).toBeEnabled()
  await page.getByLabel('Message opérateur').fill('Prépare le rendez-vous')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Préparer le rendez-vous' }),
  ).toBeVisible()
  const answer = await page.getByText('Conseil visible', { exact: true }).boundingBox()
  const composer = await page.getByLabel('Message opérateur').boundingBox()
  expect(answer && composer && answer.y + answer.height < composer.y).toBe(true)
  expect(composer && composer.y + composer.height <= 844).toBe(true)
  await mkdir('docs/screenshots/operator-chat', { recursive: true })
  await page.screenshot({
    path: 'docs/screenshots/operator-chat/chat-390.png',
    fullPage: false,
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await expect(page.getByRole('button', { name: 'Démo synthétique' })).toHaveCount(0)
  expect(state.sends).toBe(1)
})

test('public privacy event fails closed in tenant chat', async ({ page }) => {
  const state = await connect(page)
  state.publicPrivacy = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Message client privé')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Recherche publique disponible')).toHaveCount(0)
})

test('titles, archive consultation, diagnostics, profile and memory workspace', async ({
  page,
}) => {
  await connect(page)
  await page
    .getByRole('navigation', { name: 'Conversations récentes' })
    .getByRole('button')
    .first()
    .click()
  await page.getByRole('button', { name: 'Renommer', exact: true }).click()
  await page.getByLabel('Titre de conversation').fill('Incident synthétique')
  await page.getByRole('button', { name: 'Enregistrer le titre' }).click()
  await expect(
    page.getByRole('heading', { name: 'Incident synthétique' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Archiver', exact: true }).click()
  await page.getByRole('button', { name: 'Archives', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Conversations archivées' })
    .getByRole('button')
    .click()
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Diagnostic des tours' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByLabel(/Web Search/)).toBeDisabled()
  await page.getByLabel(/^Shell/).click()
  await expect(page.getByLabel(/^workspace/)).not.toBeChecked()
  await expect(page.getByLabel(/^python/)).not.toBeChecked()
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(
    page.getByText('Réglages enregistrés pour les prochains tours.'),
  ).toBeVisible()
  await page
    .getByRole('button', {
      name: 'Restaurer les paramètres Syncoria par défaut',
    })
    .click()
  await expect(page.getByLabel(/^Shell/)).toBeChecked()
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await page.getByRole('button', { name: 'Rechercher dans la mémoire' }).click()
  await page.getByLabel('Type de mémoire').selectOption('resolution')
  await page.getByLabel('Élément à mémoriser').fill('Résolution synthétique')
  await page.getByRole('button', { name: 'Enregistrer dans la mémoire' }).click()
  await expect(
    page.getByText('Élément enregistré dans la mémoire interne.'),
  ).toBeVisible()
  await page.getByLabel('Rechercher un problème similaire').fill('incident')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByText('Résolution synthétique')).toBeVisible()
  await page.getByRole('button', { name: 'Consulter la conversation' }).click()
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click()
  await expect(page.getByLabel('Message opérateur')).toBeEnabled()
})

test('mobile panels cover the composer and keep settings and close usable', async ({
  page,
}) => {
  await connect(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('navigation', { name: 'Conversations récentes' })
    .getByRole('button')
    .first()
    .click()
  await expect(
    page.getByRole('navigation', { name: 'Conversations récentes' }),
  ).toBeHidden()
  await page.getByRole('button', { name: 'Conversations et outils' }).click()
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await page
    .getByRole('button', {
      name: 'Restaurer les paramètres Syncoria par défaut',
    })
    .click()
  await expect(page.getByLabel(/^Shell/)).toBeChecked()
  const panel = await page
    .getByRole('region', { name: 'Réglages de l’agent' })
    .boundingBox()
  expect(panel && panel.y === 0 && panel.height === 844).toBe(true)
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await expect(page.getByLabel('Message opérateur')).toBeVisible()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  await expect(
    page.getByText('Assistant interne privé — accès Web public désactivé'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
})

test('assistant opens directly even when the client registry is unavailable', async ({
  page,
}) => {
  const state = await connect(page, { registryUnavailable: true })
  await expect(
    page.getByRole('button', { name: 'Nouveau chat', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Client actif')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Démo synthétique' })).toHaveCount(0)
  await expect(page.getByText('Registre indisponible.', { exact: false })).toHaveCount(
    0,
  )
  expect(state.internalRequests.every((path) => !path.includes('/tenants/'))).toBe(true)
})

test('missing or archived binding fails explicitly without selecting a client and can be retried', async ({
  page,
}) => {
  const state = await connect(page, { bindingMissing: true })
  await expect(page.getByRole('alert')).toContainText(
    'L’espace interne est indisponible ou archivé.',
  )
  await expect(page.getByLabel('Message opérateur')).toHaveCount(0)
  expect(state.internalRequests).toEqual(['GET /admin/operator-chat/internal/context'])
  state.bindingMissing = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Nouveau chat', exact: true }),
  ).toBeVisible()
})

test('settings persist valid model effort and real advanced limits without changing global profiles', async ({
  page,
}) => {
  const state = await connect(page)
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByText(/Astra indisponible/)).toBeVisible()
  await page.getByLabel('Modèle', { exact: true }).selectOption('other-test-model')
  await expect(page.getByLabel('Effort de raisonnement')).toHaveValue('low')
  await expect(
    page.getByLabel('Effort de raisonnement').getByRole('option'),
  ).toHaveCount(2)
  await page.getByRole('button', { name: 'Proposer un effort élevé' }).click()
  await expect(page.getByLabel('Effort de raisonnement')).toHaveValue('high')
  await page.getByText('Réglages avancés', { exact: true }).click()
  await page.getByLabel('Concurrence MCP', { exact: true }).fill('4')
  await page
    .getByLabel('Durée maximale du tour (secondes)', { exact: true })
    .fill('900')
  await page.getByLabel('Budget d’appels MCP', { exact: true }).fill('32')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(
    page.getByText('Réglages enregistrés pour les prochains tours.'),
  ).toBeVisible()
  expect(state.settings).toMatchObject({
    model: 'other-test-model',
    reasoning_effort: 'high',
    mcp_concurrency: 4,
    timeout_seconds: 900,
    tool_budget: 32,
  })
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByLabel('Modèle', { exact: true })).toHaveValue(
    'other-test-model',
  )
  expect(state.settingsCalls).toBe(1)
  expect(state.internalRequests.every((path) => !path.includes('/capabilities'))).toBe(
    true,
  )
})

test('Astra preference comes from the runtime catalogue and does not overwrite saved settings', async ({
  page,
}) => {
  const state = await connect(page)
  state.astraAvailable = true
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(
    page.getByText(/Choix privilégié disponible : Astra test runtime/),
  ).toBeVisible()
  await expect(page.getByLabel('Modèle', { exact: true })).toHaveValue(
    'catalogue-test-model',
  )
  await page
    .getByLabel('Modèle', { exact: true })
    .selectOption('catalogue-astra-observed')
  expect(state.settings.model).toBe('catalogue-test-model')
  expect(state.settingsCalls).toBe(0)
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(
    page.getByText('Réglages enregistrés pour les prochains tours.'),
  ).toBeVisible()
  expect(state.settings.model).toBe('catalogue-astra-observed')
})

test('failed settings writes preserve choices and a revision conflict requires an explicit reload', async ({
  page,
}) => {
  const state = await connect(page)
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await page.getByLabel('Effort de raisonnement').selectOption('ultra')
  state.settingsStatus = 503
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(page.getByRole('alert')).toContainText('Vos choix sont conservés.')
  await expect(page.getByLabel('Effort de raisonnement')).toHaveValue('ultra')
  await expect(page.getByText('Private internal details')).toHaveCount(0)
  state.settingsStatus = 409
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(page.getByRole('alert')).toContainText('modifiés ailleurs')
  await expect(
    page.getByRole('button', { name: 'Enregistrer les réglages' }),
  ).toBeDisabled()
  expect(state.settingsCalls).toBe(2)
  await page.getByRole('button', { name: 'Recharger les réglages enregistrés' }).click()
  await expect(page.getByLabel('Effort de raisonnement')).toHaveValue('medium')
  expect(state.settingsCalls).toBe(2)
})

test('invalid advanced bounds stop submissions and runtime catalogue outages remain controlled', async ({
  page,
}) => {
  const state = await connect(page)
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await page.getByText('Réglages avancés', { exact: true }).click()
  await page.getByLabel('Concurrence MCP', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  expect(state.settingsCalls).toBe(0)
  expect(
    await page
      .getByLabel('Concurrence MCP', { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.rangeOverflow),
  ).toBe(true)
  await page.getByLabel('Concurrence MCP', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  expect(state.settingsCalls).toBe(0)
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  state.catalogueMissing = true
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('runtime sont indisponibles')
  await expect(page.getByText('Private runtime detail')).toHaveCount(0)
  state.catalogueMissing = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByLabel('Modèle', { exact: true })).toBeVisible()
})

for (const width of [1440, 390])
  test(`internal settings and immutable diagnostic evidence at ${width}px`, async ({
    page,
  }) => {
    const state = await connect(page)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
    await expect(page.getByLabel('Modèle', { exact: true })).toBeVisible()
    await mkdir('docs/screenshots/internal-assistant', { recursive: true })
    await page.screenshot({
      path: `docs/screenshots/internal-assistant/settings-${width}.png`,
      fullPage: false,
    })
    await page.getByRole('button', { name: 'Fermer le panneau' }).click()
    await page.getByRole('button', { name: 'Commencer une conversation', exact: true }).click()
    state.diagnostics = [
      {
        correlation_id: thread,
        snapshot: {
          model: 'catalogue-test-model',
          reasoning_effort: 'high',
          runtime_provider: 'codex',
          runtime_version: 'synthetic-test',
          capabilities: state.settings.capabilities,
          mcp: ['syncoria_provider_request', 'syncoria_chat_memory_search'],
          sandbox: 'workspace-write',
          privacy: 'private',
          network: 'private-egress-disabled',
          policy_version: 'operator-chat-internal',
          config_hash: 'a'.repeat(64),
          correlation_id: thread,
          timestamp: now,
        },
        chosen_settings: { ...state.settings, reasoning_effort: 'high' },
        status: 'succeeded',
        duration_ms: 120,
        created_at: now,
        tools: [],
        timings: {
          request_received_at: now,
          runtime_ready_ms: 5,
          mcp_ready_ms: 20,
          first_event_ms: 30,
          first_text_ms: 60,
          context_ready_ms: 25,
          worker_wait_ms: 2,
          final_response_ms: 120,
          tools: [],
          mcp_calls: [
            {
              stage: 'mcp_tool_completed',
              at_ms: 110,
              queue_wait_ms: 2,
              execution_ms: 40,
              duration_ms: null,
              active: 2,
              queued: 0,
              calls: 2,
            },
          ],
        },
      },
    ]
    await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
    await page
      .getByRole('region', { name: 'Diagnostic', exact: true })
      .locator('summary')
      .click()
    await expect(page.getByText('Configuration choisie', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Configuration effective', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('row', { name: 'Premier événement 30' })).toBeVisible()
    await expect(page.getByRole('row', { name: 'Premier texte 60' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Mesures MCP' })).toBeVisible()
    await page.screenshot({
      path: `docs/screenshots/internal-assistant/diagnostic-${width}.png`,
      fullPage: false,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
  })
