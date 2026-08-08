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

  it('returns the requested target unchanged when the model has nothing to navigate to', () => {
    const nothingToNavigate: InventoryViewModel = {
      carried: undefined,
      crafting: { kind: 'unknown' },
      mergeTargets: { kind: 'unknown' },
      regions: [{ id: 'armour', kind: 'unknown', why: 'not supplied' }],
    }
    const requested = { index: 0, kind: 'slot', region: 'main' } as const
    expect(moveInventoryTarget(nothingToNavigate, requested, 'right')).toStrictEqual(requested)
  })

  it('moves up within a region without leaving it', () => {
    expect(moveInventoryTarget(model, { index: 4, kind: 'slot', region: 'main' }, 'up')).toStrictEqual({
      index: 1,
      kind: 'slot',
      region: 'main',
    })
  })

  it('does not move past the first region when there is nothing above it', () => {
    const topLeft = { index: 0, kind: 'slot', region: 'main' } as const
    expect(moveInventoryTarget(model, topLeft, 'up')).toStrictEqual(topLeft)
  })

  it('does not wrap the left edge, and moves left within a row otherwise', () => {
    const leftEdge = { index: 0, kind: 'slot', region: 'main' } as const
    expect(moveInventoryTarget(model, leftEdge, 'left')).toStrictEqual(leftEdge)
    expect(moveInventoryTarget(model, { index: 1, kind: 'slot', region: 'main' }, 'left')).toStrictEqual({
      index: 0,
      kind: 'slot',
      region: 'main',
    })
  })

  it('treats a non-positive column count as a single column instead of dividing by it', () => {
    const brokenColumns: InventoryViewModel = {
      carried: undefined,
      crafting: { kind: 'unknown' },
      mergeTargets: { kind: 'unknown' },
      regions: [
        {
          columns: 0,
          id: 'main',
          kind: 'slots',
          slots: [emptySlot(0), emptySlot(1), emptySlot(2)],
        },
      ],
    }
    // A single-column layout has no rightward move: every slot is its own row.
    const start = { index: 0, kind: 'slot', region: 'main' } as const
    expect(moveInventoryTarget(brokenColumns, start, 'right')).toStrictEqual(start)
  })

  it('the crafting output does not move for directions with no meaning from it', () => {
    const output = { kind: 'crafting-output' } as const
    expect(moveInventoryTarget(model, output, 'right')).toStrictEqual(output)
    expect(moveInventoryTarget(model, output, 'down')).toStrictEqual(output)
  })

  it('the crafting output stays focused when there is no slot region to move into', () => {
    const outputOnly: InventoryViewModel = {
      carried: undefined,
      crafting: { kind: 'match', output: emptySlot(FIRST_INDEX) },
      mergeTargets: { kind: 'unknown' },
      regions: [],
    }
    const output = { kind: 'crafting-output' } as const
    expect(moveInventoryTarget(outputOnly, output, 'up')).toStrictEqual(output)
    expect(moveInventoryTarget(outputOnly, output, 'left')).toStrictEqual(output)
  })
})
