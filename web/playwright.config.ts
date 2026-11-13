import { defineConfig } from '@playwright/test'

// PW_PORT lets several checkouts run the suite at once, each against its own dev server.
const port = process.env.PW_PORT ?? '4173'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
})
