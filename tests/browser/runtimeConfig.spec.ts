import { expect, test, type Page } from '@playwright/test'

const frontendOrigin = 'http://127.0.0.1:4173'

async function mockApi(page: Page, bases: string[]) {
  const calls: { url: string; method: string }[] = []
  let authenticated = true
  await page.context().route('**/*', async (route) => {
    const request = route.request()
    if (new URL(request.url()).origin === frontendOrigin) return route.continue()
    calls.push({ url: request.url(), method: request.method() })
    const base = bases.find((value) => request.url().startsWith(`${value}/`))
    if (!base) return route.abort()
    const path = request.url().slice(base.length)
    if (path === '/me' || path === '/auth/session') {
      return route.fulfill({ status: 401, json: {} })
    }
    if (path === '/admin/session') {
      if (request.method() === 'DELETE') authenticated = false
      if (request.method() === 'POST') authenticated = true
      return route.fulfill({ json: { authenticated } })
    }
    if (path === '/admin/tenants') return route.fulfill({ json: [] })
    if (path === '/health' || path === '/health/db') {
      return route.fulfill({ json: { status: 'ok' } })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  return calls
}

test('the shipped configuration preserves the current backend and cockpit', async ({ page }) => {
  const calls = await mockApi(page, ['https://api.bryanlab.ovh'])
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  expect(calls).toContainEqual({ url: 'https://api.bryanlab.ovh/me', method: 'GET' })
  expect(calls).toContainEqual({ url: 'https://api.bryanlab.ovh/admin/session', method: 'GET' })
  expect(calls.every(({ url }) => url.startsWith('https://api.bryanlab.ovh/'))).toBe(true)
})

test('reload uses a changed runtime URL with the same compiled assets, including health checks', async ({ page }) => {
  const bases = ['https://first-api.example.test/v1', 'https://second-api.example.test/v2']
  const calls = await mockApi(page, bases)
  let apiBaseUrl = bases[0]
  await page.route('**/runtime-config.json', (route) => route.fulfill({
    json: { apiBaseUrl: ` ${apiBaseUrl}/// ` },
  }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  await expect.poll(() => calls).toContainEqual({ url: `${bases[0]}/admin/tenants`, method: 'GET' })
  const scripts = await page.locator('script[src]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')))

  apiBaseUrl = bases[1]
  calls.length = 0
  await page.reload()
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Outils existants · legacy', exact: true }).click()
  await expect.poll(() => calls.some(({ url }) => url === `${bases[1]}/health/db`)).toBe(true)
  await expect.poll(() => calls).toContainEqual({ url: `${bases[1]}/health`, method: 'GET' })
  expect(calls).toContainEqual({ url: `${bases[1]}/admin/session`, method: 'GET' })
  expect(calls.every(({ url }) => url.startsWith(`${bases[1]}/`))).toBe(true)
  expect(await page.locator('script[src]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')))).toEqual(scripts)
})

test('admin login, logout and client login share the runtime configuration', async ({ page }) => {
  const base = 'https://runtime-api.example.test/prefix'
  const calls = await mockApi(page, [base])
  await page.route('**/runtime-config.json', (route) => route.fulfill({ json: { apiBaseUrl: base } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
  await page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('button', { name: 'Se connecter' }).click()
  await page.getByLabel('Identifiant', { exact: true }).fill('synthetic-operator')
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-input')
  await page.getByRole('dialog').getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
  await page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('button', { name: 'Espace client', exact: true }).click()
  await page.getByLabel('Entreprise', { exact: true }).fill('synthetic-tenant')
  await page.getByLabel('Identifiant', { exact: true }).fill('synthetic-client')
  await page.getByLabel('Mot de passe', { exact: true }).fill('synthetic-input')
  await page.getByRole('dialog').getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect.poll(() => calls.some(({ url, method }) => url === `${base}/auth/session` && method === 'POST')).toBe(true)
  expect(calls).toContainEqual({ url: `${base}/admin/session`, method: 'POST' })
  expect(calls).toContainEqual({ url: `${base}/admin/session`, method: 'DELETE' })
  expect(calls.every(({ url }) => url.startsWith(`${base}/`))).toBe(true)
})

test('waits for configuration before making any API request', async ({ page }) => {
  const calls = await mockApi(page, ['https://api.example.test'])
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/runtime-config.json', async (route) => {
    await pending
    await route.fulfill({ json: { apiBaseUrl: 'https://api.example.test' } })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status')).toHaveText('Chargement de la configuration…')
  expect(calls).toEqual([])
  release()
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  expect(calls.length).toBeGreaterThan(0)
})

for (const failure of ['missing', 'unavailable', 'offline', 'invalid JSON', 'missing URL', 'unsafe URL']) {
  test(`configuration failure (${failure}) prevents API calls and allows recovery`, async ({ page }) => {
    const calls = await mockApi(page, ['https://recovered.example.test'])
    let recovered = false
    await page.route('**/runtime-config.json', (route) => {
      if (recovered) return route.fulfill({ json: { apiBaseUrl: 'https://recovered.example.test' } })
      if (failure === 'offline') return route.abort()
      if (failure === 'missing') return route.fulfill({ status: 404, body: '' })
      if (failure === 'unavailable') return route.fulfill({ status: 503, body: '' })
      if (failure === 'invalid JSON') return route.fulfill({ contentType: 'text/html', body: '<html>SPA fallback</html>' })
      if (failure === 'missing URL') return route.fulfill({ json: {} })
      return route.fulfill({ json: { apiBaseUrl: 'javascript:alert(1)' } })
    })
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('La configuration des services est indisponible.')
    expect(calls).toEqual([])
    recovered = true
    await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
    expect(calls).toContainEqual({ url: 'https://recovered.example.test/admin/session', method: 'GET' })
  })
}
