import { expect, test, type Page } from '@playwright/test'
import { STATION_SCENARIOS } from '../../apps/browser-harness/scenarios/stations'
import { openHarness } from '../harness'

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

for (const scenario of STATION_SCENARIOS) {
  test(`opens ${scenario.screen}/${scenario.id} and captures a named screenshot`, async ({ page }, testInfo) => {
    const errors = watchBrowserErrors(page)
    await openHarness(page, { screen: scenario.screen, scenario: scenario.id })

    const host = page.locator(
      `[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`,
    )
    await expect(host).toBeVisible()
    const root = host.locator(':scope > [data-mx-ui]')
    await expect(root).toHaveCount(1)
    await expect(root.locator('*').first()).toBeAttached()
    expect(new URL(page.url()).searchParams.get('screen')).toBe(scenario.screen)
    expect(new URL(page.url()).searchParams.get('scenario')).toBe(scenario.id)
    expect(errors).toStrictEqual([])

    await page.screenshot({
      path: testInfo.outputPath(`${scenario.screen}-${scenario.id}.png`),
      fullPage: true,
    })
  })
}
