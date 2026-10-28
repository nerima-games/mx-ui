/* eslint-disable no-undefined -- SlotView uses undefined for absent item data. */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  inventoryTargets,
  moveInventoryTarget,
  sameInventoryTarget,
} from '../src/application/inventory-navigation'
import type {
  CraftingOutcomeView,
  InventoryViewModel,
  RegionId,
  SlotRegion,
} from '../src/domain/inventory-view-model'
import type { SlotView } from '../src/domain/hud-view-model'

const REGION_IDS: readonly RegionId[] = ['hotbar', 'main', 'armour', 'offhand', 'crafting-grid']
const NAVIGATION_DIRECTIONS = ['down', 'left', 'right', 'up'] as const
const MINIMUM_NAVIGABLE_SLOTS = 1
const MAXIMUM_NAVIGABLE_SLOTS = 32
const MAXIMUM_COLUMNS = 20

type RegionShape =
  | Readonly<{ kind: 'slots'; columns: number; slotCount: number }>
  | Readonly<{ kind: 'unknown' }>

const emptySlot = (index: number): SlotView => ({
  countLabel: undefined,
  durabilityPercent: undefined,
  empty: true,
  index,
  itemId: undefined,
  selected: false,
})

const anyRegionShape: fc.Arbitrary<RegionShape> = fc.oneof(
  fc.record({
    columns: fc.integer({ max: MAXIMUM_COLUMNS, min: -MAXIMUM_COLUMNS }),
    kind: fc.constant('slots' as const),
    slotCount: fc.integer({ max: MAXIMUM_NAVIGABLE_SLOTS, min: 0 }),
  }),
  fc.constant({ kind: 'unknown' as const }),
)

const nonemptyRegionShape: fc.Arbitrary<Extract<RegionShape, { readonly kind: 'slots' }>> =
  fc.record({
    columns: fc.integer({ max: MAXIMUM_COLUMNS, min: -MAXIMUM_COLUMNS }),
    kind: fc.constant('slots' as const),
    slotCount: fc.integer({ max: MAXIMUM_NAVIGABLE_SLOTS, min: MINIMUM_NAVIGABLE_SLOTS }),
  })

const craftingKindArbitrary = fc.constantFrom('match', 'no-match', 'unknown')

const makeModel = (
  shapes: ReadonlyArray<RegionShape>,
  craftingKind: 'match' | 'no-match' | 'unknown',
): InventoryViewModel => {
  const regions: Array<SlotRegion> = shapes.map((shape, index) => {
    const id = REGION_IDS[index]
    if (id === undefined) {
      throw new Error('generated region count exceeds supported region identifiers')
    }
    if (shape.kind === 'unknown') {
      return { id, kind: 'unknown', why: 'not supplied' }
    }
    return {
      columns: shape.columns,
      id,
      kind: 'slots',
      slots: Array.from({ length: shape.slotCount }, (_value, slotIndex) => emptySlot(slotIndex)),
    }
  })

  const crafting: CraftingOutcomeView =
    craftingKind === 'match'
      ? { kind: 'match', output: emptySlot(0) }
      : { kind: craftingKind }

  return { carried: undefined, crafting, mergeTargets: { kind: 'unknown' }, regions }
}

const inventoryModelArbitrary: fc.Arbitrary<InventoryViewModel> = fc.record({
  craftingKind: craftingKindArbitrary,
  regions: fc.array(anyRegionShape, { maxLength: REGION_IDS.length }),
}).map(({ craftingKind, regions }) => makeModel(regions, craftingKind))

const navigableModelArbitrary: fc.Arbitrary<InventoryViewModel> = fc.tuple(
  nonemptyRegionShape,
  fc.array(anyRegionShape, { maxLength: REGION_IDS.length - 1 }),
  craftingKindArbitrary,
).map(([firstRegion, laterRegions, craftingKind]) =>
  makeModel([firstRegion, ...laterRegions], craftingKind),
)

describe('inventory navigation properties', () => {
  it('publishes exactly the slots in known regions and a matched crafting output', () => {
    fc.assert(
      fc.property(inventoryModelArbitrary, (model) => {
        const expectedSlots = model.regions.flatMap((region) =>
          region.kind === 'slots'
            ? region.slots.map((_slot, index) => ({ index, kind: 'slot' as const, region: region.id }))
            : [],
        )

        const actual = inventoryTargets(model)
        expect(actual.slice(0, expectedSlots.length)).toStrictEqual(expectedSlots)
        if (model.crafting.kind === 'match') {
          expect(actual[expectedSlots.length]).toStrictEqual({ kind: 'crafting-output' })
          expect(actual).toHaveLength(expectedSlots.length + 1)
        } else {
          expect(actual).toHaveLength(expectedSlots.length)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every directional move within the published target set', () => {
    fc.assert(
      fc.property(
        navigableModelArbitrary,
        fc.nat(),
        fc.constantFrom(...NAVIGATION_DIRECTIONS),
        (model, targetOffset, direction) => {
          const targets = inventoryTargets(model)
          const requested = targets[targetOffset % targets.length]
          if (requested === undefined) {
            throw new Error('generated model must include a navigable target')
          }

          const moved = moveInventoryTarget(model, requested, direction)
          expect(targets.some((target) => sameInventoryTarget(target, moved))).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
