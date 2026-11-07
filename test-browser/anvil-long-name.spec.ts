import { expect, test } from '@playwright/test'
import { openHarness } from './harness'

const longName = `${'LongName'.repeat(12)}\n😀 مرحبا עברית Ａbc１２3\u0001`

// Catches a clipped long anvil name with no accessible full value.
test('long anvil item names remain readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openHarness(page, {
    screen: 'anvil',
    scenario: 'name-text-boundaries',
    width: 320,
    height: 568,
  })

  const longNameInput = page.getByRole('textbox', { name: 'Item name' })
  await expect(longNameInput).toHaveValue(longName.replace(/\r?\n/gu, ''))
  await expect(longNameInput).toHaveAttribute('title', longName)
  const longNameLayout = await longNameInput.evaluate((element) => ({
    inputLeft: element.getBoundingClientRect().left,
    inputRight: element.getBoundingClientRect().right,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }))
  expect(longNameLayout.documentScrollWidth).toBeLessThanOrEqual(longNameLayout.documentClientWidth)
  expect(longNameLayout.inputLeft).toBeGreaterThanOrEqual(0)
  expect(longNameLayout.inputRight).toBeLessThanOrEqual(longNameLayout.documentClientWidth)

  await openHarness(page, {
    screen: 'anvil',
    scenario: 'one-character-rename',
    width: 320,
    height: 568,
  })

  const shortNameInput = page.getByRole('textbox', { name: 'Item name' })
  await expect(shortNameInput).toHaveValue('A')
  await expect(shortNameInput).toHaveAttribute('title', 'A')
  const shortNameLayout = await shortNameInput.evaluate((element) => ({
    inputLeft: element.getBoundingClientRect().left,
    inputRight: element.getBoundingClientRect().right,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }))
  expect(shortNameLayout.documentScrollWidth).toBeLessThanOrEqual(shortNameLayout.documentClientWidth)
  expect(shortNameLayout.inputLeft).toBeGreaterThanOrEqual(0)
  expect(shortNameLayout.inputRight).toBeLessThanOrEqual(shortNameLayout.documentClientWidth)
})
