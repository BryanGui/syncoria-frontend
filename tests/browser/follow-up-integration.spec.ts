import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { navigation, sheetViews } from './follow-up-fixtures'

const configuredApi = process.env.SYNCORIA_FOLLOW_UP_BROWSER_API
const enabled = Boolean(configuredApi) && process.env.SYNCORIA_FOLLOW_UP_BROWSER_DISPOSABLE === '1'
test.skip(!enabled, 'Explicit disposable local backend required for real FollowUp integration')
test.describe.configure({ mode: 'serial' })
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' })
})

function localApi(): string {
  const url = new URL(configuredApi!)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/')
    throw new Error('Only a disposable loopback API is allowed')
  return url.origin
}
async function authenticate(context: BrowserContext) {
  const api = localApi()
  const health = await context.request.get(`${api}/health`)
  expect((await health.json()).service).toBe('syncoria-follow-up-browser-test')
  const response = await context.request.post(`${api}/admin/session`, {
    data: { username: process.env.SYNCORIA_FOLLOW_UP_BROWSER_USERNAME, password: process.env.SYNCORIA_FOLLOW_UP_BROWSER_PASSWORD },
  })
  expect(response.status()).toBe(200)
  return api
}
async function connectReal(page: Page) {
  const api = await authenticate(page.context())
  // The standard test build uses this origin; forward every request to the
  // marked local service. No production request or fixture response fallback.
  await page.route('https://api.bryanlab.ovh/**', async (route) => {
    const original = route.request(), url = new URL(original.url())
    const response = await page.context().request.fetch(api + url.pathname + url.search, {
      method: original.method(),
      headers: { Accept: 'application/json', Origin: 'http://127.0.0.1:4173', ...(original.postDataBuffer() ? { 'Content-Type': 'application/json' } : {}) },
      ...(original.postDataBuffer() ? { data: original.postDataBuffer()! } : {}),
    })
    const body = await response.body()
    await route.fulfill({ status: response.status(), headers: response.headers(), body })
    await response.dispose()
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  return api
}
async function capture(page: Page, name: string) {
  const directory = process.env.SYNCORIA_FOLLOW_UP_SCREENSHOTS
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: join(directory, name), fullPage: true })
}

