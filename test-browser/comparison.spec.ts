import { expect, test, type Page } from '@playwright/test'
import { openHarness } from './harness'

const watchErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const paneFor = (page: Page, side: 'left' | 'right') =>
  page.locator(`[data-comparison-pane="${side}"]`)

// Catches comparison panes that silently reuse the selected scenario's motion setting.
test('mounts the same scenario under full and reduced motion', async ({ page }) => {
  const errors = watchErrors(page)
  await openHarness(page, { panel: true, screen: 'crosshair' })
  const left = paneFor(page, 'left')
  const right = paneFor(page, 'right')

  await expect(left).toBeVisible()
  await expect(right).toBeVisible()
  await expect(left).toHaveAttribute('data-scenario-id', 'default')
  await expect(right).toHaveAttribute('data-scenario-id', 'default')
  await expect(left).toHaveAttribute('data-motion', 'full')
  await expect(right).toHaveAttribute('data-motion', 'reduced')
  await expect(left.locator('[data-comparison-host] > [data-mx-ui]')).toHaveCount(1)
  await expect(right.locator('[data-comparison-host] > [data-mx-ui]')).toHaveCount(1)
  expect(errors).toEqual([])
})

// Catches color-vision panes that label a mode but fail to apply its filter.
test('applies supported color-vision conditions to matching scenario panes', async ({ page }) => {
  const errors = watchErrors(page)
  await openHarness(page, { panel: true, screen: 'main-menu' })
  await page.getByLabel('Comparison conditions').selectOption('color-vision')
  await page.getByLabel('Color vision mode').selectOption('protanopia')
  const left = paneFor(page, 'left')
  const right = paneFor(page, 'right')

  await expect(left).toHaveAttribute('data-scenario-id', 'default')
  await expect(right).toHaveAttribute('data-scenario-id', 'default')
  await expect(left).toHaveAttribute('data-cvd', 'off')
  await expect(right).toHaveAttribute('data-cvd', 'protanopia')
  const leftFilter = await left.locator('[data-comparison-host]').evaluate((host) => getComputedStyle(host).filter)
  const rightFilter = await right.locator('[data-comparison-host]').evaluate((host) => getComputedStyle(host).filter)
  expect(leftFilter).not.toBe(rightFilter)
  expect(errors).toEqual([])
})

// Catches a missing baseline being reported as a successful visual comparison.
test('shows not compared when the selected scenario has no approved baseline', async ({ page }) => {
  const errors = watchErrors(page)
  await openHarness(page, { panel: true, screen: 'captions' })
  const comparison = page.locator('[data-condition-comparison]')

  await expect(comparison.locator('[data-baseline-status="not-compared"]')).toHaveCount(2)
  await expect(comparison.locator('[data-baseline-status="not-compared"]').first()).toContainText(
    'Not compared: no approved baseline',
  )
  await expect(comparison.locator('[data-baseline-slider]')).toHaveCount(0)
  expect(errors).toEqual([])
})

// Catches a tracked approved baseline being omitted or its slider failing to change the overlay.
test('shows the approved full-motion baseline and drives its overlay slider', async ({ page }) => {
  const errors = watchErrors(page)
  await openHarness(page, { panel: true, screen: 'main-menu' })
  const left = paneFor(page, 'left')
  const right = paneFor(page, 'right')
  const slider = left.locator('[data-baseline-slider]')
  const image = left.locator('[data-comparison-baseline]')

  await expect(left).toHaveAttribute('data-motion', 'full')
  await expect(slider).toHaveCount(1)
  await expect(image).toBeVisible()
  const baselineWidth = await image.evaluate((baseline) => {
    if (!(baseline instanceof HTMLImageElement)) {
      throw new Error('Expected the comparison baseline to be an image element')
    }
    return baseline.naturalWidth
  })
  expect(baselineWidth).toBeGreaterThan(0)
  await expect(right.locator('[data-baseline-slider]')).toHaveCount(0)

  await slider.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected the baseline slider to be an input element')
    }
    input.value = '27'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(slider).toHaveAttribute('data-overlay-opacity', '27')
  await expect(image).toHaveCSS('opacity', '0.27')
  expect(errors).toEqual([])
})

// Negative control: catches a full/off baseline leaking into a deuteranopia pane.
test('does not compare a condition without its own approved baseline', async ({ page }) => {
  const errors = watchErrors(page)
  await openHarness(page, { panel: true, screen: 'main-menu' })
  await page.getByLabel('Comparison conditions').selectOption('color-vision')
  await page.getByLabel('Color vision mode').selectOption('deuteranopia')
  const left = paneFor(page, 'left')
  const right = paneFor(page, 'right')

  await expect(left.locator('[data-baseline-slider]')).toHaveCount(1)
  await expect(right).toHaveAttribute('data-cvd', 'deuteranopia')
  await expect(right.locator('[data-baseline-slider]')).toHaveCount(0)
  await expect(right.locator('[data-baseline-status="not-compared"]')).toContainText(
    'Not compared: no approved baseline',
  )
  expect(errors).toEqual([])
})
