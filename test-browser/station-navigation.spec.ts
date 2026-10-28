import { expect, test } from '@playwright/test'
import { Schema } from 'effect'
import { fileURLToPath } from 'node:url'
import { BrewingStateSchema, IntentPayloadSchema } from '@nerima-games/mc-sim'
import { decodeTradeSnapshot, type TradeSnapshot } from '../src/domain/trade-snapshot'
import { openHarness } from './harness'

const brewingViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/brewing-view.ts', import.meta.url),
)}`
const brewingViewModelModule = `/@fs${fileURLToPath(
  new URL('../src/domain/brewing-view-model.ts', import.meta.url),
)}`

const tradeViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/trade-view.ts', import.meta.url),
)}`

const BREWING_SNAPSHOT = Schema.decodeUnknownSync(BrewingStateSchema)({
  bottles: [undefined, undefined, undefined],
  ingredient: undefined,
  fuel: undefined,
  fuelCharges: 0,
  brewProgressSecs: 0,
})

const tradeIntent = (offerId: string) => {
  const intent = Schema.decodeUnknownSync(IntentPayloadSchema)({
    _tag: 'TradeVillager',
    actor: 'player-1',
    villager: 'farmer-1',
    offerId,
  })
  if (intent['_tag'] !== 'TradeVillager') {
    throw new Error('The owner schema decoded a different intent tag')
  }
  return intent
}

const availableTrade = tradeIntent('farmer-offer-1')
const unavailableTrade = tradeIntent('farmer-offer-2')

const SNAPSHOT = {
  actor: availableTrade.actor,
  villager: availableTrade.villager,
  profession: 'farmer',
  offers: [
    {
      available: true,
      id: availableTrade.offerId,
      input: { count: 4, item: 'minecraft:wheat' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 2,
      maxUses: 7,
    },
    {
      available: false,
      id: unavailableTrade.offerId,
      input: { count: 3, item: 'minecraft:potato' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 6,
      maxUses: 7,
    },
  ],
  status: 'Choose a trade',
}

test('trade offers follow native tab order and expose polite status in a real document', async ({ page }) => {
  const decoded = decodeTradeSnapshot(SNAPSHOT)
  if (decoded['_tag'] === 'Failure') {
    throw decoded.failure
  }

  await openHarness(page, { screen: 'crosshair' })

  await page.evaluate(
    async ({ viewPath, snapshot }: {
      readonly viewPath: string
      readonly snapshot: TradeSnapshot
    }) => {
      const { createTradeView } = await import(viewPath) as typeof import('../src/application/trade-view')
      const host = document.createElement('main')
      host.setAttribute('data-trade-browser-host', '')
      document.body.appendChild(host)

      const view = createTradeView(document, host, {
        onIntent: (intent) => {
          throw new Error(`Unexpected trade intent during navigation test: ${intent['_tag']}`)
        },
      })
      view.render(snapshot)
    },
    { viewPath: tradeViewModule, snapshot: decoded.success },
  )

  const trade = page.locator('[data-trade-browser-host] [data-mx-ui="trade"]')
  const availableOffer = trade.getByRole('button', {
    name: '4 minecraft:wheat -> 1 minecraft:emerald (2/7)',
  })
  const unavailableOffer = trade.getByRole('button', {
    name: '3 minecraft:potato -> 1 minecraft:emerald (6/7)',
  })
  const close = trade.getByRole('button', { name: 'Close' })
  const status = trade.getByRole('status')

  await expect(availableOffer).toBeEnabled()
  await expect(unavailableOffer).toBeDisabled()
  await expect(status).toHaveCount(1)
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toHaveText('Choose a trade')

  await page.keyboard.press('Tab')
  await expect(availableOffer).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
})

test('brewing unsupported actions show reasons and only Close receives tab focus', async ({ page }) => {
  await openHarness(page, { screen: 'crosshair' })

  await page.evaluate(
    async ({ viewPath, modelPath, snapshotJson }: {
      readonly viewPath: string
      readonly modelPath: string
      readonly snapshotJson: string
    }) => {
      const [{ createBrewingView }, { brewingViewModel }] = await Promise.all([
        import(viewPath) as Promise<typeof import('../src/application/brewing-view')>,
        import(modelPath) as Promise<typeof import('../src/domain/brewing-view-model')>,
      ])
      const host = document.createElement('main')
      host.setAttribute('data-brewing-browser-host', '')
      document.body.appendChild(host)

      const view = createBrewingView(document, host, {
        onIntent: () => {
          throw new Error('Unexpected brewing intent during navigation test')
        },
      })
      const snapshot = JSON.parse(snapshotJson, (_key, value) => (value === null ? undefined : value))
      view.render(brewingViewModel(snapshot))
    },
    {
      viewPath: brewingViewModule,
      modelPath: brewingViewModelModule,
      snapshotJson: JSON.stringify(BREWING_SNAPSHOT),
    },
  )

  const brewing = page.locator('[data-brewing-browser-host] [data-mx-ui="brewing"]')
  const controls = brewing.locator('[data-mx-ui="brewing-control"]')
  const insert = brewing.locator('[data-brewing-operation="insert-selected-item"]')
  const collect = brewing.locator('[data-brewing-operation="collect-bottle"]')
  const drink = brewing.locator('[data-brewing-operation="drink-potion"]')
  const close = brewing.getByRole('button', { name: 'Close' })

  await expect(controls).toHaveCount(4)
  await expect(insert).toBeDisabled()
  await expect(collect).toBeDisabled()
  await expect(drink).toBeDisabled()
  await expect(brewing.locator('[data-brewing-reason="insert-selected-item"]')).toHaveText(
    /Inserting a selected item changes player inventory and the brewing stand together\./,
  )
  await expect(brewing.locator('[data-brewing-reason="collect-bottle"]')).toHaveText(
    /Collecting a bottle changes the brewing stand and player inventory together\./,
  )
  await expect(brewing.locator('[data-brewing-reason="drink-potion"]')).toHaveText(
    /Drinking a potion changes player inventory and player effects together\./,
  )
  await expect(insert).toHaveAttribute('aria-label', /Unavailable\. Inserting a selected item/)
  await expect(collect).toHaveAttribute('aria-label', /Unavailable\. Collecting a bottle/)
  await expect(drink).toHaveAttribute('aria-label', /Unavailable\. Drinking a potion/)
  await expect(close).toBeEnabled()

  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
})
