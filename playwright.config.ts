import { defineConfig, devices } from '@playwright/test'

const E2E_FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || '5173'
const baseURL = `http://127.0.0.1:${E2E_FRONTEND_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${E2E_FRONTEND_PORT}`,
    url: `${baseURL}/chat`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
