import { expect, test } from '@playwright/test'
import { action, company, companyId, connectFollowUp, openCompanyFollowUp, openFollowUp, sheetViews } from './follow-up-fixtures'

test('company Contacts default, prefilled FollowUp creation and global subject navigation', async ({ page }) => {
  const state = await connectFollowUp(page)
  await openCompanyFollowUp(page)
  await expect.poll(() => state.reads.at(-1)?.searchParams.get('subject_id')).toBe(companyId)
  await page.getByRole('button', { name: 'Ajouter une action', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ajouter une action', exact: true })
  await expect(form.getByText(company.name, { exact: true })).toBeVisible()
  await expect(form.getByLabel('Rechercher une entreprise', { exact: true })).toHaveCount(0)
  await form.getByLabel('Titre', { exact: true }).fill('Préparer le rendez-vous')
  await form.getByLabel('Notes (facultatif)', { exact: true }).fill('Points à discuter')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Préparer le rendez-vous', exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).toMatchObject({ subject_type: 'prospecting.company', subject_id: companyId, status: 'todo' })
  await openFollowUp(page)
  await page.getByRole('button', { name: company.name, exact: true }).click()
  await expect(sheetViews(page).getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(state.writes.every((write) => write.path.startsWith('/admin/follow-up/'))).toBe(true)
})

test('editing and quick transitions preserve omitted fields and remove done from active view', async ({ page }) => {
  const original = action(1, { title: 'Action commerciale', due_at: '2026-10-25T01:30:45Z', notes: 'À garder' })
  const state = await connectFollowUp(page, [original])
  await openFollowUp(page)
  await page.getByRole('button', { name: 'Modifier Action commerciale', exact: true }).click()
  const form = page.getByRole('form', { name: 'Modifier l’action', exact: true })
  await form.getByLabel('Titre', { exact: true }).fill('Action révisée')
  await form.getByLabel('Notes (facultatif)', { exact: true }).fill('')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(state.writes[0].body).toEqual({ title: 'Action révisée', notes: null })
  await page.getByRole('button', { name: 'Mettre en attente Action révisée', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reprendre Action révisée', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Terminer Action révisée', exact: true }).click()
  await expect(page.getByText('Aucune action pour cette sélection.', { exact: true })).toBeVisible()
  await page.getByLabel('Vue', { exact: true }).selectOption('done')
  await expect(page.getByRole('button', { name: 'Rouvrir Action révisée', exact: true })).toBeVisible()
  await expect(page.locator('.follow-up-overdue')).toHaveCount(0)
  await page.getByRole('button', { name: 'Rouvrir Action révisée', exact: true }).click()
  await expect(page.getByText('Aucune action pour cette sélection.', { exact: true })).toBeVisible()
  await page.getByLabel('Vue', { exact: true }).selectOption('in_progress')
  await expect(page.getByRole('button', { name: 'Action révisée', exact: true })).toBeVisible()
  expect(state.writes.slice(1).map((entry) => entry.body)).toEqual([{ status: 'waiting' }, { status: 'done' }, { status: 'todo' }])
})

test('server filters, search, ordering and page reset stay composable', async ({ page }) => {
  const state = await connectFollowUp(page, Array.from({ length: 27 }, (_, index) => action(index + 1, { title: `Préparer ${index + 1}`, status: index === 26 ? 'waiting' : 'todo' })))
  await openFollowUp(page)
  const pagination = page.getByRole('navigation', { name: 'Pagination des actions' })
  await pagination.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(pagination.getByText('Page 2', { exact: true })).toBeVisible()
  await page.getByLabel('Vue', { exact: true }).selectOption('waiting')
  await expect(pagination.getByText('Page 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Préparer 27', exact: true })).toBeVisible()
  await page.getByLabel('Échéances', { exact: true }).selectOption('none')
  await page.getByLabel('Trier par', { exact: true }).selectOption('updated_at')
  await page.getByLabel('Rechercher une action', { exact: true }).fill('27')
  await expect.poll(() => state.reads.at(-1)?.searchParams.get('q')).toBe('27')
  expect(Object.fromEntries(state.reads.at(-1)!.searchParams)).toMatchObject({ view: 'waiting', due: 'none', q: '27', sort: 'updated_at', limit: '25', offset: '0' })
  await page.getByLabel('Rechercher une action', { exact: true }).fill('zéro résultat')
  await expect(page.getByText('Aucune action pour cette sélection.', { exact: true })).toBeVisible()
})

test('today and overdue overlap around Paris midnight and autumn change, done has no late badge', async ({ page }) => {
  await connectFollowUp(page, [
    action(1, { title: 'Début de journée Paris', due_at: '2026-10-24T22:00:00Z' }),
    action(2, { title: 'Seconde heure Paris', due_at: '2026-10-25T01:30:00Z' }),
    action(3, { title: 'Demain Paris', due_at: '2026-10-25T23:00:00Z' }),
    action(4, { title: 'Terminée ancienne', status: 'done', due_at: '2026-10-24T22:00:00Z' }),
  ])
  await openFollowUp(page)
  await page.getByLabel('Échéances', { exact: true }).selectOption('today')
  await expect(page.getByRole('button', { name: 'Début de journée Paris', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seconde heure Paris', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Demain Paris', exact: true })).toHaveCount(0)
  await page.getByLabel('Échéances', { exact: true }).selectOption('overdue')
  await expect(page.getByRole('button', { name: 'Début de journée Paris', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seconde heure Paris', exact: true })).toHaveCount(0)
  await page.getByLabel('Vue', { exact: true }).selectOption('done')
  await expect(page.getByText('Aucune action pour cette sélection.', { exact: true })).toBeVisible()
})

test('global creation searches authorized companies, validates DST and prevents double saves', async ({ page }) => {
  const state = await connectFollowUp(page)
  await openFollowUp(page)
  await page.getByRole('button', { name: 'Ajouter une action', exact: true }).click()
  const form = page.getByRole('form', { name: 'Ajouter une action', exact: true })
  await form.getByLabel('Titre', { exact: true }).fill('Action horaire')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Choisissez une entreprise.')
  await form.getByLabel('Rechercher une entreprise', { exact: true }).fill('introuvable')
  await expect(form.getByText('Aucune entreprise trouvée.', { exact: true })).toBeVisible()
  await form.getByLabel('Rechercher une entreprise', { exact: true }).fill('Suivi')
  await form.getByRole('button', { name: company.name, exact: true }).click()
  await form.getByLabel('Titre', { exact: true }).fill('   ')
  expect(await form.getByLabel('Titre', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false)
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  expect(state.writes).toHaveLength(0)
  await form.getByLabel('Titre', { exact: true }).fill('Action horaire')
  await form.getByLabel('Échéance (Europe/Paris, facultatif)', { exact: true }).fill('2026-03-29T02:30')
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Cette heure n’existe pas')
  expect(state.writes).toHaveLength(0)
  await form.getByLabel('Échéance (Europe/Paris, facultatif)', { exact: true }).fill('2026-10-25T02:30')
  await form.getByLabel('Occurrence de l’heure (changement d’heure)', { exact: true }).selectOption('2026-10-25T01:30:00.000Z')
  state.delayMs = 250
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).dblclick()
  await expect(form).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).toMatchObject({ due_at: '2026-10-25T01:30:00.000Z', notes: null })
})

test('storage and network failures preserve form input and allow retry', async ({ page }) => {
  const state = await connectFollowUp(page, [action(1, { title: 'Saisie conservée' })])
  await openFollowUp(page)
  await page.getByRole('button', { name: 'Modifier Saisie conservée', exact: true }).click()
  const form = page.getByRole('form', { name: 'Modifier l’action', exact: true })
  await form.getByLabel('Titre', { exact: true }).fill('Modification à conserver')
  await form.getByLabel('Notes (facultatif)', { exact: true }).fill('Texte conservé')
  state.saveStatus = 503
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('temporairement indisponible')
  await expect(form.getByLabel('Titre', { exact: true })).toHaveValue('Modification à conserver')
  await expect(form.getByLabel('Notes (facultatif)', { exact: true })).toHaveValue('Texte conservé')
  await expect(page.getByText('private-backend-sentinel')).toHaveCount(0)
  state.saveStatus = 200
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(form).toHaveCount(0)
  state.networkFailure = true
  await page.getByLabel('Vue', { exact: true }).selectOption('all')
  await expect(page.getByRole('alert')).toContainText('Impossible de charger')
  state.networkFailure = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Modification à conserver', exact: true })).toBeVisible()
})

test('absent session returns to login and neutral subjects do not expose navigation', async ({ page }) => {
  const state = await connectFollowUp(page, [action(1, { title: 'Sujet opaque', subject_type: 'support.ticket' })])
  await openFollowUp(page)
  await expect(page.getByText('Sujet indisponible', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sujet indisponible', exact: true })).toHaveCount(0)
  state.readStatus = 401
  await page.getByLabel('Vue', { exact: true }).selectOption('all')
  await expect(page.getByRole('heading', { name: 'SUIVI', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
})

test('desktop uses a compact table, mobile remains readable without horizontal overflow', async ({ page }) => {
  await connectFollowUp(page, [action(1, { title: 'Préparer les points à discuter avec une entreprise au nom long', due_at: '2026-10-26T08:00:00Z' })])
  await openFollowUp(page)
  const table = page.getByRole('table', { name: 'Actions de suivi' })
  await expect(table.locator('thead th')).toHaveText(['Action', 'Sujet', 'Échéance', 'Statut', 'Actions'])
  expect(await table.evaluate((element) => getComputedStyle(element).display)).toBe('table')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Terminer Préparer les points à discuter avec une entreprise au nom long', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await table.evaluate((element) => getComputedStyle(element).display)).toBe('block')
})

test('a late action search response cannot replace the newer search results', async ({ page }) => {
  await connectFollowUp(page, [action(1, { title: 'ancienne réponse' }), action(2, { title: 'nouvelle réponse' })])
  await openFollowUp(page)
  let releaseOld!: () => void
  const held = new Promise<void>((resolve) => { releaseOld = resolve })
  let oldStarted = false, oldCompleted = false
  await page.route('**/admin/follow-up/worklist?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'ancien') {
      oldStarted = true
      await held
      await route.fallback()
      oldCompleted = true
    } else await route.fallback()
  })
  await page.getByLabel('Rechercher une action', { exact: true }).fill('ancien')
  await expect.poll(() => oldStarted).toBe(true)
  await page.getByLabel('Rechercher une action', { exact: true }).fill('nouvelle')
  await expect(page.getByRole('button', { name: 'nouvelle réponse', exact: true })).toBeVisible()
  releaseOld()
  await expect.poll(() => oldCompleted).toBe(true)
  await expect(page.getByRole('button', { name: 'ancienne réponse', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'nouvelle réponse', exact: true })).toBeVisible()
})
