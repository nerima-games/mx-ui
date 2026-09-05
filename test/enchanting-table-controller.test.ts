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

  it('SECOND ANGLE — property: an offer never costs fewer levels than its own slot lapis cost', () => {
    // Independently-computed invariant, not a value read back from the function
    // under test: vanilla's 1/2/3-lapis slots cost AT LEAST 1/2/3 levels even
    // when the drawn enchantment's own levelCost (RULES: 2-5) is cheaper than
    // the slot it lands in — `mending` (levelCost 4 -> trunc 2 here, RULES
    // above) landing in the 3-lapis slot is exactly this case. A mutant that
    // swapped `Math.max(lapisCost, ...)` for `Math.min(...)` would let a cheap
    // enchantment undercut its own slot, and the seed sweep below reaches that
    // arrangement without needing to know in advance which seed produces it.
    const SEED_SWEEP_SIZE = 64
    let sawLapisCostBindTheFloor = false
    for (let seed = 0; seed < SEED_SWEEP_SIZE; seed += 1) {
      const state = { ...readyState(), seed }
      for (const offer of enchantingOffers(state, RULES)) {
        if (typeof offer !== 'undefined') {
          expect(offer.levelCost).toBeGreaterThanOrEqual(offer.lapisCost)
          if (offer.levelCost === offer.lapisCost) {
            sawLapisCostBindTheFloor = true
          }
        }
      }
    }
    // If the floor never binds across 64 seeds, the property above is
    // vacuously true for every draw and proves nothing — this is the
    // non-empty-input check the invariant needs to mean something.
    expect(sawLapisCostBindTheFloor).toBe(true)
  })

  it('excludes an offer whose OWN incompatibleWith lists an enchantment already on the item (forward direction)', () => {
    // `sharpness`'s incompatibleWith is ['smite']; `smite`'s is []. The other
    // test above (enchanted with sharpness -> smite excluded) exercises the
    // REVERSE direction only (looking up the EXISTING enchantment's own
    // incompatibleWith list). This drives the opposite case: the item already
    // has `smite` and the CANDIDATE (`sharpness`) is the one whose own list
    // names it. Only the forward `definition.incompatibleWith.every(...)`
    // filter can catch this — the reverse lookup finds nothing, because
    // `smite.incompatibleWith` is empty.
    const state: EnchantingTableState = {
      ...readyState(),
      item: { ...readyState().item!, enchantments: [{ enchantmentId: 'smite', level: 1 }] },
    }
    const ids = enchantingOffers(state, RULES).map((offer) => offer?.enchantmentId)
    expect(ids).not.toContain('sharpness')
    expect(ids).not.toContain('smite')
  })
})
