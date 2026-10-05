import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', serviceWorkers: 'block' },
  webServer: {
    timeout: 180000,
    command: 'node tests/browser/serve-playwright.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
