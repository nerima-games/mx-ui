import { Result, Schema } from 'effect'
import * as fc from 'fast-check'
import {
  ItemStackFailureSchema,
  ItemStackSchema,
  itemStack,
  maxStackCountForItem,
} from '@nerima-games/mc-sim'
import { describe, expect, it } from 'vitest'
import { createEnchantingTableView } from '../src/application/enchanting-table-view'
import {
  enchantingOffers,
  enchantingTableSnapshotOf,
  type EnchantingTableState,
} from '../src/domain/enchanting-table-controller'
import { enchantingTableViewModel } from '../src/domain/enchanting-table-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

const readyState = (
  overrides: Partial<EnchantingTableState> = {},
): EnchantingTableState => ({
  bookshelfCount: 15,
  experienceLevel: 30,
  item: { count: 1, itemId: 'diamond_sword' },
  lapisCount: 3,
  seed: 11,
  ...overrides,
})

describe('enchanting table controller', () => {
  it('returns offers from the sim API as a typed Result and projects its costs', () => {
    const result = enchantingOffers(readyState())
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) {
      throw new Error('valid enchanting input must produce offers')
    }
    expect(result.success).toHaveLength(3)
    expect(result.success.map((offer) => offer?.lapisCost)).toStrictEqual([1, 2, 3])
    expect(result.success.every((offer) => offer !== undefined)).toBe(true)
    expect(
      result.success.every((offer) => offer === undefined || offer.rejectionReason === undefined),
    ).toBe(true)
  })

  it('returns itemStack failures instead of defaulting invalid item counts', () => {
    const result = enchantingOffers(readyState({ item: { itemId: 'diamond_sword', count: 0 } }))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) {
      throw new Error('invalid item count must fail stack construction')
    }
    expect(result.failure['_tag']).toBe('BrandError')
  })

  it('returns invalid seed failures without normalizing them', () => {
    for (const seed of [1.5, -1, 2 ** 32]) {
      const result = enchantingOffers(readyState({ seed }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isSuccess(result)) {
        throw new Error('invalid seed must fail')
      }
      expect(result.failure).toStrictEqual({
        _tag: 'EnchantingSeedFailure',
        reason: 'expected-unsigned-32-bit-integer',
        seed,
      })
    }
  })

  it('propagates the sim API failure for invalid bookshelf counts', () => {
    const result = enchantingOffers(readyState({ bookshelfCount: 1.5 }))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) {
      throw new Error('invalid bookshelf count must fail offer generation')
    }
    expect(result.failure).toMatchObject({
      _tag: 'EnchantmentTableFailure',
      reason: 'invalid-bookshelf-count',
    })
  })

  it('returns a typed projection failure when a sim offer contains multiple enchantments', () => {
    const cases = [
      { offerId: 'offer-1', seed: 0 },
      { offerId: 'offer-2', seed: 7 },
      { offerId: 'offer-3', seed: 1 },
    ] as const
    for (const { offerId, seed } of cases) {
      const result = enchantingOffers(readyState({ seed }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isSuccess(result)) {
        throw new Error('multiple enchantments cannot be represented by the current snapshot')
      }
      expect(result.failure).toMatchObject({
        _tag: 'EnchantingOfferProjectionFailure',
        offerId,
      })
    }
  })

  it('projects empty sim candidates as empty slots and preserves snapshot data', () => {
    const state = readyState({
      bookshelfCount: 0,
      item: { itemId: 'fishing_rod', count: 1 },
      seed: 0,
    })
    const offers = enchantingOffers(state)
    expect(Result.isSuccess(offers)).toBe(true)
    if (Result.isFailure(offers)) {
      throw new Error('valid fishing rod input must produce an offer result')
    }
    expect(offers.success[0]).toBeUndefined()
    expect(offers.success[1]?.enchantmentId).toBe('unbreaking')

    const snapshot = enchantingTableSnapshotOf(state)
    expect(Result.isSuccess(snapshot)).toBe(true)
    if (Result.isFailure(snapshot)) {
      throw new Error('valid table state must produce a snapshot')
    }
    expect(snapshot.success.item).toBe(state.item)
    expect(snapshot.success.lapis).toStrictEqual({
      count: 3,
      itemId: 'minecraft:lapis_lazuli',
    })
    expect(snapshot.success.offers).toStrictEqual(offers.success)
  })

  it('preserves snapshot failure and hides the lapis slot when none is loaded', () => {
    const invalid = enchantingTableSnapshotOf(
      readyState({ item: { itemId: 'diamond_sword', count: 0 } }),
    )
    expect(Result.isFailure(invalid)).toBe(true)
    if (Result.isSuccess(invalid)) {
      throw new Error('invalid stack must fail snapshot projection')
    }
    expect(invalid.failure['_tag']).toBe('BrandError')

    const noLapis = enchantingTableSnapshotOf(readyState({ lapisCount: 0 }))
    expect(Result.isSuccess(noLapis)).toBe(true)
    if (Result.isFailure(noLapis)) {
      throw new Error('valid table state must produce a snapshot')
    }
    expect(noLapis.success.lapis).toBeUndefined()
  })

  it('returns the selected offer to the host for plan-based application', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const state = readyState()
    let intent: string | null = null
    const view = createEnchantingTableView(factory, host, {
      onActivate: (target) => {
        if (target === 'offer-1' || target === 'offer-2' || target === 'offer-3') {
          intent = target
        }
      },
    })
    const snapshot = enchantingTableSnapshotOf(state)
    expect(Result.isSuccess(snapshot)).toBe(true)
    if (Result.isFailure(snapshot)) {
      throw new Error('valid table state must produce a snapshot')
    }
    view.render(enchantingTableViewModel(snapshot.success))
    const button = fakeElement(view.root).find('data-operation-target', 'offer-1')
    expect(button).toBeDefined()
    expect(button?.attributes.has('disabled')).toBe(false)
    button?.dispatch('click')

    expect(intent).toBe('offer-1')
    expect(state).toStrictEqual(readyState())
    expect(button?.listeners).toStrictEqual(['click'])
  })

  it('projects undefined sim offers as empty slots', () => {
    const result = enchantingOffers(
      readyState({ item: { itemId: 'stone', count: 1 } }),
    )
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) {
      throw new Error('valid non-enchantable item must produce an offer result')
    }
    expect(result.success).toStrictEqual([undefined, undefined, undefined])
  })

  it('returns no offers when the table has no item', () => {
    const result = enchantingOffers(readyState({ item: undefined }))
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) {
      throw new Error('an empty table has no offer generation failure')
    }
    expect(result.success).toStrictEqual([undefined, undefined, undefined])
  })


  it('accepts fixed itemStack boundaries and decodes typed failures with owner schemas', () => {
    const maximum = Number(maxStackCountForItem('stone'))
    expect(maximum).toBe(64)
    const decodeStack = Schema.decodeUnknownResult(ItemStackSchema, {
      onExcessProperty: 'error',
    })
    const decodeFailure = Schema.decodeUnknownResult(ItemStackFailureSchema, {
      onExcessProperty: 'error',
    })
    const cases = [
      { count: 1, succeeds: true },
      { count: maximum, succeeds: true },
      { count: 0, succeeds: false },
      { count: maximum + 1, succeeds: false },
    ] as const

    for (const { count, succeeds } of cases) {
      const result = itemStack('stone', count)
      expect(Result.isSuccess(result)).toBe(succeeds)
      if (Result.isSuccess(result)) {
        expect(result.success.count).toBe(count)
        expect(Result.isSuccess(decodeStack(result.success))).toBe(true)
      } else {
        expect(Result.isSuccess(decodeFailure(result.failure))).toBe(true)
      }
    }
  })

  it('property: validates itemStack edges and generated interior counts', () => {
    const maximum = Number(maxStackCountForItem('stone'))
    const decodeStack = Schema.decodeUnknownResult(ItemStackSchema, {
      onExcessProperty: 'error',
    })
    const decodeFailure = Schema.decodeUnknownResult(ItemStackFailureSchema, {
      onExcessProperty: 'error',
    })
    const assertCount = (count: number) => {
      const result = itemStack('stone', count)
      const succeeds = count >= 1 && count <= maximum
      expect(Result.isSuccess(result)).toBe(succeeds)
      if (Result.isSuccess(result)) {
        expect(result.success.count).toBe(count)
        expect(Result.isSuccess(decodeStack(result.success))).toBe(true)
      } else {
        expect(Result.isSuccess(decodeFailure(result.failure))).toBe(true)
      }
    }

    fc.assert(
      fc.property(fc.constantFrom(0, 1, maximum, maximum + 1), assertCount),
    )
    fc.assert(
      fc.property(fc.integer({ min: 2, max: maximum - 1 }), assertCount),
    )
  })

  it('strictly decodes ItemStackFailure and rejects malformed tagged payloads', () => {
    const maximum = Number(maxStackCountForItem('stone'))
    const outOfRange = itemStack('stone', maximum + 1)
    if (Result.isSuccess(outOfRange)) {
      throw new Error('count above the item stack limit must fail')
    }
    const failure = { ...outOfRange.failure }
    expect(failure['_tag']).toBe('ItemValidationFailure')

    const decodeFailure = Schema.decodeUnknownResult(ItemStackFailureSchema, {
      onExcessProperty: 'error',
    })
    expect(Result.isSuccess(decodeFailure(failure))).toBe(true)

    const without = (field: string) =>
      Object.fromEntries(Object.entries(failure).filter(([key]) => key !== field))
    const malformed: ReadonlyArray<unknown> = [
      without('_tag'),
      without('field'),
      null,
      { ...failure, message: null },
      { ...failure, unexpected: true },
      { ...failure, _tag: 'UnknownItemStackFailure' },
    ]
    for (const input of malformed) {
      expect(Result.isFailure(decodeFailure(input))).toBe(true)
    }
    fc.assert(
      fc.property(fc.constant(malformed), (inputs) => {
        for (const input of inputs) {
          expect(Result.isFailure(decodeFailure(input))).toBe(true)
        }
      }),
    )
  })

  it('accepts uint32 seed boundaries and rejects values just outside them', () => {
    const nonEnchantable = { itemId: 'stone', count: 1 } as const
    for (const seed of [0, 0xffff_ffff]) {
      const result = enchantingOffers(readyState({ item: nonEnchantable, seed }))
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isFailure(result)) {
        throw new Error('uint32 boundary seed must be accepted')
      }
      expect(result.success).toStrictEqual([undefined, undefined, undefined])
    }
    for (const seed of [-1, 0x1_0000_0000]) {
      const result = enchantingOffers(readyState({ item: nonEnchantable, seed }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isSuccess(result)) {
        throw new Error('seed outside uint32 must fail')
      }
      expect(result.failure).toStrictEqual({
        _tag: 'EnchantingSeedFailure',
        reason: 'expected-unsigned-32-bit-integer',
        seed,
      })
    }
  })

  it('property: accepts uint32 edges and generated interior seeds', () => {
    const item = { itemId: 'stone', count: 1 } as const
    const assertSeed = (seed: number) => {
      const result = enchantingOffers(readyState({ item, seed }))
      const valid = Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff
      expect(Result.isSuccess(result)).toBe(valid)
      if (Result.isSuccess(result)) {
        expect(result.success).toStrictEqual([undefined, undefined, undefined])
      } else {
        expect(result.failure).toStrictEqual({
          _tag: 'EnchantingSeedFailure',
          reason: 'expected-unsigned-32-bit-integer',
          seed,
        })
      }
    }

    fc.assert(
      fc.property(
        fc.constantFrom(-1, 0, 0xffff_ffff, 0x1_0000_0000),
        assertSeed,
      ),
    )
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0xffff_fffe }), assertSeed),
    )
  })

  it('property: projects generated valid offers or reports a typed projection failure', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff_ffff }), (seed) => {
        const result = enchantingOffers(readyState({ seed }))
        if (Result.isSuccess(result)) {
          expect(result.success).toHaveLength(3)
          for (const offer of result.success) {
            if (offer !== undefined) {
              expect(offer.enchantmentId.length).toBeGreaterThan(0)
              expect([1, 2, 3]).toContain(offer.lapisCost)
              expect(Number.isInteger(offer.levelCost)).toBe(true)
            }
          }
          return
        }

        expect(result.failure['_tag']).toBe('EnchantingOfferProjectionFailure')
        if (result.failure['_tag'] !== 'EnchantingOfferProjectionFailure') {
          throw new Error('valid offer inputs may only fail during projection')
        }
        expect(['offer-1', 'offer-2', 'offer-3']).toContain(result.failure.offerId)
        expect(result.failure.offer.enchantments.length).toBeGreaterThan(1)
      }),
    )
  })

  it('property: keeps generated offers available for plan-based application', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff_ffff }), (seed) => {
        const result = enchantingOffers(readyState({ seed }))
        if (Result.isFailure(result)) {
          return
        }
        expect(
          result.success.every((offer) => offer === undefined || offer.rejectionReason === undefined),
        ).toBe(true)
      }),
    )
  })
})
