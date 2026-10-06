import { test, expect, type Locator, type Page, type Response } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
// Test-only synthetic operational summaries; never provider fixtures or live PII.
import {
  completeAdvisory,
  emptyAdvisory,
  advisoryTenantId as tenantId,
  advisoryOtherTenantId as otherId,
} from '../advisoryFixtures.mjs'
async function connect(
  page: Page,
  payload = completeAdvisory(),
  responseStatus = 200,
) {
  const state = {
    payload,
    failWrites: false,
    writes: [] as {
      method: string
      path: string
      body: Record<string, unknown>
    }[],
  }
  await page.route('https://api.bryanlab.ovh/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/client/me') return route.fulfill({ status: 401, json: {} })
    if (path === '/admin/session')
      return route.fulfill({ json: { authenticated: true } })
    if (path === '/admin/tenants')
      return route.fulfill({
        json: [
          {
            id: tenantId,
            name: 'Entreprise conseil',
            slug: 'conseil',
            status: 'active',
          },
          {
            id: otherId,
            name: 'Autre entreprise',
            slug: 'autre',
            status: 'active',
          },
        ],
      })
    if (path === `/admin/advisory/tenants/${tenantId}/dossier`)
      return route.fulfill({
        status: responseStatus,
        json: responseStatus === 200 ? state.payload : {},
      })
    if (path === `/admin/advisory/tenants/${otherId}/dossier`)
      return route.fulfill({ json: emptyAdvisory(otherId) })
    if (path.includes('/estate'))
      return route.fulfill({
        json: {
          tenant: {
            tenant_id: tenantId,
            name: 'Entreprise conseil',
            slug: 'conseil',
            status: 'active',
          },
          read_at: '2026-10-02T10:00:00Z',
          identities: [],
          groups: [],
          identity_groups: [],
          memberships: [],
          licenses: [],
          automations: [],
          permissions: [],
          metrics: [],
          states: [],
        },
      })
    if (
      path.startsWith(`/admin/advisory/tenants/${tenantId}/`) &&
      request.method() !== 'GET'
    ) {
      const body = request.postDataJSON()
      state.writes.push({ method: request.method(), path, body })
      if (state.failWrites)
        return route.fulfill({
          status: 422,
          json: { detail: 'Not rendered directly' },
        })
      const resource = path.split('/')[5].replace('-', '_')
      const defaults = completeAdvisory()
      if (resource === 'profile') {
        state.payload.profile = { ...defaults.profile, ...body }
        return route.fulfill({ json: state.payload.profile })
      }
      const record = { ...defaults[resource][0], ...body }
      state.payload[resource] = [record]
      state.payload.recent_timeline = state.payload.recent_timeline.map(
        (event) =>
          event.resource === resource
            ? { ...event, title: record.title }
            : event,
      )
      return route.fulfill({
        status: request.method() === 'POST' ? 201 : 200,
        json: record,
      })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Entreprise conseil/ }).click()
  return state
}

