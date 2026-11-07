import { expect, test, type Page } from '@playwright/test'
import { openHarness } from './harness'

type BrowserErrors = { consoleErrors: Array<string>; pageErrors: Array<string> }

const watchBrowserErrors = (page: Page): BrowserErrors => {
  const errors: BrowserErrors = { consoleErrors: [], pageErrors: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.pageErrors.push(error.message))
  return errors
}

const openMcSimInventory = async (page: Page): Promise<BrowserErrors> => {
  const errors = watchBrowserErrors(page)
  await openHarness(page, { screen: 'inventory', scenario: 'mc-sim-roundtrip' })
  return errors
}

const inventoryRoot = (page: Page) =>
  page.locator('[data-harness-host="inventory"][data-harness-scenario="mc-sim-roundtrip"] [data-mx-ui="inventory"]')

const firstHotbarSlot = (page: Page) =>
  inventoryRoot(page).locator('[data-region="hotbar"] [data-mx-ui="slot"][data-slot-index="0"]')

// Catches an accepted mc-sim inventory update being omitted from the mx-ui projection.
test('renders inventory state after a UI intent reaches mc-sim', async ({ page }, testInfo) => {
  const errors = await openMcSimInventory(page)
  const inventory = inventoryRoot(page)
  const firstSlot = firstHotbarSlot(page)

  await expect(inventory).toBeVisible()
  await expect(firstSlot).toHaveAttribute('data-empty', '')
  await page.getByRole('button', { name: 'Add two stone' }).click()

  await expect(firstSlot.locator('[data-mx-ui="slot-item"]')).toHaveText('stone')
  await expect(firstSlot.locator('[data-mx-ui="slot-count"]')).toHaveText('2')
  await expect(inventory.locator('[data-mx-ui="inventory-status"]'))
    .toHaveText('mc-sim accepted: added two stone; 0 leftover.')
  expect(errors.consoleErrors).toStrictEqual([])
  expect(errors.pageErrors).toStrictEqual([])

  await page.screenshot({
    path: testInfo.outputPath('inventory-mc-sim-roundtrip.png'),
    fullPage: true,
  })
})

// Catches a service rejection being swallowed or displayed as a successful inventory change.
test('shows mc-sim rejection for an invalid inventory intent', async ({ page }) => {
  const errors = await openMcSimInventory(page)
  const inventory = inventoryRoot(page)
  const firstSlot = firstHotbarSlot(page)

  await page.getByRole('button', { name: 'Try invalid slot' }).click()

  await expect(inventory.locator('[data-mx-ui="inventory-status"]'))
    .toHaveText('mc-sim rejected intent: InvalidSlot.')
  await expect(firstSlot).toHaveAttribute('data-empty', '')
  expect(errors.consoleErrors).toStrictEqual([])
  expect(errors.pageErrors).toStrictEqual([])
})
