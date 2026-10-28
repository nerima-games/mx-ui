import { Result, Schema } from 'effect'
import { IntentPayloadSchema } from '@nerima-games/mc-sim'
import { describe, expect, it } from 'vitest'
import { decodeTradeSnapshot, type TradeSnapshot } from '../src/domain/trade-snapshot'
import { tradeViewModel } from '../src/domain/trade-view-model'

const tradeIntent = (offerId: string) => {
  const intent = Schema.decodeUnknownSync(IntentPayloadSchema)({
    _tag: 'TradeVillager',
    actor: 'player-1',
    villager: 'villager-1',
    offerId,
  })
  if (intent['_tag'] !== 'TradeVillager') {
    throw new Error('The owner schema decoded a different intent tag')
  }
  return intent
}

const decodeSnapshot = (input: unknown): TradeSnapshot => {
  const result = decodeTradeSnapshot(input)
  if (Result.isFailure(result)) {
    throw result.failure
  }
  return result.success
}

const FIRST_INTENT = tradeIntent('farmer-offer-1')
const SECOND_INTENT = tradeIntent('farmer-offer-2')

const SNAPSHOT = decodeSnapshot({
  actor: FIRST_INTENT.actor,
  villager: FIRST_INTENT.villager,
  profession: 'farmer',
  offers: [
    {
      available: true,
      id: FIRST_INTENT.offerId,
      input: { count: 4, item: 'minecraft:wheat' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 2,
      maxUses: 7,
    },
    {
      available: false,
      id: SECOND_INTENT.offerId,
      input: { count: 3, item: 'minecraft:potato' },
      output: { count: 1, item: 'minecraft:emerald' },
      uses: 6,
      maxUses: 7,
    },
  ],
  status: 'Choose a trade',
})

describe('tradeViewModel', () => {
  it('projects profession, ordered offers, item counts, use counts, and owner availability', () => {
    const model = tradeViewModel(SNAPSHOT)

    expect(model).toStrictEqual({
      actor: FIRST_INTENT.actor,
      villager: FIRST_INTENT.villager,
      professionLabel: 'Farmer',
      offers: [
        {
          id: FIRST_INTENT.offerId,
          label: '4 minecraft:wheat -> 1 minecraft:emerald (2/7)',
          disabled: false,
        },
        {
          id: SECOND_INTENT.offerId,
          label: '3 minecraft:potato -> 1 minecraft:emerald (6/7)',
          disabled: true,
        },
      ],
      status: 'Choose a trade',
    })
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.offers)).toBe(true)
    expect(model.offers.every(Object.isFrozen)).toBe(true)
    expect(SNAPSHOT.offers[0]?.uses).toBe(2)
  })

  it('projects toolsmith and an empty offer list', () => {
    const model = tradeViewModel(decodeSnapshot({ ...SNAPSHOT, profession: 'toolsmith', offers: [] }))

    expect(model.professionLabel).toBe('Toolsmith')
    expect(model.offers).toStrictEqual([])
  })
})
