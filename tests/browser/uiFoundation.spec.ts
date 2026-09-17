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

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bibliothèque UI', exact: true })).toBeVisible()

  const menu = page.locator('details.ui-action-menu')
  const trigger = menu.locator('summary')
  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')

  await menu.getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(menu).not.toHaveAttribute('open', '')

  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')
  await page.locator('#reference-name').focus()
  await expect(menu).not.toHaveAttribute('open', '')

  await trigger.click()
  await expect(menu).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(menu).not.toHaveAttribute('open', '')
  await expect(trigger).toBeFocused()
})
