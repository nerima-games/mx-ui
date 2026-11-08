import { expect, test } from '@playwright/test'
import { INVENTORY_SCENARIOS } from '../../apps/browser-harness/scenarios/inventory'
import { openHarness } from '../harness'

test.describe('inventory scenarios', () => {
  for (const scenario of INVENTORY_SCENARIOS) {
    test(scenario.id, async ({ page }, testInfo) => {
      const pageErrors: Array<string> = []
      const consoleErrors: Array<string> = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text())
        }
      })

      await openHarness(page, { screen: 'inventory', scenario: scenario.id, layout: 'single' })

      const inventory = page.locator('[data-harness-host] [data-mx-ui="inventory"]')
      await expect(inventory).toBeVisible()
      await expect(inventory.locator('[data-mx-ui="region"]')).toHaveCount(5)
      await expect(inventory.locator('[data-mx-ui="region"] [data-mx-ui="slot"]')).not.toHaveCount(0)

      if (scenario.id === 'regions-known') {
        const regionIds = await inventory.locator('[data-mx-ui="region"]').evaluateAll((regions) =>
          regions.map((region) => region.getAttribute('data-region')),
        )
        expect(regionIds).toStrictEqual(['hotbar', 'main', 'armour', 'offhand', 'crafting-grid'])
      } else if (scenario.id === 'crafting-match') {
        await expect(inventory.locator('[data-mx-ui="crafting-outcome"]')).toHaveAttribute(
          'data-crafting-state',
          'match',
        )
        await expect(inventory.locator('[data-mx-ui="crafting-output"]')).toBeVisible()
        await expect(inventory.locator('[data-mx-ui="crafting-output"] [data-mx-ui="slot-item"]')).toHaveText(
          'stone',
        )
      } else if (scenario.id === 'crafting-no-match') {
        await expect(inventory.locator('[data-mx-ui="crafting-outcome"]')).toHaveAttribute(
          'data-crafting-state',
          'no-match',
        )
      } else if (scenario.id === 'crafting-unknown') {
        await expect(inventory.locator('[data-mx-ui="crafting-outcome"]')).toHaveAttribute(
          'data-crafting-state',
          'unknown',
        )
        await expect(inventory.getByRole('note')).toContainText('Crafting result: unknown')
        await expect(inventory.locator('[data-mx-ui="crafting-output"]')).toBeHidden()
      } else if (scenario.id === 'unknown-region') {
        const armour = inventory.locator('[data-region="armour"]')
        await expect(armour).toHaveAttribute('data-region-state', 'unknown')
        await expect(armour.locator('[data-mx-ui="region-note"]')).toContainText('armour rack')
      } else if (scenario.id === 'cursor-stack') {
        await expect(inventory.getByRole('status', { name: 'Carried item, stone, 64' })).toBeVisible()
      } else if (scenario.id === 'stack-zero-empty') {
        const slot = inventory.locator('[data-region="hotbar"] [data-mx-ui="slot"]').first()
        await expect(slot.locator('[data-mx-ui="slot-item"]')).toHaveText('')
        await expect(inventory.getByRole('note')).toContainText('Count 0 represents an empty slot')
      } else if (scenario.id === 'stack-one') {
        const slot = inventory.locator('[data-region="hotbar"] [data-mx-ui="slot"]').first()
        await expect(slot.locator('[data-mx-ui="slot-item"]')).toHaveText('stone')
        await expect(slot.locator('[data-mx-ui="slot-count"]')).toHaveText('')
      } else if (scenario.id === 'stack-64') {
        const slot = inventory.locator('[data-region="hotbar"] [data-mx-ui="slot"]').first()
        await expect(slot.locator('[data-mx-ui="slot-count"]')).toHaveText('64')
      } else if (scenario.id === 'stack-99') {
        const slot = inventory.locator('[data-region="hotbar"] [data-mx-ui="slot"]').first()
        await expect(slot.locator('[data-mx-ui="slot-item"]')).toHaveText('')
        await expect(inventory.getByRole('note')).toContainText('StackCount accepts 99')
      } else if (scenario.id === 'stack-100-rejected') {
        await expect(inventory.getByRole('note')).toContainText('Count 100 is rejected')
      } else if (scenario.id === 'accessibility-name-role-state') {
        const slot = inventory.getByRole('button', { name: 'Hotbar slot 1, stone, 64' })
        await expect(slot).toHaveAttribute('aria-disabled', 'false')
        await expect(slot).toHaveAttribute('tabindex', '0')
        const output = inventory.getByRole('button', { name: 'Crafting output, no matching recipe' })
        await expect(output).toHaveAttribute('aria-disabled', 'true')
        await expect(inventory.getByRole('status', { name: 'Carried item, stone, 12' })).toBeVisible()
      }

      await page.screenshot({ path: testInfo.outputPath(`${scenario.id}.png`), fullPage: true })
      expect(pageErrors).toStrictEqual([])
      expect(consoleErrors).toStrictEqual([])
    })
  }
})
