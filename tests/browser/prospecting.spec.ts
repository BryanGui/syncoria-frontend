import { expect, test, type Page } from '@playwright/test'
import type { Company, Contact } from '../../src/prospecting/model'

const companyId = '11111111-1111-4111-8111-111111111111'
const otherId = '33333333-3333-4333-8333-333333333333'
const contactId = '22222222-2222-4222-8222-222222222222'
const dates = { created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z' }
const company = (id = companyId, name = 'Entreprise prospect test'): Company => ({
  id,
  name,
  website: null,
  city: 'Lyon',
  sector: 'Conseil',
  status: 'identified',
  source: 'Salon',
  notes: null,
  ...dates,
})
const contact = (id = contactId, first_name = 'Alex'): Contact => ({
  id,
  company_id: companyId,
  first_name,
  last_name: 'Exemple',
  role: 'Direction',
  email: 'alex@example.test',
  phone: '+33 1 00 00 00 00',
  linkedin_url: 'https://www.linkedin.com/in/contact-test/',
  notes: null,
  ...dates,
})
async function connect(
  page: Page,
  options: { companies?: Company[]; contacts?: Contact[]; listStatus?: number; registryStatus?: number } = {},
) {
  const state = {
    companies: options.companies ?? [company()],
    contacts: options.contacts ?? [],
    contactsListStatus: 200,
    saveStatus: 200,
    listStatus: options.listStatus ?? 200,
    writes: [] as { method: string; path: string; body: Record<string, unknown> }[],
    reads: [] as string[],
  }
  await page.route('https://api.bryanlab.ovh/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (path === '/client/me') return route.fulfill({ status: 401, json: {} })
    if (path === '/admin/session')
      return route.fulfill({ json: { authenticated: true } })
    if (path === '/admin/tenants' && request.method() === 'GET')
      return route.fulfill({
        status: options.registryStatus ?? 200,
        json: [
          {
            id: otherId,
            name: 'Client existant test',
            slug: 'client-test',
            status: 'active',
          },
        ],
      })
    if (request.method() !== 'GET') {
      state.writes.push({
        method: request.method(),
        path,
        body: request.postDataJSON(),
      })
      if (!path.startsWith('/admin/prospecting/'))
        return route.fulfill({ status: 500, json: {} })
      if (state.saveStatus !== 200)
        return route.fulfill({
          status: state.saveStatus,
          json: { detail: 'technical-private-sentinel' },
        })
      const input = request.postDataJSON()
      if (path === '/admin/prospecting/companies') {
        const record = { ...company(companyId, input.name), ...input }
        state.companies.push(record)
        return route.fulfill({ status: 201, json: record })
      }
      const match = path.match(/^\/admin\/prospecting\/companies\/([^/]+)$/)
      if (match) {
        const index = state.companies.findIndex((entry) => entry.id === match[1])
        state.companies[index] = { ...state.companies[index], ...input }
        return route.fulfill({ json: state.companies[index] })
      }
      const parent = path.match(/^\/admin\/prospecting\/companies\/([^/]+)\/contacts$/)
      if (parent) {
        const record = { id: contactId, company_id: parent[1], ...dates, ...input }
        state.contacts.push(record)
        return route.fulfill({ status: 201, json: record })
      }
      const index = state.contacts.findIndex(
        (entry) => path === `/admin/prospecting/contacts/${entry.id}`,
      )
      if (index >= 0) {
        state.contacts[index] = { ...state.contacts[index], ...input }
        return route.fulfill({ json: state.contacts[index] })
      }
    }
    if (path.startsWith('/admin/prospecting/')) {
      state.reads.push(url.pathname + url.search)
      if (path === '/admin/prospecting/companies' && state.listStatus !== 200)
        return route.fulfill({
          status: state.listStatus,
          json: { detail: 'technical-private-sentinel' },
        })
      const offset = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 25)
      if (path === '/admin/prospecting/companies')
        return route.fulfill({ json: state.companies.slice(offset, offset + limit) })
      if (path.endsWith('/contacts') && state.contactsListStatus !== 200)
        return route.fulfill({ status: state.contactsListStatus, json: {} })
      const match = path.match(
        /^\/admin\/prospecting\/companies\/([^/]+)(\/contacts)?$/,
      )
      if (match)
        return route.fulfill({
          json: match[2]
            ? state.contacts
                .filter((entry) => entry.company_id === match[1])
                .slice(offset, offset + limit)
            : state.companies.find((entry) => entry.id === match[1]),
        })
      const contact = state.contacts.find(
        (entry) => path === `/admin/prospecting/contacts/${entry.id}`,
      )
      if (contact) return route.fulfill({ json: contact })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'VUE GLOBALE', exact: true }),
  ).toBeVisible()
  return state
}
async function openProspecting(page: Page) {
  await page.getByRole('button', { name: 'Prospection', exact: true }).click()
}
async function openCompany(page: Page) {
  await openProspecting(page)
  await page.getByRole('button', { name: /Entreprise prospect test/ }).click()
  await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Ajouter un contact', exact: true })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Fiche entreprise' })).toBeHidden()
}