test('real HTTP and PostgreSQL: Contacts → company Suivi → create → global edit → done → reopen', async ({ page }) => {
  const api = await connectReal(page)
  const response = await page.context().request.post(`${api}/admin/prospecting/companies`, {
    data: { name: 'Entreprise laboratoire Suivi', city: 'Lyon', status: 'contacted', notes: 'Fixture synthétique locale' },
  })
  expect(response.status()).toBe(201)
  const company = await response.json()
  await navigation(page).getByRole('button', { name: 'Prospection', exact: true }).click()
  await page.getByRole('button', { name: company.name, exact: true }).click()
  await expect(sheetViews(page).getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Ajouter un contact', exact: true })).toBeVisible()
  await sheetViews(page).getByRole('button', { name: 'Suivi', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter une action', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ajouter une action', exact: true })
  await form.getByLabel('Titre', { exact: true }).fill('Préparer le rendez-vous commercial')
  await form.getByLabel('Notes (facultatif)', { exact: true }).fill('Vérifier les contacts et préparer les questions')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous commercial', exact: true })).toBeVisible()
  await capture(page, 'follow-up-company-desktop.png')
  const stored = await page.context().request.get(`${api}/admin/follow-up/actions?subject_type=prospecting.company&subject_id=${company.id}`)
  expect(stored.status()).toBe(200)
  const [created] = await stored.json()
  expect(created.subject_id).toBe(company.id)
  expect(created.notes).toBe('Vérifier les contacts et préparer les questions')
  await navigation(page).getByRole('button', { name: 'Suivi', exact: true }).click()
  await page.getByRole('button', { name: 'Modifier Préparer le rendez-vous commercial', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Modifier l’action', exact: true })
  await editor.getByLabel('Échéance (Europe/Paris, facultatif)', { exact: true }).fill('2026-10-27T09:30')
  await editor.getByLabel('Notes (facultatif)', { exact: true }).fill('')
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous commercial', exact: true })).toBeVisible()
  const updated = await (await page.context().request.get(`${api}/admin/follow-up/actions/${created.id}`)).json()
  expect(Date.parse(updated.due_at)).toBe(Date.parse('2026-10-27T08:30:00Z'))
  expect(updated.notes).toBeNull()
  expect(updated.title).toBe(created.title)
  expect(updated.subject_id).toBe(company.id)
  await capture(page, 'follow-up-desktop.png')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'follow-up-mobile.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Terminer Préparer le rendez-vous commercial', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous commercial', exact: true })).toHaveCount(0)
  await page.getByLabel('Vue', { exact: true }).selectOption('done')
  await expect(page.getByRole('button', { name: 'Rouvrir Préparer le rendez-vous commercial', exact: true })).toBeVisible()
  await expect(page.locator('.follow-up-overdue')).toHaveCount(0)
  await page.getByRole('button', { name: 'Rouvrir Préparer le rendez-vous commercial', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous commercial', exact: true })).toHaveCount(0)
  await page.getByLabel('Vue', { exact: true }).selectOption('in_progress')
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous commercial', exact: true })).toBeVisible()
  await page.getByRole('button', { name: company.name, exact: true }).click()
  await expect(sheetViews(page).getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const unchangedCompany = await (await page.context().request.get(`${api}/admin/prospecting/companies/${company.id}`)).json()
  expect(unchangedCompany).toEqual(company)
})

test('real HTTP and PostgreSQL: company and contact create/edit retain the Prospection UX', async ({ page }) => {
  const api = await connectReal(page)
  await navigation(page).getByRole('button', { name: 'Prospection', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter une entreprise', exact: true }).click()
  const companyForm = page.getByRole('form', { name: 'Ajouter une entreprise', exact: true })
  await companyForm.getByLabel('Nom de l’entreprise', { exact: true }).fill('Atelier laboratoire Contacts')
  await companyForm.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(companyForm).toHaveCount(0)
  await expect(sheetViews(page).getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Ajouter un contact', exact: true }).click()
  const contactForm = page.getByRole('form', { name: 'Ajouter un contact', exact: true })
  await contactForm.getByLabel('Prénom', { exact: true }).fill('Camille')
  await contactForm.getByLabel('Nom', { exact: true }).fill('Laboratoire')
  await contactForm.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(contactForm).toHaveCount(0)
  await page.getByRole('button', { name: 'Modifier le contact Camille Laboratoire', exact: true }).click()
  const contactEditor = page.getByRole('form', { name: 'Modifier le contact', exact: true })
  await contactEditor.getByLabel('Fonction (facultatif)', { exact: true }).fill('Direction commerciale')
  await contactEditor.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(contactEditor).toHaveCount(0)
  await expect(page.getByText('Direction commerciale', { exact: true })).toBeVisible()
  await sheetViews(page).getByRole('button', { name: 'Informations générales', exact: true }).click()
  const information = page.getByRole('form', { name: 'Fiche entreprise', exact: true })
  await information.getByLabel('Ville (facultatif)', { exact: true }).fill('Paris')
  await information.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Entreprise enregistrée.', { exact: true })).toBeVisible()
  const company = (await (await page.context().request.get(`${api}/admin/prospecting/companies?q=Atelier%20laboratoire`)).json())[0]
  expect(company.city).toBe('Paris')
  const contacts = await (await page.context().request.get(`${api}/admin/prospecting/companies/${company.id}/contacts`)).json()
  expect(contacts[0].role).toBe('Direction commerciale')
})

test('real HTTP authentication rejects an absent session before protected reads', async ({ request }) => {
  const api = localApi()
  expect((await (await request.get(`${api}/health`)).json()).service).toBe('syncoria-follow-up-browser-test')
  expect((await request.get(`${api}/admin/follow-up/worklist`)).status()).toBe(401)
  expect((await request.get(`${api}/admin/follow-up/actions`)).status()).toBe(401)
  expect((await request.get(`${api}/admin/prospecting/companies`)).status()).toBe(401)
})
