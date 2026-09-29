import { expect, test, type Locator, type Page } from '@playwright/test'

const tenantId = '11111111-1111-4111-8111-111111111111'
const prefix = `/admin/tenants/${tenantId}`
const tenant = { id: tenantId, name: 'Client synthétique', slug: 'synthetic', status: 'active' }

type Provider = ReturnType<typeof provider>
function provider(id: string, slug: string, name: string, verified = true) {
  return {
    id, tenant_id: tenantId, provider: slug,
    audit_supported: true, initial_ingestion_supported: true,
    credential_type: slug === 'notion' ? 'integration_token' : 'api_key',
    name, status: 'active',
    configuration: slug === 'notion' ? { workspace_reference: 'Espace synthétique' } : { base_url: 'https://automation.example.test' },
    credential_configured: true,
    created_at: '2026-09-15T08:00:00Z', updated_at: '2026-09-15T08:00:00Z',
    last_verified_at: verified ? '2026-09-15T08:00:00Z' : null,
    last_verification_status: verified ? 'ok' : null,
    last_verification_http_status: verified ? 200 : null,
    last_verification_code: null, last_verification_message: null,
  }
}

const notion = provider('notion-id', 'notion', 'Notion Novalia')
const n8n = provider('n8n-id', 'n8n', 'novalia - n8n', false)
const unknown = provider('custom-id', 'custom_tool', 'Outil sur mesure')