test('Prospection is visibly separate from Clients and never inherits client demo mode', async ({
  page,
}) => {
  await connect(page)
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'CLIENTS', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Démo synthétique', exact: true }).click()
  await expect(page.getByText('synthetic/demo', { exact: true })).toBeVisible()
  await openProspecting(page)
  await expect(
    page.getByRole('heading', { name: 'PROSPECTION', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Données réelles · prospection interne', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Source des données' })).toHaveCount(0)
  await expect(page.getByText('synthetic/demo', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Entreprise prospect test/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Client existant test/ })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Démo synthétique', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('synthetic/demo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Registre réel', exact: true }).click()
  await expect(page.getByRole('button', { name: /Client existant test/ })).toBeVisible()
})
test('registry failure does not block real prospecting', async ({ page }) => {
  await connect(page, { registryStatus: 503 })
  await openProspecting(page)
  await expect(
    page.getByRole('button', { name: /Entreprise prospect test/ }),
  ).toBeVisible()
  await expect(page.getByText(/Registre indisponible/)).toHaveCount(0)
})
test('company creation and partial editing never provision a tenant, including converted', async ({
  page,
}) => {
  const state = await connect(page, { companies: [] })
  await openProspecting(page)
  await expect(page.getByText('Aucune entreprise sur cette page.')).toBeVisible()
  await page
    .getByRole('button', { name: 'Ajouter une entreprise', exact: true })
    .click()
  let form = page.getByRole('form', { name: 'Ajouter une entreprise' })
  await form
    .getByLabel('Nom de l’entreprise', { exact: true })
    .fill('Nouvelle entreprise')
  await form.getByLabel('Ville (facultatif)').fill('Paris')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
  form = page.getByRole('form', { name: 'Fiche entreprise' })
  await expect(form.getByLabel('Nom de l’entreprise', { exact: true })).toHaveValue(
    'Nouvelle entreprise',
  )
  await form.getByLabel('Statut commercial').selectOption('converted')
  await form.getByLabel('Ville (facultatif)').fill('')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Entreprise enregistrée.', { exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(2)
  expect(state.writes[0]).toMatchObject({
    method: 'POST',
    path: '/admin/prospecting/companies',
  })
  expect(state.writes[1]).toEqual({
    method: 'PATCH',
    path: `/admin/prospecting/companies/${companyId}`,
    body: { city: null, status: 'converted' },
  })
  await page.getByRole('button', { name: '← Entreprises prospectées' }).click()
  await expect(page.getByText('Converti', { exact: true })).toBeVisible()
})
test('contact creation and modification stay attached to the company', async ({
  page,
}) => {
  const state = await connect(page)
  await openCompany(page)
  await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
  let form = page.getByRole('form', { name: 'Ajouter un contact' })
  await form.getByLabel('Prénom', { exact: true }).fill('Alex')
  await form.getByLabel('Nom', { exact: true }).fill('Exemple')
  await form.getByLabel('Email (facultatif)').fill('alex@example.test')
  await form.getByLabel('Notes (facultatif)').fill('Note du contact')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Contact enregistré.', { exact: true })).toBeVisible()
  await expect.poll(() => state.reads.filter((path) => path.includes('/contacts?')).length).toBe(2)
  await expect(
    page.getByRole('rowheader', { name: 'Alex Exemple', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Contacts de l’entreprise' }).getByRole('row').filter({ hasText: 'Alex Exemple' })).toBeFocused()
  await page.getByRole('button', { name: 'Modifier le contact Alex Exemple' }).click()
  form = page.getByRole('form', { name: 'Modifier le contact' })
  await expect(form.getByLabel('Notes (facultatif)')).toHaveValue('Note du contact')
  await form.getByLabel('Email (facultatif)').fill('')
  await form.getByLabel('Fonction (facultatif)').fill('Direction')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => state.reads.filter((path) => path.includes('/contacts?')).length).toBe(3)
  await expect(page.getByRole('rowheader', { name: 'Alex Exemple', exact: true })).toHaveCount(1)
  await expect(page.getByText('Direction', { exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(2)
  expect(state.writes[0].path).toBe(
    `/admin/prospecting/companies/${companyId}/contacts`,
  )
  expect(state.writes[1]).toEqual({
    method: 'PATCH',
    path: `/admin/prospecting/contacts/${contactId}`,
    body: { role: 'Direction', email: null },
  })
})
for (const status of [404, 422, 503])
  test(`HTTP ${status} displays a safe error, never demo records`, async ({ page }) => {
    await connect(page, { listStatus: status })
    await openProspecting(page)
    await expect(page.getByRole('alert')).toContainText(
      status === 404
        ? 'introuvable'
        : status === 422
          ? 'Vérifiez les champs'
          : 'temporairement indisponible',
    )
    await expect(page.getByText('technical-private-sentinel')).toHaveCount(0)
    await expect(page.getByText('synthetic/demo', { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /Entreprise prospect test/ }),
    ).toHaveCount(0)
  })
for (const duringSave of [false, true])
  test(`401 ${duringSave ? 'on save' : 'on load'} invokes session expiration`, async ({
    page,
  }) => {
    const state = await connect(page, { listStatus: duringSave ? 200 : 401 })
    if (duringSave) {
      await openCompany(page)
      state.saveStatus = 401
      await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
      const form = page.getByRole('form', { name: 'Fiche entreprise' })
      await form.getByLabel('Ville (facultatif)').fill('Paris')
      await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    } else await openProspecting(page)
    await expect(
      page
        .getByRole('navigation', { name: 'Navigation publique' })
        .getByRole('button', { name: 'Se connecter', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('form', { name: 'Fiche entreprise' })).toHaveCount(0)
  })
test('422 and 503 preserve unsaved form values and support retry', async ({ page }) => {
  const state = await connect(page)
  await openCompany(page)
  await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
  const form = page.getByRole('form', { name: 'Fiche entreprise' })
  await form.getByLabel('Ville (facultatif)').fill('Paris')
  for (const status of [422, 503]) {
    state.saveStatus = status
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText(
      status === 422 ? 'Vérifiez les champs' : 'temporairement indisponible',
    )
    await expect(form.getByLabel('Ville (facultatif)')).toHaveValue('Paris')
    await expect(page.getByText('Entreprise enregistrée.')).toHaveCount(0)
  }
  state.saveStatus = 200
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Entreprise enregistrée.')).toBeVisible()
})
test('company pagination requests the next page and supports returning', async ({
  page,
}) => {
  const companies = Array.from({ length: 26 }, (_, index) =>
    company(
      `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      `Prospect ${index}`,
    ),
  )
  const state = await connect(page, { companies })
  await openProspecting(page)
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Prospect 25', exact: true })).toBeVisible()
  expect(state.reads).toContain('/admin/prospecting/companies?limit=25&offset=25')
  await page.getByRole('button', { name: 'Précédent', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Prospect 0', exact: true })).toBeVisible()
})
test('late company response cannot restore a previously selected record', async ({
  page,
}) => {
  await connect(page, { companies: [company(), company(otherId, 'Second prospect')] })
  let release!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/admin/prospecting/companies/${companyId}`, async (route) => {
    await delayed
    await route.fulfill({ json: company() }).catch(() => {})
  })
  await openProspecting(page)
  await page.getByRole('button', { name: /Entreprise prospect test/ }).click()
  await expect(page.getByText('Chargement de l’entreprise…')).toBeVisible()
  await page.getByRole('button', { name: '← Entreprises prospectées' }).click()
  await page.getByRole('button', { name: /Second prospect/ }).click()
  release()
  await expect(page.getByRole('heading', { name: 'Second prospect', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
for (const width of [390, 1440])
  test(`prospecting list and forms fit viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await connect(page)
    await openCompany(page)
    await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
    await expect(page.getByRole('form', { name: 'Ajouter un contact' })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/tmp/syncoria-124-prospecting-form-${width}.png`,
      fullPage: true,
    })
  })

test('saving the company preserves an unfinished contact form', async ({ page }) => {
  const state = await connect(page)
  await openCompany(page)
  await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
  const contactForm = page.getByRole('form', { name: 'Ajouter un contact' })
  await contactForm.getByLabel('Prénom', { exact: true }).fill('Saisie en cours')
  await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
  const companyForm = page.getByRole('form', { name: 'Fiche entreprise' })
  await companyForm.getByLabel('Ville (facultatif)').fill('Paris')
  await companyForm.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Entreprise enregistrée.')).toBeVisible()
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(contactForm.getByLabel('Prénom', { exact: true })).toHaveValue(
    'Saisie en cours',
  )
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).toEqual({ city: 'Paris' })
})

for (const width of [320, 390, 1024, 1440])
  test(`company and contact tables remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const record = {
      ...company(),
      name: 'Entreprise prospect test avec un nom particulièrement long',
      sector: 'Conseil et accompagnement des entreprises',
      source: null,
    }
    const person = { ...contact(), email: 'adresse.contact.particulierement.longue@example.test' }
    await connect(page, { companies: [record], contacts: [person] })
    await openProspecting(page)
    const companies = page.getByRole('table', { name: 'Entreprises prospectées' })
    await expect(companies).toBeVisible()
    await expect(companies.getByRole('columnheader')).toHaveText([
      'Entreprise', 'Ville', 'Secteur', 'Statut', 'Source', 'Dernière mise à jour',
    ])
    await expect(companies.locator('time')).toHaveAttribute('datetime', dates.updated_at)
    await expect(companies.getByText('Non renseignée', { exact: true })).toBeVisible()
    expect(await companies.evaluate((node) => getComputedStyle(node).display)).toBe(width > 760 ? 'table' : 'block')
    const row = companies.getByRole('row').nth(1)
    if (width <= 760) {
      const nameBox = await row.getByRole('rowheader').boundingBox()
      const rowBox = await row.boundingBox()
      expect(nameBox!.width).toBeGreaterThanOrEqual(rowBox!.width - 20)
    }
    await expect(row).not.toHaveAttribute('tabindex')
    await expect(row.getByRole('button')).toHaveCount(1)
    await page.screenshot({ path: `/tmp/syncoria-124-companies-${width}.png`, fullPage: true })
    const name = companies.getByRole('button', { name: record.name, exact: true })
    await name.focus()
    await name.press('Enter')
    await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('form', { name: 'Fiche entreprise' })).toBeHidden()
    const contacts = page.getByRole('table', { name: 'Contacts de l’entreprise' })
    await expect(contacts).toBeVisible()
    await expect(contacts.getByRole('columnheader')).toHaveText([
      'Nom', 'Rôle', 'Email', 'Téléphone', 'LinkedIn', 'Modifier',
    ])
    expect(await contacts.evaluate((node) => getComputedStyle(node).display)).toBe(width > 760 ? 'table' : 'block')
    await expect(contacts.getByText(person.email, { exact: true })).toBeVisible()
    await expect(contacts.getByText(person.phone, { exact: true })).toBeVisible()
    if (width <= 760) {
      const nameBox = await contacts.getByRole('rowheader').boundingBox()
      const rowBox = await contacts.getByRole('row').nth(1).boundingBox()
      expect(nameBox!.width).toBeGreaterThanOrEqual(rowBox!.width - 20)
    }
    const profile = contacts.getByRole('link', { name: 'Ouvrir le profil LinkedIn de Alex Exemple' })
    await expect(profile).toHaveAttribute('href', person.linkedin_url)
    await expect(profile).toHaveAttribute('target', '_blank')
    await expect(profile).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/syncoria-124-contacts-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
    await expect(page.getByLabel('Nom de l’entreprise', { exact: true })).toHaveValue(record.name)
    await expect(contacts).toBeHidden()
  })

test('missing LinkedIn never creates an external link', async ({ page }) => {
  await connect(page, { contacts: [{ ...contact(), linkedin_url: null }] })
  await openCompany(page)
  await expect(page.getByRole('table', { name: 'Contacts de l’entreprise' })).toBeVisible()
  await expect(page.getByRole('link', { name: /LinkedIn/ })).toHaveCount(0)
})

for (const editing of [false, true])
  test(`contact ${editing ? 'editing' : 'creation'} errors keep the complete form and allow retry`, async ({ page }) => {
    const state = await connect(page, { contacts: editing ? [contact()] : [] })
    await openCompany(page)
    await page.getByRole('button', { name: editing ? 'Modifier le contact Alex Exemple' : 'Ajouter un contact', exact: true }).click()
    const form = page.getByRole('form', { name: editing ? 'Modifier le contact' : 'Ajouter un contact' })
    const fields = {
      'Prénom': 'Camille',
      'Nom': 'Exemple',
      'Fonction (facultatif)': 'Responsable commerciale',
      'Email (facultatif)': 'camille@example.test',
      'Téléphone (facultatif)': '+33 2 00 00 00 00',
      'URL LinkedIn (facultatif)': 'https://www.linkedin.com/in/autre-contact-test/',
      'Notes (facultatif)': 'Saisie conservée après une erreur',
    }
    for (const [label, value] of Object.entries(fields)) await form.getByLabel(label, { exact: true }).fill(value)
    for (const status of [404, 422, 503, 500]) {
      state.saveStatus = status
      await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      await expect(form.getByRole('alert')).toBeVisible()
      await expect(form).toBeVisible()
      for (const [label, value] of Object.entries(fields)) await expect(form.getByLabel(label, { exact: true })).toHaveValue(value)
      await expect(page.getByText('Contact enregistré.', { exact: true })).toHaveCount(0)
      await expect(page.getByText('technical-private-sentinel')).toHaveCount(0)
    }
    state.saveStatus = 200
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(page.getByRole('rowheader', { name: 'Camille Exemple', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => state.reads.filter((path) => path.includes('/contacts?')).length).toBe(2)
  })

for (const editing of [false, true])
  test(`saving a contact from page two returns to Contacts with its confirmed record (${editing ? 'edit' : 'create'})`, async ({ page }) => {
    const contacts = Array.from({ length: 26 }, (_, index) => contact(
      `${String(index).padStart(8, '0')}-2222-4222-8222-222222222222`, `Contact ${index}`,
    ))
    const state = await connect(page, { contacts })
    await openCompany(page)
    await page.getByRole('button', { name: 'Suivant', exact: true }).click()
    await expect(page.getByRole('rowheader', { name: 'Contact 25 Exemple', exact: true })).toBeVisible()
    await page.getByRole('button', { name: editing ? 'Modifier le contact Contact 25 Exemple' : 'Ajouter un contact', exact: true }).click()
    const form = page.getByRole('form', { name: editing ? 'Modifier le contact' : 'Ajouter un contact' })
    await form.getByLabel('Prénom', { exact: true }).fill('Contact enregistré')
    await form.getByLabel('Nom', { exact: true }).fill('Exemple')
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(form).toHaveCount(0)
    await expect(page.getByRole('rowheader', { name: 'Contact enregistré Exemple', exact: true })).toBeVisible()
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Chargement des contacts…')).toHaveCount(0)
    expect(state.reads.filter((path) => path.includes('/contacts?')).at(-1)).toBe(
      `/admin/prospecting/companies/${companyId}/contacts?limit=25&offset=0`,
    )
    await expect(page.getByRole('table', { name: 'Contacts de l’entreprise' }).getByRole('rowheader')).toHaveCount(26)
  })

test('a confirmed save remains visible when refreshing contacts fails', async ({ page }) => {
  const state = await connect(page)
  await openCompany(page)
  await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ajouter un contact' })
  await form.getByLabel('Prénom', { exact: true }).fill('Alex')
  await form.getByLabel('Nom', { exact: true }).fill('Exemple')
  state.contactsListStatus = 503
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByText('Contact enregistré.', { exact: true })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Alex Exemple', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('temporairement indisponible')
  state.contactsListStatus = 200
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('rowheader', { name: 'Alex Exemple', exact: true })).toHaveCount(1)
})

test('successful contact save returns to Contacts even after consulting company information', async ({ page }) => {
  await connect(page)
  await openCompany(page)
  await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ajouter un contact' })
  await form.getByLabel('Prénom', { exact: true }).fill('Alex')
  await form.getByLabel('Nom', { exact: true }).fill('Exemple')
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route(`**/admin/prospecting/companies/${companyId}/contacts`, async (route) => {
    await pending
    await route.fallback()
  })
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Informations générales', exact: true }).click()
  await expect(form).toBeHidden()
  release()
  await expect(page.getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('rowheader', { name: 'Alex Exemple', exact: true })).toBeVisible()
})
