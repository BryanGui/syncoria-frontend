import { test, expect } from '@playwright/test'

test('action menu closes after selection and when focus leaves the menu', async ({ page }) => {
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4173') return route.continue()
    if (url.origin !== 'https://api.bryanlab.ovh') return route.abort()
    if (url.pathname === '/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (url.pathname === '/health' || url.pathname === '/health/db') {
      return route.fulfill({ json: { status: 'ok' } })
    }
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/?ui-interaction-test=1')
  await expect(page.getByRole('heading', { name: 'Test ActionMenu', exact: true })).toBeVisible()

  const menu = page.locator('details.ui-action-menu')
  const trigger = menu.locator('summary')
  const controlledId = await trigger.getAttribute('aria-controls')
  expect(controlledId).toBeTruthy()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator(`#${controlledId}`)).toHaveCount(1)

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveAttribute('open', '')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(menu).not.toHaveAttribute('open', '')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')

  await menu.getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(menu).not.toHaveAttribute('open', '')

  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')
  await page.locator('#action-menu-focus-target').focus()
  await expect(menu).not.toHaveAttribute('open', '')

  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(menu).not.toHaveAttribute('open', '')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
})
