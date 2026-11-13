import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { openHarness } from './harness'

const furnaceViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/furnace-view.ts', import.meta.url),
)}`
const furnaceViewModelModule = `/@fs${fileURLToPath(
  new URL('../src/domain/furnace-view-model.ts', import.meta.url),
)}`
test('furnace controls preserve their host boundary in a real document', async ({ page }) => {
  await openHarness(page, { screen: 'crosshair' })

  await page.evaluate(
    async ({ viewPath, modelPath }) => {
      const { createFurnaceView } = await import(viewPath) as typeof import('../src/application/furnace-view')
      const { furnaceViewModel } = await import(modelPath) as typeof import('../src/domain/furnace-view-model')
      const { Result } = await import('effect')
      const furnaceModel = furnaceViewModel({
        input: { itemId: 'minecraft:raw_iron', count: 4 },
        fuel: { itemId: 'minecraft:coal', count: 2 },
        output: undefined,
        cookProgress: 0.6,
        burnProgress: 0.35,
      }, {
        language: 'en',
        resolver: (itemType) => Result.succeed(itemType.replaceAll('_', ' ')),
      })
      const host = document.createElement('main')
      host.setAttribute('data-furnace-browser-host', '')
      document.body.appendChild(host)

      const view = createFurnaceView(document, host)
      view.render(furnaceModel, { focusedSlot: 'fuel', status: 'Furnace fuel selected' })
    },
    { modelPath: furnaceViewModelModule, viewPath: furnaceViewModule },
  )

  const furnace = page.locator('[data-furnace-browser-host] [data-mx-ui="furnace"]')
  const slots = furnace.locator('[data-interaction-target="furnace-slot"]')
  await expect(slots).toHaveCount(3)
  const slotAttributes = await slots.evaluateAll((elements) =>
    elements.map((element) => ({
      role: element.getAttribute('role'),
      slot: element.getAttribute('data-interaction-slot'),
      tabIndex: element.getAttribute('tabindex'),
    })),
  )
  expect(slotAttributes).toStrictEqual([
    { role: 'button', slot: 'input', tabIndex: '-1' },
    { role: 'button', slot: 'fuel', tabIndex: '0' },
    { role: 'button', slot: 'output', tabIndex: '-1' },
  ])
  await expect(slots.nth(0)).toHaveAttribute('aria-label', 'Furnace input, raw iron, 4')
  await expect(slots.nth(0).locator('[data-mx-ui="slot-item"]')).toHaveText('raw iron')

  await page.keyboard.press('Tab')
  await expect(slots.nth(1)).toBeFocused()

  const cook = furnace.getByRole('progressbar', { name: 'Cooking progress' })
  const burn = furnace.getByRole('progressbar', { name: 'Fuel remaining' })
  await expect(cook).toHaveAttribute('aria-valuenow', '60')
  await expect(cook).toHaveAttribute('aria-valuetext', '60%')
  await expect(burn).toHaveAttribute('aria-valuenow', '35')
  await expect(burn).toHaveAttribute('aria-valuetext', '35%')
  await expect(furnace.getByRole('status')).toHaveText('Furnace fuel selected')
})
