import { defineConfig } from '@playwright/test'

export const HARNESS_PORT: number = Number(process.env['HARNESS_PORT'] ?? '5182')

const config: ReturnType<typeof defineConfig> = defineConfig({
  testDir: './test-browser',
  testMatch: '**/environment.spec.ts',
  outputDir: process.env['PLAYWRIGHT_OUTPUT_DIR'] ?? 'test-results',
  timeout: 30_000,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(HARNESS_PORT)}`,
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm preview:browser',
    url: `http://localhost:${String(HARNESS_PORT)}`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})

export default config