test('advisory overview explains the client and keeps estate secondary; launcher states', async ({
  page,
}) => {
  const payload = completeAdvisory()
  const base = payload.provider_access[0]
  payload.provider_access.push({
    ...base,
    access_reference_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    label: 'Accès sans URL',
    login_url: null,
  })
  payload.provider_access.push({
    ...base,
    access_reference_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    label: 'Ancien accès',
    status: 'revoked',
  })
  await connect(page, payload)
  await expect(
    page.getByRole('button', { name: 'Vue conseil', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByText('Entreprise industrielle accompagnée'),
  ).toBeVisible()
  await expect(
    page.getByText('Référent IA interne', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Réduire la double saisie' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Assistant de saisie' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Revoir les résultats' }),
  ).toBeVisible()
  await expect(page.getByText('Limiter le risque métier')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Parc IA du tenant' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Suivi', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Historique du conseil' }),
  ).toBeVisible()
  await expect(
    page.getByText('Décision acceptée', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Parc IA du tenant' }),
  ).toBeVisible()
  const launcher = page.getByRole('link', {
    name: /Ouvrir · Workspace conseil/,
  })
  await expect(launcher).toHaveAttribute('href', 'https://platform.openai.com/')
  await expect(launcher).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(launcher).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(
    page.getByText('URL non renseignée.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Accès révoqué — ouverture désactivée.'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Ouvrir · Ancien accès/ }),
  ).toHaveCount(0)
})

test('empty dossier supports profile, contact and need creation, editing and visible API errors', async ({
  page,
}) => {
  const state = await connect(page, emptyAdvisory())
  await expect(
    page.getByText('Le contexte de cette entreprise reste à renseigner.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Renseigner le profil' }).click()
  await page
    .getByLabel('Activité (facultatif)', { exact: true })
    .fill('Conseil en industrie')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByText('Conseil en industrie', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter · Interlocuteurs' }).click()
  await page
    .getByLabel('Nom professionnel', { exact: true })
    .fill('Alex Exemple')
  await page
    .getByLabel('Type de contact', { exact: true })
    .selectOption('ai_referent')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Alex Exemple' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Ajouter · Besoins', exact: true })
    .click()
  await page.getByLabel('Titre', { exact: true }).fill('Simplifier la saisie')
  await page
    .getByLabel('Besoin identifié', { exact: true })
    .fill('Saisie répétitive à réduire')
  state.failWrites = true
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Vérifiez les champs')
  state.failWrites = false
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Simplifier la saisie' }),
  ).toBeVisible()
  await page
    .getByRole('button', {
      name: 'Modifier · Simplifier la saisie',
      exact: true,
    })
    .click()
  await page.getByLabel('Titre', { exact: true }).fill('Saisie simplifiée')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Saisie simplifiée' }),
  ).toBeVisible()
  expect(
    state.writes.some(
      (write) => write.path.endsWith('/profile') && write.method === 'PUT',
    ),
  ).toBe(true)
  expect(
    state.writes.some(
      (write) => write.path.endsWith('/contacts') && write.method === 'POST',
    ),
  ).toBe(true)
  expect(
    state.writes.some(
      (write) => write.path.includes('/needs/') && write.method === 'PUT',
    ),
  ).toBe(true)
})

const advisoryBase = `/admin/advisory/tenants/${tenantId}`
const dossierResponse = (response: Response) =>
  response.request().method() === 'GET' &&
  new URL(response.url()).pathname === `${advisoryBase}/dossier`

async function saveAndReload(
  page: Page,
  editor: Locator,
  method: 'POST' | 'PUT',
  path: string,
  resource: string,
  expected: Record<string, unknown>,
) {
  // Register both waits before the click: the dossier reload can follow the write immediately.
  const saved = page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === path,
  )
  const reloaded = page.waitForResponse(dossierResponse)
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(method === 'POST' ? 201 : 200)
  expect(response.request().postDataJSON()).toMatchObject(expected)
  expect(await response.json()).toMatchObject(expected)
  const dossier = await reloaded
  expect(dossier.status()).toBe(200)
  expect((await dossier.json())[resource]).toContainEqual(expect.objectContaining(expected))
  await expect(editor).toHaveCount(0)
}

