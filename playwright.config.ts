import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/flowstate/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'BASE=/flowstate/ npm run build && npx vite preview --port 4173 --strictPort --base /flowstate/',
    url: 'http://localhost:4173/flowstate/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