async function openSources(page: Page, records: Provider[] = [notion, n8n, unknown]) {
  const requests: string[] = []
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    const method = route.request().method()
    requests.push(`${method} ${url.pathname}`)
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/admin/tenants') return route.fulfill({ json: [tenant] })
    if (url.pathname === prefix) return route.fulfill({ json: tenant })
    if (url.pathname === `${prefix}/providers`) return route.fulfill({ json: records })
    if (url.pathname === `${prefix}/providers/n8n-id/verify` && method === 'POST') {
      return route.fulfill({ json: {
        status: 'ok', checked_at: '2026-09-15T10:27:00Z', provider: 'n8n',
        http_status: 200, code: null, message: null,
      } })
    }
    if (url.pathname === `${prefix}/providers/notion-id` && method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' })
    }
    if (url.pathname === `${prefix}/providers/notion-id` && method === 'PATCH') {
      const body = route.request().postDataJSON() as { name?: string }
      return route.fulfill({ json: { ...notion, name: body.name ?? notion.name } })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await page.getByRole('button', { name: 'Client synthétique', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Client synthétique', exact: true })).toBeVisible()
  const mobileMenu = page.getByRole('button', { name: 'Menu du client' })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await page.getByRole('navigation', { name: 'Navigation du client' }).getByRole('button', { name: 'Sources' }).click()
  await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible()
  await expect(page.locator('.source-connection')).toHaveCount(records.length)
  return { requests }
}

async function expectMenuFullyVisible(page: Page, trigger: Locator) {
  await trigger.click()
  const contentId = await trigger.getAttribute('aria-controls')
  expect(contentId).toBeTruthy()
  const menu = page.locator(`#${contentId}`)
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  const uncovered = await menu.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return [
      [box.left + 4, box.top + 4],
      [box.right - 4, box.top + 4],
      [box.left + 4, box.bottom - 4],
      [box.right - 4, box.bottom - 4],
      [box.left + box.width / 2, box.top + box.height / 2],
    ].every(([x, y]) => {
      const hit = document.elementFromPoint(x, y)
      return hit !== null && (hit === element || element.contains(hit))
    })
  })
  expect(uncovered).toBe(true)
  return menu
}

test('Sources uses compact accessible rows, real details and a scoped header/sidebar', async ({ page }) => {
  await openSources(page)
  const workspace = page.locator('.tenant-workspace--sources')
  const rows = page.locator('.source-connection')
  await expect(workspace.locator('.tenant-workspace__breadcrumb')).toHaveCount(0)
  await expect(workspace.locator('.tenant-workspace__heading .tenant-status')).toHaveCount(0)
  await expect(workspace.getByRole('button', { name: 'Archiver le client' })).toBeVisible()
  await expect(workspace.getByText('Gérez les outils et services connectés à cet espace.')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Navigation du client' })
  await expect(nav.getByRole('button', { name: 'Sources' })).toHaveClass(/tenant-navigation__item--sources-active/)
  await expect(nav.getByRole('button', { name: 'Audit' })).not.toHaveClass(/sources-active/)
  await expect(rows.nth(0).getByRole('img', { name: 'Logo de Notion' })).toBeVisible()
  await expect(rows.nth(1).getByRole('img', { name: 'Logo de n8n' })).toBeVisible()
  await expect(rows.nth(2).getByRole('img', { name: 'Logo indisponible pour custom tool' })).toBeVisible()
  await expect(rows.nth(0).getByText('Connecté')).toBeVisible()
  await expect(rows.nth(1).getByText('À vérifier')).toBeVisible()
  const firstToggle = rows.nth(0).getByRole('button', { name: 'Détails de la connexion Notion Novalia' })
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(rows.nth(0).getByText('Espace synthétique')).toBeHidden()
  await firstToggle.focus()
  await page.keyboard.press('Enter')
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(rows.nth(0).getByText('Espace synthétique')).toBeVisible()
  await expect(rows.nth(0).getByText('HTTP 200')).toBeVisible()
  await rows.nth(1).getByRole('button', { name: 'Détails de la connexion novalia - n8n' }).click()
  await expect(firstToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(rows.nth(1).getByText('https://automation.example.test')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Connecter un outil' })).toBeVisible()
  await expect(page.getByText('+ Ajouter un provider')).toHaveCount(0)
  await nav.getByRole('button', { name: 'Audit' }).click()
  await expect(page.locator('.tenant-workspace__breadcrumb')).toContainText('Audit')
  await expect(page.locator('.tenant-workspace__heading .tenant-status')).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Audit' })).not.toHaveClass(/sources-active/)
})

test('menu actions preserve verification, editing and explicit disable confirmation', async ({ page }) => {
  const { requests } = await openSources(page)
  const rows = page.locator('.source-connection')
  const n8nToggle = rows.nth(1).getByRole('button', { name: 'Détails de la connexion novalia - n8n' })
  await n8nToggle.click()
  const n8nMenu = await expectMenuFullyVisible(page, rows.nth(1).getByRole('button', { name: 'Actions pour novalia - n8n' }))
  await expect(n8nToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(n8nMenu.getByRole('button').allTextContents()).resolves.toEqual([
    'Modifier', 'Modifier les identifiants', 'Vérifier la connexion', 'Désactiver',
  ])
  await n8nMenu.getByRole('button', { name: 'Vérifier la connexion' }).click()
  await expect(rows.nth(1).getByText('Connecté')).toBeVisible()
  await expect(rows.nth(1).getByRole('button', { name: 'Actions pour novalia - n8n' })).toBeFocused()
  expect(requests).toContain(`POST ${prefix}/providers/n8n-id/verify`)

  const notionMenu = await expectMenuFullyVisible(page, rows.nth(0).getByRole('button', { name: 'Actions pour Notion Novalia' }))
  await notionMenu.getByRole('button', { name: 'Modifier', exact: true }).click()
  await expect(rows.nth(0).getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await rows.nth(0).getByRole('button', { name: 'Annuler' }).click()
  const credentialMenu = await expectMenuFullyVisible(page, rows.nth(0).getByRole('button', { name: 'Actions pour Notion Novalia' }))
  await credentialMenu.getByRole('button', { name: 'Modifier les identifiants' }).click()
  await expect(rows.nth(0).getByRole('button', { name: 'Remplacer' })).toBeVisible()
  await rows.nth(0).getByRole('button', { name: 'Annuler' }).click()
  const disableMenu = await expectMenuFullyVisible(page, rows.nth(0).getByRole('button', { name: 'Actions pour Notion Novalia' }))
  await disableMenu.getByRole('button', { name: 'Désactiver' }).click()
  const confirmation = rows.nth(0).getByRole('alertdialog')
  await expect(confirmation).toBeVisible()
  expect(requests).not.toContain(`DELETE ${prefix}/providers/notion-id`)
  await confirmation.getByRole('button', { name: 'Annuler' }).click()
  expect(requests).not.toContain(`DELETE ${prefix}/providers/notion-id`)
  const finalMenu = await expectMenuFullyVisible(page, rows.nth(0).getByRole('button', { name: 'Actions pour Notion Novalia' }))
  await finalMenu.getByRole('button', { name: 'Désactiver' }).click()
  await rows.nth(0).getByRole('alertdialog').getByRole('button', { name: 'Confirmer la désactivation' }).click()
  await expect(rows.nth(0).getByText('Inactif')).toBeVisible()
  expect(requests).toContain(`DELETE ${prefix}/providers/notion-id`)
  const inactiveMenu = await expectMenuFullyVisible(page, rows.nth(0).getByRole('button', { name: 'Actions pour Notion Novalia' }))
  await expect(inactiveMenu.getByRole('button', { name: 'Activer' })).toBeVisible()
})

test('portal menu stays above adjacent rows and inside the viewport at middle, last and mobile edges', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 })
  const records = Array.from({ length: 12 }, (_, index) => provider(`record-${index}`, index % 2 ? 'n8n' : 'notion', `Connexion ${index}`))
  await openSources(page, records)
  const rows = page.locator('.source-connection')
  const middleTrigger = rows.nth(5).getByRole('button', { name: 'Actions pour Connexion 5' })
  const middleMenu = await expectMenuFullyVisible(page, middleTrigger)
  await expect(middleMenu.getByRole('button', { name: 'Désactiver' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(middleTrigger).toBeFocused()
  const lastTrigger = rows.nth(11).getByRole('button', { name: 'Actions pour Connexion 11' })
  await lastTrigger.evaluate((element) => element.scrollIntoView({ block: 'end' }))
  const lastMenu = await expectMenuFullyVisible(page, lastTrigger)
  await expect(lastMenu.getByRole('button', { name: 'Désactiver' })).toBeVisible()
  const menuBox = await lastMenu.boundingBox()
  const triggerBox = await lastTrigger.boundingBox()
  expect(menuBox!.y).toBeLessThan(triggerBox!.y)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('desktop menu opens below its trigger and supports Enter, Tab, Escape and outside click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSources(page)
  await page.screenshot({ path: '/tmp/syncoria-107-sources-desktop.png', fullPage: true })
  const trigger = page.getByRole('button', { name: 'Actions pour Notion Novalia' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const contentId = await trigger.getAttribute('aria-controls')
  const menu = page.locator(`#${contentId}`)
  await expect(menu).toBeVisible()
  const menuBox = await menu.boundingBox()
  const triggerBox = await trigger.boundingBox()
  expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height)
  await page.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Modifier', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(menu).toBeVisible()
  await page.getByRole('heading', { name: 'Sources', exact: true }).click()
  await expect(menu).toHaveCount(0)
})

test('mobile Sources screenshot and compact layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSources(page)
  await page.screenshot({ path: '/tmp/syncoria-107-sources-mobile.png', fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await expect(page.locator('.source-connection')).toHaveCount(3)
})