const editorScenarios = [
  {
    resource: 'opportunities', idField: 'opportunity_id', tab: 'Opportunités',
    label: 'Opportunités IA', title: 'Intégration ciblée',
    descriptionLabel: 'Hypothèse IA', description: 'Comparer un essai manuel',
    expected: { hypothesis: 'Comparer un essai manuel', priority: 'high', need_id: '22222222-2222-4222-8222-222222222222' },
  },
  {
    resource: 'decisions', idField: 'decision_id', tab: 'Opportunités',
    label: 'Décisions & recommandations', title: 'Choix justifié',
    descriptionLabel: 'Recommandation / décision', description: 'Évaluer avant de déployer',
    expected: { decision: 'Évaluer avant de déployer', rationale: 'Réduire le risque' },
  },
  {
    resource: 'engagements', idField: 'engagement_id', tab: 'Réalisations',
    label: 'Réalisations', title: 'Nouvelle réalisation',
    descriptionLabel: 'Synthèse de la réalisation', description: 'Prototype limité',
    expected: { summary: 'Prototype limité' },
  },
  {
    resource: 'actions', idField: 'action_id', tab: 'Suivi',
    label: 'Prochaines actions', title: 'Planifier une revue',
    descriptionLabel: 'Notes (facultatif)', description: 'Entretien avec le référent',
    expected: { notes: 'Entretien avec le référent' },
  },
] as const

