import { expect, test, type Page } from '@playwright/test'
import { SESSION_SCENARIOS } from '../../apps/browser-harness/scenarios/session'
import { buildHarnessUrl } from '../harness'

const watchBrowserErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

for (const scenario of SESSION_SCENARIOS) {
  test(`opens ${scenario.screen}/${scenario.id} from its URL`, async ({ page }, testInfo) => {
    const errors = watchBrowserErrors(page)
    await page.goto(buildHarnessUrl({ screen: scenario.screen, scenario: scenario.id }))
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-ready'))

    const host = page.locator(
      `[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`,
    )
    await expect(host).toHaveCount(1)
    await expect(host).toBeVisible()
    expect(await host.evaluate((element) => element.childElementCount)).toBeGreaterThan(0)

    const readyCount = Number(await page.locator('html').getAttribute('data-harness-ready'))
    expect(Number.isInteger(readyCount) && readyCount > 0).toBe(true)
    expect(new URL(page.url()).searchParams.get('scenario')).toBe(scenario.id)
    expect(errors).toEqual([])

    const screenshotPath = testInfo.outputPath(`${scenario.screen}-${scenario.id}.png`)
    const screenshot = await page.screenshot({ path: screenshotPath })
    expect(screenshot.byteLength).toBeGreaterThan(0)
  })
}

test('opens the createSessionOverlays settings and debug stack from its URL', async ({ page }, testInfo) => {
  // Catch a registry mount that renders a different view or loses either visible overlay.
  const errors = watchBrowserErrors(page)
  const screen = 'session-overlays'
  const scenario = 'factory-settings-debug-open'
  await page.goto(buildHarnessUrl({ screen, scenario }))
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-ready'))

  const host = page.locator(`[data-harness-host="${screen}"][data-harness-scenario="${scenario}"]`)
  await expect(host).toHaveCount(1)
  await expect(host).toBeVisible()
  const overlays = host.locator('[data-mx-ui="session-overlays"]')
  await expect(overlays).toHaveCount(1)
  await expect(overlays).toBeVisible()
  await expect(overlays.locator('[data-mx-ui="debug-hud"]')).toBeVisible()
  await expect(overlays.locator('[data-mx-ui="settings"]')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('scenario')).toBe(scenario)
  expect(errors).toEqual([])

  const screenshot = await page.screenshot({
    path: testInfo.outputPath(`${screen}-${scenario}.png`),
  })
  expect(screenshot.byteLength).toBeGreaterThan(0)
})
