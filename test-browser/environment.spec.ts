import { expect, test } from '@playwright/test'
import { SCENARIO_REGISTRY } from '../apps/browser-harness/scenario-registry'
import { openHarness } from './harness'

type HorizontalBounds = {
  readonly label: string
  readonly left: number
  readonly right: number
}

const horizontalOverflows = (
  elements: ReadonlyArray<HorizontalBounds>,
  viewportWidth: number,
): ReadonlyArray<string> =>
  elements.flatMap(({ label, left, right }) =>
    left < 0 || right > viewportWidth ? [label] : [],
  )

for (const scenario of SCENARIO_REGISTRY) {
  // Catches a scenario that loses its ID, renders no view, overflows on mobile, or raises browser errors.
  test(`renders ${scenario.screen}/${scenario.id} without browser errors`, async ({ page }, testInfo) => {
    const pageErrors: Array<string> = []
    const consoleErrors: Array<string> = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await openHarness(page, {
      screen: scenario.screen,
      scenario: scenario.id,
      layout: 'single',
      panel: true,
    })

    const host = page.locator(
      `[data-harness-host="${scenario.screen}"][data-harness-scenario="${scenario.id}"]`,
    )
    await expect(host).toBeVisible()
    await expect(host).toHaveAttribute('data-harness-scenario', scenario.id)
    await expect(page.locator(`[data-scenario-buttons] button[data-scenario-id="${scenario.id}"]`))
      .toHaveText(scenario.title)

    const view = page.locator('main')
    const scenarioRoot = host.locator(':scope > [data-mx-ui]')
    const fallbackSurface = view.locator('[role="alert"], [role="dialog"], [role="region"], table')
    const hasScenarioRoot = (await scenarioRoot.count()) > 0
    const hasFallbackSurface = (await fallbackSurface.count()) > 0
    expect(hasScenarioRoot || hasFallbackSurface).toBe(true)
    const surface = hasScenarioRoot ? scenarioRoot.first() : fallbackSurface.first()
    const renderedContent = await surface.evaluate((element) => ({
      childElements: element.childElementCount,
      text: element.textContent?.trim() ?? '',
    }))
    expect(renderedContent.childElements > 0 || renderedContent.text.length > 0).toBe(true)
    expect(new URL(page.url()).searchParams.get('scenario')).toBe(scenario.id)

    if (testInfo.project.name === 'mobile') {
      const viewportWidth = await page.evaluate(() => window.innerWidth)
      const bounds = await view.evaluate((viewElement) =>
        [viewElement, ...Array.from(viewElement.querySelectorAll('*'))].map((element) => {
          const rect = element.getBoundingClientRect()
          const className = element.getAttribute('class')
          const text = element.textContent?.trim().slice(0, 24) ?? ''
          return {
            label: [element.tagName.toLowerCase(), className, text]
              .filter((part) => part !== null && part.length > 0)
              .join('.'),
            left: rect.left,
            right: rect.right,
          }
        }),
      )
      const overflowingBounds = bounds
        .filter(({ left, right }) => left < 0 || right > viewportWidth)
        .map((element) => ({
          ...element,
          overflowBy: Math.max(0, -element.left, element.right - viewportWidth),
        }))
      expect(
        horizontalOverflows(bounds, viewportWidth),
        JSON.stringify({ viewportWidth, overflowingBounds }),
      ).toEqual([])
    }

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}

// Catches a horizontal overflow detector that misses content extending beyond the viewport.
test('overflow detector identifies a deliberately oversized element', async ({ page }) => {
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const oversizedElement = await page.evaluate(() => {
    const element = document.createElement('div')
    element.style.position = 'fixed'
    element.style.left = '0'
    element.style.top = '0'
    element.style.height = '1px'
    element.style.width = `${String(window.innerWidth + 1)}px`
    document.body.append(element)
    const rect = element.getBoundingClientRect()
    element.remove()
    return [{ label: 'deliberately oversized element', left: rect.left, right: rect.right }]
  })

  expect(horizontalOverflows(oversizedElement, viewportWidth)).toEqual([
    'deliberately oversized element',
  ])
})