test.describe('isolated advisory editors', () => {
  for (const scenario of editorScenarios) {
    test(`${scenario.resource}: creation saves the entered fields and reloads the dossier`, async ({ page }) => {
      const state = await connect(page)
      await page.getByRole('button', { name: scenario.tab, exact: true }).click()
      await page.getByRole('button', { name: `Ajouter · ${scenario.label}`, exact: true }).click()
      const editor = page.getByRole('region', { name: `Créer · ${scenario.label}`, exact: true })
      await editor.getByLabel('Titre', { exact: true }).fill(scenario.title)
      await editor.getByLabel(scenario.descriptionLabel, { exact: true }).fill(scenario.description)
      if (scenario.resource === 'opportunities') {
        await editor.getByLabel('Besoin associé (facultatif)', { exact: true }).selectOption(scenario.expected.need_id)
        await editor.getByLabel('Priorité', { exact: true }).selectOption('high')
      }
      if (scenario.resource === 'decisions')
        await editor.getByLabel('Pourquoi cette approche ?', { exact: true }).fill(scenario.expected.rationale)
      await saveAndReload(page, editor, 'POST', `${advisoryBase}/${scenario.resource}`, scenario.resource, {
        title: scenario.title, ...scenario.expected,
      })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible()
      expect(state.writes).toHaveLength(1)
    })

    test(`${scenario.resource}: editing preserves the manual fields and reloads the revised record`, async ({ page }) => {
      const payload = completeAdvisory()
      const record: Record<string, unknown> = payload[scenario.resource][0]
      Object.assign(record, { title: scenario.title, ...scenario.expected })
      payload.recent_timeline = payload.recent_timeline.map((event) =>
        event.resource === scenario.resource ? { ...event, title: scenario.title } : event,
      )
      const state = await connect(page, payload)
      await page.getByRole('button', { name: scenario.tab, exact: true }).click()
      await page.getByRole('button', { name: `Modifier · ${scenario.title}`, exact: true }).click()
      const editor = page.getByRole('region', { name: `Modifier · ${scenario.label}`, exact: true })
      await expect(editor.getByLabel(scenario.descriptionLabel, { exact: true })).toHaveValue(scenario.description)
      if (scenario.resource === 'opportunities') {
        await expect(editor.getByLabel('Besoin associé (facultatif)', { exact: true })).toHaveValue(scenario.expected.need_id)
        await expect(editor.getByLabel('Priorité', { exact: true })).toHaveValue('high')
      }
      if (scenario.resource === 'decisions')
        await expect(editor.getByLabel('Pourquoi cette approche ?', { exact: true })).toHaveValue(scenario.expected.rationale)
      const title = `${scenario.title} révisé`
      await editor.getByLabel('Titre', { exact: true }).fill(title)
      await saveAndReload(page, editor, 'PUT', `${advisoryBase}/${scenario.resource}/${record[scenario.idField]}`, scenario.resource, {
        title, ...scenario.expected,
      })
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toHaveCount(0)
      expect(state.writes).toHaveLength(1)
    })
  }

  test('provider_access: creation saves the provider and stored launcher URL', async ({ page }) => {
    const state = await connect(page)
    await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
    await page.getByRole('button', { name: 'Ajouter · Accès client', exact: true }).click()
    const editor = page.getByRole('region', { name: 'Créer · Accès client', exact: true })
    await editor.getByLabel('Libellé', { exact: true }).fill('Accès technique')
    await editor.getByLabel('Provider', { exact: true }).fill('anthropic')
    await editor.getByLabel('URL de connexion HTTPS (facultatif)', { exact: true }).fill('https://console.anthropic.com/')
    await saveAndReload(page, editor, 'POST', `${advisoryBase}/provider-access`, 'provider_access', {
      label: 'Accès technique', provider: 'anthropic', login_url: 'https://console.anthropic.com/',
    })
    await expect(page.getByRole('heading', { name: 'Accès technique', exact: true })).toBeVisible()
    expect(state.writes).toHaveLength(1)
  })

  test('provider_access: editing explicitly saves and reloads Accès technique révisé', async ({ page }) => {
    const payload = completeAdvisory()
    const access = payload.provider_access[0]
    Object.assign(access, {
      label: 'Accès technique', provider: 'anthropic', access_type: 'manual',
      login_url: 'https://console.anthropic.com/', status: 'unknown',
    })
    const state = await connect(page, payload)
    await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
    await page.getByRole('button', { name: 'Modifier · Accès technique', exact: true }).click()
    let editor = page.getByRole('region', { name: 'Modifier · Accès client', exact: true })
    await expect(editor.getByLabel('Provider', { exact: true })).toHaveValue('anthropic')
    await expect(editor.getByLabel('URL de connexion HTTPS (facultatif)', { exact: true })).toHaveValue('https://console.anthropic.com/')
    await editor.getByLabel('Libellé', { exact: true }).fill('Accès technique révisé')
    const expected = {
      label: 'Accès technique révisé', provider: 'anthropic', access_type: 'manual',
      login_url: 'https://console.anthropic.com/', status: 'unknown',
    }
    await saveAndReload(page, editor, 'PUT', `${advisoryBase}/provider-access/${access.access_reference_id}`, 'provider_access', expected)
    await expect(page.getByRole('heading', { name: 'Accès technique révisé', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accès technique', exact: true })).toHaveCount(0)

    // A fresh page must read the saved record from the API again, rather than retain editor state.
    const reloaded = page.waitForResponse(dossierResponse)
    await page.reload()
    await page.getByRole('button', { name: /Entreprise conseil/ }).click()
    const response = await reloaded
    expect(response.status()).toBe(200)
    expect((await response.json()).provider_access).toContainEqual(expect.objectContaining(expected))
    await page.getByRole('button', { name: 'Parc IA', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Accès technique révisé', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Modifier · Accès technique révisé', exact: true }).click()
    editor = page.getByRole('region', { name: 'Modifier · Accès client', exact: true })
    await expect(editor.getByLabel('Libellé', { exact: true })).toHaveValue('Accès technique révisé')
    await expect(editor.getByLabel('Provider', { exact: true })).toHaveValue('anthropic')
    await expect(editor.getByLabel('URL de connexion HTTPS (facultatif)', { exact: true })).toHaveValue('https://console.anthropic.com/')
    expect(state.writes).toHaveLength(1)
  })
})

test('API errors and expired session never substitute fixtures', async ({
  page,
}) => {
  await connect(page, emptyAdvisory(), 503)
  await expect(
    page.getByRole('heading', { name: 'Dossier conseil indisponible' }),
  ).toBeVisible()
  await expect(page.getByText('synthetic/demo', { exact: true })).toHaveCount(0)
})
test('expired advisory session returns to authentication', async ({ page }) => {
  await connect(page, emptyAdvisory(), 401)
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation publique' })
      .getByRole('button', { name: 'Se connecter', exact: true }),
  ).toBeVisible()
})
test('foreign records and unsafe launcher data never enter the DOM', async ({
  page,
}) => {
  const payload = completeAdvisory()
  payload.provider_access[0].login_url =
    'https://example.test/?token=sentinel-never-visible'
  await connect(page, payload)
  await expect(
    page.getByRole('heading', { name: 'Dossier conseil indisponible' }),
  ).toBeVisible()
  await expect(page.getByText(/sentinel-never-visible/)).toHaveCount(0)
  expect(await page.locator('body').innerHTML()).not.toContain(
    'sentinel-never-visible',
  )
})
test('tenant change clears the previous dossier and ignores late responses', async ({
  page,
}) => {
  await connect(page)
  await expect(
    page.getByText('Entreprise industrielle accompagnée'),
  ).toBeVisible()
  await page.getByRole('button', { name: '← Parc clients' }).click()
  await page.getByRole('button', { name: /Autre entreprise/ }).click()
  await expect(
    page.getByText('Le contexte de cette entreprise reste à renseigner.'),
  ).toBeVisible()
  await expect(
    page.getByText('Entreprise industrielle accompagnée'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '← Parc clients' }).click()
  let release!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    `**/admin/advisory/tenants/${tenantId}/dossier`,
    async (route) => {
      await delayed
      await route.fulfill({ json: completeAdvisory() }).catch(() => {})
    },
  )
  await page.getByRole('button', { name: /Entreprise conseil/ }).click()
  await expect(page.getByText('Chargement du dossier conseil…')).toBeVisible()
  await page.getByRole('button', { name: '← Parc clients' }).click()
  await page.getByRole('button', { name: /Autre entreprise/ }).click()
  release()
  await expect(
    page.getByText('Le contexte de cette entreprise reste à renseigner.'),
  ).toBeVisible()
  await expect(page.getByText('Camille Exemple', { exact: true })).toHaveCount(
    0,
  )
})
for (const width of [1440, 390])
  test(`advisory dossier and forms fit viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await connect(page)
    await expect(
      page.getByRole('heading', { name: 'Comprendre l’entreprise' }),
    ).toBeVisible()
    await mkdir('docs/screenshots/advisory', { recursive: true })
    await page.screenshot({
      path: `docs/screenshots/advisory/dossier-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Modifier le profil' }).click()
    await expect(
      page.getByLabel('Activité (facultatif)', { exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })

test('session expiration during an edit clears the client dossier', async ({
  page,
}) => {
  await connect(page)
  await page.route(`**/admin/advisory/tenants/${tenantId}/profile`, (route) =>
    route.fulfill({ status: 401, json: {} }),
  )
  await page.getByRole('button', { name: 'Modifier le profil' }).click()
  await page
    .getByLabel('Activité (facultatif)', { exact: true })
    .fill('Modification non enregistrée')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation publique' })
      .getByRole('button', { name: 'Se connecter', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Entreprise industrielle accompagnée'),
  ).toHaveCount(0)
})

test('changing tenant while saving does not display the old form or late mutation', async ({
  page,
}) => {
  await connect(page)
  let release!: () => void
  let notify!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  const received = new Promise<void>((resolve) => {
    notify = resolve
  })
  await page.route(
    `**/admin/advisory/tenants/${tenantId}/profile`,
    async (route) => {
      notify()
      await delayed
      await route.fulfill({ json: completeAdvisory().profile }).catch(() => {})
    },
  )
  await page.getByRole('button', { name: 'Modifier le profil' }).click()
  await page
    .getByLabel('Activité (facultatif)', { exact: true })
    .fill('Ancienne saisie en cours')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await received
  await page.getByRole('button', { name: '← Parc clients' }).click()
  await page.getByRole('button', { name: /Autre entreprise/ }).click()
  release()
  await expect(
    page.getByText('Le contexte de cette entreprise reste à renseigner.'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Modifier · Profil conseil' }),
  ).toHaveCount(0)
  await expect(page.getByText('Ancienne saisie en cours')).toHaveCount(0)
})
