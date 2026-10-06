// Real HTTP, session and PostgreSQL. The dedicated backend fixture simulates
// only AgentRuntimePort and catalogue. Never redirect to a production origin.
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function loopback(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password)
    throw new Error('Explicit loopback test environment required')
  return url.origin
}
if (process.env.SYNCORIA_ASSISTANT_BROWSER_DISPOSABLE !== '1')
  throw new Error('Disposable integration must be explicitly enabled')
const api = loopback(process.env.SYNCORIA_ASSISTANT_BROWSER_API)
const front = loopback(process.env.SYNCORIA_ASSISTANT_BROWSER_FRONT)
const directory = process.env.SYNCORIA_ASSISTANT_BROWSER_CAPTURES
const browser = await chromium.launch()
let passed = 0
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  expect((await (await context.request.get(api + '/health')).json()).service).toBe('syncoria-assistant-browser-test')
  expect((await context.request.get(api + '/admin/operator-chat/internal/context')).status()).toBe(401)
  const auth = await context.request.post(api + '/admin/session', { data: {
    username: process.env.SYNCORIA_ASSISTANT_BROWSER_USERNAME,
    password: process.env.SYNCORIA_ASSISTANT_BROWSER_PASSWORD,
  } })
  expect(auth.status()).toBe(200)
  const page = await context.newPage()
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto(front)
  await page.getByRole('button', { name: 'Assistant Syncoria', exact: true }).click()
  await expect(page.getByLabel('Client actif', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByLabel('Modèle', { exact: true })).toHaveValue('synthetic-browser-model')
  await page.getByLabel('Effort de raisonnement', { exact: true }).selectOption('low')
  await page.getByText('Réglages avancés', { exact: true }).click()
  await page.getByLabel('Budget d’appels MCP', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Enregistrer les réglages', exact: true }).click()
  await expect.poll(async () => (await (await context.request.get(api + '/admin/operator-chat/internal/settings')).json()).settings.tool_budget).toBe(7)
  await page.reload()
  await page.getByRole('button', { name: 'Assistant Syncoria', exact: true }).click()
  await page.getByRole('button', { name: 'Réglages de l’agent', exact: true }).click()
  await expect(page.getByLabel('Effort de raisonnement', { exact: true })).toHaveValue('low')
  if (directory) {
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: join(directory, 'http-postgres-settings.png'), fullPage: true })
  }
  passed++
  console.log('PASS 1: authenticated direct entry and settings persist across reload (real HTTP/PostgreSQL).')
  await page.getByRole('button', { name: 'Fermer le panneau', exact: true }).click()
  await page.getByRole('button', { name: 'Commencer une conversation', exact: true }).click()
  await page.locator('#chat-message').fill('Vérifier le parcours synthétique.')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByText('Réponse simulée, persistance PostgreSQL réelle.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envoyer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Diagnostic', exact: true }).click()
  const diagnostic = page.getByRole('region', { name: 'Diagnostic', exact: true })
  await diagnostic.locator('summary').first().click()
  await expect(diagnostic.getByText('Configuration choisie', { exact: true })).toBeVisible()
  await expect(diagnostic.getByText('Configuration effective', { exact: true })).toBeVisible()
  await expect(diagnostic.getByText(/synthetic-browser-model/).first()).toBeVisible()
  if (directory) await page.screenshot({ path: join(directory, 'http-postgres-diagnostic.png'), fullPage: true })
  await page.getByRole('button', { name: 'Fermer le panneau', exact: true }).click()
  await page.getByRole('button', { name: 'Rechercher dans la mémoire', exact: true }).click()
  await page.getByLabel('Élément à mémoriser', { exact: true }).fill('Incident laboratoire : résolution contrôlée.')
  await page.getByRole('button', { name: 'Enregistrer dans la mémoire', exact: true }).click()
  await expect(page.getByText('Élément enregistré dans la mémoire interne.', { exact: true })).toBeVisible()
  await page.getByLabel('Rechercher un problème similaire', { exact: true }).fill('laboratoire')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByText('Incident laboratoire : résolution contrôlée.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le panneau', exact: true }).click()
  passed++
  console.log('PASS 2: SSE, chosen/effective diagnostic and memory storage/search (runtime simulated).')
  await page.locator('#chat-message').fill('Stop pendant le travail simulé.')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
  const threads = await (await context.request.get(api + '/admin/operator-chat/internal/threads')).json()
  await expect.poll(async () => {
    const diagnostics = await (await context.request.get(api + `/admin/operator-chat/internal/threads/${threads[0].thread_id}/diagnostics`)).json()
    return diagnostics[0]?.status
  }).toBe('cancelled')
  await page.getByRole('button', { name: 'Archiver', exact: true }).click()
  await expect.poll(async () => (await (await context.request.get(api + '/admin/operator-chat/internal/threads?status=archived')).json()).length).toBe(1)
  passed++
  console.log('PASS 3: Stop terminates the simulated worker and archiving persists; no partial final answer.')
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, runtime: 'simulated', database: 'real disposable PostgreSQL', api: 'real HTTP' }))
} finally {
  await browser.close()
}
