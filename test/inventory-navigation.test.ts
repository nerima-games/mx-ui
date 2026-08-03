/* eslint-disable no-undefined -- SlotView uses undefined for absent item data. */
import { describe, expect, it } from 'vitest'
import {
  inventoryTargets,
  moveInventoryTarget,
} from '../src/application/inventory-navigation'
import type { InventoryViewModel } from '../src/domain/inventory-view-model'
import type { SlotView } from '../src/domain/hud-view-model'

const emptySlot = (index: number): SlotView => ({
  countLabel: undefined,
  durabilityPercent: undefined,
  empty: true,
  index,
  itemId: undefined,
  selected: false,
})

const MAIN_COLUMNS = 3
const MAIN_SLOT_COUNT = 5
const CRAFTING_COLUMNS = 2
const CRAFTING_SLOT_COUNT = 4
const FIRST_INDEX = 0

const model: InventoryViewModel = {
  carried: undefined,
  crafting: { kind: 'match', output: emptySlot(FIRST_INDEX) },
  mergeTargets: { kind: 'unknown' },
  regions: [
    {
      columns: MAIN_COLUMNS,
      id: 'main',
      kind: 'slots',
      slots: Array.from({ length: MAIN_SLOT_COUNT }, (_value, index) => emptySlot(index)),
    },
    { id: 'armour', kind: 'unknown', why: 'not supplied' },
    {
      columns: CRAFTING_COLUMNS,
      id: 'crafting-grid',
      kind: 'slots',
      slots: Array.from({ length: CRAFTING_SLOT_COUNT }, (_value, index) => emptySlot(index)),
    },
  ],
}

describe('inventory controller navigation', () => {
  it('publishes only concrete slots and a concrete crafting output', () => {
    expect(inventoryTargets(model)).toStrictEqual([
      { index: 0, kind: 'slot', region: 'main' },
      { index: 1, kind: 'slot', region: 'main' },
      { index: 2, kind: 'slot', region: 'main' },
      { index: 3, kind: 'slot', region: 'main' },
      { index: 4, kind: 'slot', region: 'main' },
      { index: 0, kind: 'slot', region: 'crafting-grid' },
      { index: 1, kind: 'slot', region: 'crafting-grid' },
      { index: 2, kind: 'slot', region: 'crafting-grid' },
      { index: 3, kind: 'slot', region: 'crafting-grid' },
      { kind: 'crafting-output' },
    ])
  })

  it('uses region columns and projects the column across unknown regions', () => {
    expect(moveInventoryTarget(model, { index: 1, kind: 'slot', region: 'main' }, 'down')).toStrictEqual({
      index: 4,
      kind: 'slot',
      region: 'main',
    })
    expect(moveInventoryTarget(model, { index: 4, kind: 'slot', region: 'main' }, 'down')).toStrictEqual({
      index: 1,
      kind: 'slot',
      region: 'crafting-grid',
    })
    expect(moveInventoryTarget(model, { index: 1, kind: 'slot', region: 'crafting-grid' }, 'up')).toStrictEqual({
      index: 4,
      kind: 'slot',
      region: 'main',
    })
  })

  it('does not wrap horizontal edges and reaches the output from the final row', () => {
    const rightEdge = { index: 2, kind: 'slot', region: 'main' } as const
    expect(moveInventoryTarget(model, rightEdge, 'right')).toStrictEqual(rightEdge)
    expect(moveInventoryTarget(model, { index: 3, kind: 'slot', region: 'crafting-grid' }, 'down')).toStrictEqual({
      kind: 'crafting-output',
    })
    expect(moveInventoryTarget(model, { kind: 'crafting-output' }, 'up')).toStrictEqual({
      index: 2,
      kind: 'slot',
      region: 'crafting-grid',
    })
  })

  it('repairs a stale target before moving', () => {
    expect(moveInventoryTarget(model, { index: 99, kind: 'slot', region: 'hotbar' }, 'right')).toStrictEqual({
      index: 1,
      kind: 'slot',
      region: 'main',
    })
  })
})
