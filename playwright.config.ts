import { defineConfig, devices } from '@playwright/test'

const baseURL = `http://localhost:${process.env.PORT ?? 5173}/cubie/`

// 兩組環境：桌機 Chromium，以及模擬 iPhone Safari 的 WebKit（390×844、觸控）
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'iphone',
      use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } },
    },
  ],
})
