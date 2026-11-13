import { describe, expect, it } from 'vitest'
import { Result } from 'effect'
import * as fc from 'fast-check'
import {
  ENCHANTING_OFFER_IDS,
  ENCHANTING_OPERATION_TARGETS,
  type EnchantingTableSnapshot,
  enchantingTableViewModel,
} from '../src/domain/enchanting-table-view-model'

const SNAPSHOT: EnchantingTableSnapshot = {
  item: { count: 1, durability: 0.75, itemId: 'minecraft:diamond_sword' },
  lapis: { count: 12, itemId: 'minecraft:lapis_lazuli' },
  offers: [
    {
      enchantmentId: 'minecraft:sharpness',
      enchantmentLevel: 3,
      lapisCost: 1,
      levelCost: 12,
      rejectionReason: undefined,
    },
    {
      enchantmentId: 'minecraft:unbreaking',
      enchantmentLevel: 2,
      lapisCost: 2,
      levelCost: 18,
      rejectionReason: 'Requires 18 levels',
    },
    undefined,
  ],
}

describe('enchantingTableViewModel', () => {
  it('projects item, lapis, three offers, costs, rejection, and operation targets', () => {
    const model = enchantingTableViewModel(SNAPSHOT)

    expect(
      model.slots.map(({ id, itemId, countLabel, durabilityPercent }) => ({
        countLabel,
        durabilityPercent,
        id,
        itemId,
      })),
    ).toStrictEqual([
      {
        countLabel: undefined,
        durabilityPercent: 75,
        id: 'item',
        itemId: 'minecraft:diamond_sword',
      },
      {
        countLabel: '12',
        durabilityPercent: undefined,
        id: 'lapis',
        itemId: 'minecraft:lapis_lazuli',
      },
    ])
    expect(model.offers).toStrictEqual([
      {
        enchantmentId: 'minecraft:sharpness',
        enchantmentLevel: 3,
        id: 'offer-1',
        lapisCost: 1,
        levelCost: 12,
        rejectionReason: undefined,
      },
      {
        enchantmentId: 'minecraft:unbreaking',
        enchantmentLevel: 2,
        id: 'offer-2',
        lapisCost: 2,
        levelCost: 18,
        rejectionReason: 'Requires 18 levels',
      },
      {
        enchantmentId: undefined,
        enchantmentLevel: 0,
        id: 'offer-3',
        lapisCost: 0,
        levelCost: 0,
        rejectionReason: undefined,
      },
    ])
    expect(ENCHANTING_OPERATION_TARGETS).toStrictEqual([
      'item',
      'lapis',
      'offer-1',
      'offer-2',
      'offer-3',
    ])
  })

  it('normalizes invalid costs and returns deeply frozen presentation state', () => {
    const snapshot: EnchantingTableSnapshot = {
      ...SNAPSHOT,
      offers: [
        {
          enchantmentId: 'minecraft:sharpness',
          enchantmentLevel: Number.NaN,
          lapisCost: -2.7,
          levelCost: Number.POSITIVE_INFINITY,
          rejectionReason: undefined,
        },
        undefined,
        undefined,
      ],
    }
    const model = enchantingTableViewModel(snapshot)

    expect(model.offers[0]?.enchantmentLevel).toBe(0)
    expect(model.offers[0]?.lapisCost).toBe(0)
    expect(model.offers[0]?.levelCost).toBe(0)
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.slots)).toBe(true)
    expect(Object.isFrozen(model.offers)).toBe(true)
    expect(model.slots.every(Object.isFrozen)).toBe(true)
    expect(model.offers.every(Object.isFrozen)).toBe(true)
    expect(snapshot.offers[0]?.lapisCost).toBe(-2.7)
  })

  it('returns a typed failure for a null offer', () => {
    const snapshot = {
      ...SNAPSHOT,
      offers: [SNAPSHOT.offers[0], null, SNAPSHOT.offers[2]] as const,
    }

    expect(enchantingTableViewModel(snapshot)).toEqual(
      Result.fail({ _tag: 'NullEnchantingOffer', offerId: 'offer-2' }),
    )
  })

  it.each(['enchantmentLevel', 'lapisCost', 'levelCost'] as const)(
    'returns a typed failure for a null %s',
    (field) => {
      const snapshot = {
        ...SNAPSHOT,
        offers: [
          {
            ...SNAPSHOT.offers[0],
            [field]: null,
          },
          SNAPSHOT.offers[1],
          SNAPSHOT.offers[2],
        ] as const,
      }

      expect(enchantingTableViewModel(snapshot)).toEqual(
        Result.fail({ _tag: 'NullEnchantingOfferValue', field, offerId: 'offer-1' }),
      )
    },
  )

  it('property: arbitrary snapshots return a typed failure or a valid immutable view without throwing', () => {
    const failureTags = new Set([
      'InvalidEnchantingTableSnapshot',
      'NullEnchantingOffer',
      'NullEnchantingOfferValue',
    ])
    fc.assert(
      fc.property(fc.anything(), (snapshot) => {
        const result = enchantingTableViewModel(snapshot)
        if (Result.isFailure(result)) {
          expect(failureTags.has(result.failure._tag)).toBe(true)
          return
        }

        expect(Object.isFrozen(result.success)).toBe(true)
        expect(result.success.slots).toHaveLength(2)
        expect(result.success.offers.map(({ id }) => id)).toEqual(ENCHANTING_OFFER_IDS)
        expect(result.success.offers.every(({ enchantmentLevel, lapisCost, levelCost }) =>
          [enchantmentLevel, lapisCost, levelCost].every((cost) =>
            Number.isFinite(cost) && Number.isInteger(cost) && cost >= 0,
          ),
        )).toBe(true)
      }),
    )
  })
})
