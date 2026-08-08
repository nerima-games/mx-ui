import { describe, expect, it } from 'vitest'
import { createEnchantingTableView } from '../src/application/enchanting-table-view'
import {
  applyEnchantmentOffer,
  enchantingOffers,
  enchantingTableSnapshotOf,
  type EnchantingRules,
  type EnchantingTableState,
} from '../src/domain/enchanting-table-controller'
import { enchantingTableViewModel } from '../src/domain/enchanting-table-view-model'
import { type FakeElement, fakeDocument } from './fake-dom'

const RULES: EnchantingRules = {
  enchantments: [
    { allowedItemIds: ['sword'], enchantmentId: 'sharpness', incompatibleWith: ['smite'], levelCost: 4, maxLevel: 5 },
    { allowedItemIds: ['sword'], enchantmentId: 'smite', incompatibleWith: [], levelCost: 5, maxLevel: 5 },
    { allowedItemIds: ['sword'], enchantmentId: 'unbreaking', incompatibleWith: [], levelCost: 3, maxLevel: 3 },
    { allowedItemIds: ['sword'], enchantmentId: 'mending', incompatibleWith: [], levelCost: 2, maxLevel: 1 },
  ],
}

const readyState = (): EnchantingTableState => ({
  experienceLevel: 30,
  item: { count: 1, enchantments: [], itemId: 'sword' },
  lapisCount: 3,
  seed: 42,
})

describe('enchanting table controller', () => {
  it('derives three stable, distinct candidates from the seed and filters incompatibilities', () => {
    const state = readyState()
    expect(enchantingOffers(state, RULES)).toStrictEqual(enchantingOffers(state, RULES))
    const ids = enchantingOffers(state, RULES).map((offer) => offer?.enchantmentId)
    expect(new Set(ids).size).toBe(3)

    const enchanted: EnchantingTableState = {
      ...state,
      item: { ...state.item!, enchantments: [{ enchantmentId: 'sharpness', level: 1 }] },
    }
    expect(enchantingOffers(enchanted, RULES).some((offer) => offer?.enchantmentId === 'smite')).toBe(false)
  })

  it('rejects insufficient lapis or levels atomically', () => {
    const noLapis = { ...readyState(), lapisCount: 0 }
    const lapisResult = applyEnchantmentOffer(noLapis, 'offer-1', RULES)
    expect(lapisResult.state).toBe(noLapis)
    expect(lapisResult).toMatchObject({ applied: false, reason: 'Requires 1 lapis' })

    const noLevels = { ...readyState(), experienceLevel: 0 }
    const levelResult = applyEnchantmentOffer(noLevels, 'offer-1', RULES)
    expect(levelResult.state).toBe(noLevels)
    expect(levelResult.applied).toBe(false)
  })

  it('connects an offer click to atomic item mutation, resource consumption, and seed refresh', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    let state = readyState()
    const initialSeed = state.seed
    const initialOffer = enchantingOffers(state, RULES)[0]!
    const view = createEnchantingTableView(factory, host, {
      onActivate: (target) => {
        if (target === 'offer-1' || target === 'offer-2' || target === 'offer-3') {
          ({ state } = applyEnchantmentOffer(state, target, RULES))
        }
      },
    })
    view.render(enchantingTableViewModel(enchantingTableSnapshotOf(state, RULES)))
    const button = (view.root as FakeElement).find('data-operation-target', 'offer-1')
    button?.dispatch('click')

    expect(state.item?.enchantments).toContainEqual({
      enchantmentId: initialOffer.enchantmentId,
      level: initialOffer.enchantmentLevel,
    })
    expect(state.experienceLevel).toBe(30 - initialOffer.levelCost)
    expect(state.lapisCount).toBe(3 - initialOffer.lapisCost)
    expect(state.seed).not.toBe(initialSeed)
    expect(button?.listeners).toStrictEqual(['click'])
  })

  it('offers nothing when no item is placed in the table', () => {
    const empty: EnchantingTableState = { experienceLevel: 30, item: undefined, lapisCount: 3, seed: 42 }
    expect(enchantingOffers(empty, RULES)).toStrictEqual([undefined, undefined, undefined])
  })

  it('rejects applying an offer when no item is placed, preserving state identity', () => {
    const empty: EnchantingTableState = { experienceLevel: 30, item: undefined, lapisCount: 3, seed: 42 }
    const result = applyEnchantmentOffer(empty, 'offer-1', RULES)
    expect(result).toStrictEqual({ applied: false, reason: 'No compatible enchantment', state: empty })
    expect(result.state).toBe(empty)
  })

  it('shows no lapis slot when the table has no lapis loaded', () => {
    const noLapis = { ...readyState(), lapisCount: 0 }
    expect(enchantingTableSnapshotOf(noLapis, RULES).lapis).toBeUndefined()
  })
})
