import { Schema } from 'effect'
import { IntentPayloadSchema } from '@nerima-games/mc-sim'
import { describe, expect, it } from 'vitest'
import { createTradeView } from '../src/application/trade-view'
import { tradeViewModel, type TradeViewIntent } from '../src/domain/trade-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

type TradeSnapshot = Parameters<typeof tradeViewModel>[0]

const tradeIntent = (actor: string, villager: string, offerId: string) => {
  const intent = Schema.decodeUnknownSync(IntentPayloadSchema)({
    _tag: 'TradeVillager',
    actor,
    villager,
    offerId,
  })
  if (intent['_tag'] !== 'TradeVillager') {
    throw new Error('The owner schema decoded a different intent tag')
  }
  return intent
}

const FARMER_TRADE = tradeIntent('player-1', 'farmer-1', 'farmer-offer-1')
const UNAVAILABLE_TRADE = tradeIntent('player-1', 'farmer-1', 'farmer-offer-2')
const TOOLSMITH_TRADE = tradeIntent('player-2', 'toolsmith-1', 'toolsmith-offer-1')

const FARMER_SNAPSHOT: TradeSnapshot = {
  actor: FARMER_TRADE.actor,
  villager: FARMER_TRADE.villager,
  profession: 'farmer',
  offers: [
    {
      available: true,
      id: FARMER_TRADE.offerId,
      input: { count: 4, item: 'minecraft:wheat' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 2,
      maxUses: 7,
    },
    {
      available: false,
      id: UNAVAILABLE_TRADE.offerId,
      input: { count: 3, item: 'minecraft:potato' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 6,
      maxUses: 7,
    },
  ],
  status: 'Choose a trade',
}

const TOOLSMITH_SNAPSHOT: TradeSnapshot = {
  actor: TOOLSMITH_TRADE.actor,
  villager: TOOLSMITH_TRADE.villager,
  profession: 'toolsmith',
  offers: [
    {
      available: true,
      id: TOOLSMITH_TRADE.offerId,
      input: { count: 1, item: 'minecraft:iron_ingot' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 0,
      maxUses: 8,
    },
  ],
  status: 'Trade ready',
}

describe('createTradeView', () => {
  it('renders native offer and close buttons in DOM order and emits typed intents', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const intents: Array<TradeViewIntent> = []
    const view = createTradeView(factory, host, {
      onIntent: (intent) => {
        intents.push(intent)
      },
    })
    const root = fakeElement(view.root)

    view.render(tradeViewModel(FARMER_SNAPSHOT))

    const offers = root.findAll('data-mx-ui', 'trade-offer')
    const status = root.find('data-mx-ui', 'trade-status')
    const close = root.find('data-mx-ui', 'trade-close')
    expect(root.children.map(({ tagName }) => tagName)).toStrictEqual(['h2', 'div', 'p', 'button'])
    expect(root.find('data-mx-ui', 'trade-profession')?.textContent).toBe('Farmer')
    expect(offers.map(({ textContent }) => textContent)).toStrictEqual([
      '4 minecraft:wheat -> 1 minecraft:emerald (2/7)',
      '3 minecraft:potato -> 1 minecraft:emerald (6/7)',
    ])
    expect(offers.map(({ attributes }) => attributes.get('type'))).toStrictEqual(['button', 'button'])
    expect(offers.map(({ attributes }) => attributes.has('tabindex'))).toStrictEqual([false, false])
    expect(offers.map(({ attributes }) => attributes.has('disabled'))).toStrictEqual([false, true])
    expect(status?.attributes.get('role')).toBe('status')
    expect(status?.attributes.get('aria-live')).toBe('polite')
    expect(status?.textContent).toBe('Choose a trade')
    expect(close?.tagName).toBe('button')
    expect(close?.attributes.get('type')).toBe('button')
    expect(close?.textContent).toBe('Close')

    offers[0]?.dispatch('click')
    offers[1]?.dispatch('click')
    close?.dispatch('click')

    expect(intents).toStrictEqual([
      {
        _tag: 'TradeVillager',
        actor: FARMER_TRADE.actor,
        villager: FARMER_TRADE.villager,
        offerId: FARMER_TRADE.offerId,
      },
      { _tag: 'CloseTradeUi' },
    ])
  })

  it('keeps offer buttons stable while updating intents and hiding surplus offers', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const intents: Array<TradeViewIntent> = []
    const view = createTradeView(factory, host, {
      onIntent: (intent) => {
        intents.push(intent)
      },
    })
    const root = fakeElement(view.root)

    view.render(tradeViewModel(FARMER_SNAPSHOT))
    const list = root.find('data-mx-ui', 'trade-offers')
    const firstOffer = list?.children[0]
    const surplusOffer = list?.children[1]
    view.render(tradeViewModel(TOOLSMITH_SNAPSHOT))

    expect(list?.children[0]).toBe(firstOffer)
    expect(list?.children[1]).toBe(surplusOffer)
    expect(list?.children[1]?.attributes.has('hidden')).toBe(true)
    expect(list?.children[1]?.attributes.has('disabled')).toBe(false)
    expect(root.find('data-mx-ui', 'trade-profession')?.textContent).toBe('Toolsmith')
    expect(root.find('data-mx-ui', 'trade-status')?.textContent).toBe('Trade ready')

    firstOffer?.dispatch('click')

    expect(intents).toStrictEqual([
      {
        _tag: 'TradeVillager',
        actor: TOOLSMITH_TRADE.actor,
        villager: TOOLSMITH_TRADE.villager,
        offerId: TOOLSMITH_TRADE.offerId,
      },
    ])
  })
})
