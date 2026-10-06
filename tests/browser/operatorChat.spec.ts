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
async function connect(page: Page) {
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
        json: [
          { id: a, slug: 'a', name: 'Client A', status: 'active' },
          { id: b, slug: 'b', name: 'Client B', status: 'active' },
        ],
      })
    if (path.includes('/operator-chat/')) {
      if (state.expired) return route.fulfill({ status: 401, json: {} })
      const tenant = path.includes(b) ? b : a
      if (
        path.endsWith('/capabilities/reset') ||
        path.endsWith('/capabilities')
      ) {
        if (method === 'PUT') {
          const enabled = route.request().postDataJSON().enabled
          expect(Object.keys(enabled).sort()).toEqual([
            'multi_agent',
            'python',
            'shell',
            'workspace',
          ])
          state.capabilities = enabled
        }
        if (path.endsWith('/reset'))
          state.capabilities = {
            shell: true,
            workspace: true,
            python: true,
            multi_agent: false,
          }
        return route.fulfill({
          json: {
            policy_version: 'operator-chat-v2',
            capabilities: [
              ...Object.entries(state.capabilities).map(([id, enabled]) => ({
                id,
                label: id === 'shell' ? 'Shell' : id,
                supported: true,
                enabled,
                reason: null,
              })),
              {
                id: 'web_search',
                label: 'Web Search',
                supported: false,
                enabled: false,
                reason: 'Runtime privé',
              },
            ],
          },
        })
      }
      if (path.endsWith('/diagnostics')) return route.fulfill({ json: [] })
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
  await page
    .getByRole('button', { name: 'Assistant Syncoria', exact: true })
    .click()
  await page.getByLabel('Client actif').selectOption(a)
  return state
}
test('new thread, send, confirmed tools, final, resume and archive', async ({
  page,
}) => {
  const state = await connect(page)
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  await expect(
    page.getByText('Chat tenant privé — accès Web public désactivé'),
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
  await expect(
    page.getByText('Historique visible', { exact: true }),
  ).toBeVisible()

  await expect(page.getByText('Recherche publique disponible')).toHaveCount(0)
  await page.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  expect(state.archive).toBe(1)
})
test('runtime error and cancellation keep final responses absent', async ({
  page,
}) => {
  const state = await connect(page)
  state.error = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Hello')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    "La réponse n'a pas pu être terminée.",
  )
  state.error = false
  state.slow = true
  await page.getByLabel('Message opérateur').fill('Continue')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Réponse interrompue')
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(
    0,
  )
})
test('foreign thread history fails closed and switching tenants clears chat', async ({
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
  await page.getByLabel('Client actif').selectOption(b)
  await expect(
    page
      .getByRole('navigation', { name: 'Conversations récentes' })
      .getByRole('button'),
  ).toHaveCount(0)
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
})
test('late stream after tenant switch is discarded', async ({ page }) => {
  const state = await connect(page)
  state.slow = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Hello')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.getByLabel('Client actif').selectOption(b)
  await expect(page.getByLabel('Message opérateur')).toBeDisabled()
  await page.waitForTimeout(850)
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(
    0,
  )
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
test('mobile composer stays visible and demo never launches runtime', async ({
  page,
}) => {
  const state = await connect(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Conversations récentes' })).toBeHidden()
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
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Démo synthétique' }).click()
  await expect(
    page.getByText('Runtime réel indisponible sur les fixtures'),
  ).toBeVisible()
  expect(state.sends).toBe(1)
})

test('public privacy event fails closed in tenant chat', async ({ page }) => {
  const state = await connect(page)
  state.publicPrivacy = true
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click()
  await page.getByLabel('Message opérateur').fill('Message client privé')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Conseil visible', { exact: true })).toHaveCount(
    0,
  )
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
  await page
    .getByRole('button', { name: 'Capacités Codex', exact: true })
    .click()
  await expect(page.getByLabel(/Web Search/)).toBeDisabled()
  await page.getByLabel(/^Shell/).click()
  await expect(page.getByLabel(/^workspace/)).not.toBeChecked()
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
  await page
    .getByRole('button', { name: 'Enregistrer dans la mémoire' })
    .click()
  await expect(
    page.getByText('Élément enregistré pour ce tenant.'),
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
  await expect(page.getByRole('navigation', { name: 'Conversations récentes' })).toBeHidden()
  await page.getByRole('button', { name: 'Conversations et outils' }).click()
  await page
    .getByRole('button', { name: 'Capacités Codex', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Restaurer les paramètres Syncoria par défaut',
    })
    .click()
  await expect(page.getByLabel(/^Shell/)).toBeChecked()
  const panel = await page
    .getByRole('region', { name: 'Capacités Codex' })
    .boundingBox()
  expect(panel && panel.y === 0 && panel.height === 844).toBe(true)
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
  await expect(page.getByLabel('Message opérateur')).toBeVisible()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  await expect(
    page.getByText('Chat tenant privé — accès Web public désactivé'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le panneau' }).click()
})
