import { expect, test } from '@playwright/test'
import { openHarness } from './harness'

test('keeps end-HUD inspector horizontal scrolling inside its narrow-view container', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHarness(page, {
    screen: 'hud',
    scenario: 'end-hud-inspector',
    layout: 'single',
    panel: true,
  })

  const inspector = page.locator('main [data-end-hud-inspector]').first()
  await expect(inspector).toBeVisible()
  const dimensions = await inspector.evaluate((element) => ({
    clientWidth: element.clientWidth,
    right: element.getBoundingClientRect().right,
    scrollWidth: element.scrollWidth,
  }))
  const bodyScrollWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  const documentScrollWidth = await page.locator('html').evaluate((element) => element.scrollWidth)
  const viewportWidth = await page.evaluate(() => window.innerWidth)

  expect(dimensions.right).toBeLessThanOrEqual(viewportWidth)
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth)
  expect(documentScrollWidth).toBeLessThanOrEqual(viewportWidth)
})
