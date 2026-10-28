// @vitest-environment jsdom

/* eslint-disable no-undefined -- SlotView uses undefined for absent item data. */
import { describe, expect, it } from 'vitest'
import {
  inventoryFocusTargetForElement,
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

const createInventoryRegion = (regionId: string) => {
  const inventory = document.createElement('div')
  inventory.setAttribute('data-mx-ui', 'inventory')

  const region = document.createElement('div')
  region.setAttribute('data-mx-ui', 'region')
  region.setAttribute('data-region', regionId)
  region.setAttribute('data-region-state', 'slots')
  inventory.append(region)

  return { inventory, region }
}

const createSlot = (index: string) => {
  const slot = document.createElement('button')
  slot.setAttribute('data-mx-ui', 'slot')
  slot.setAttribute('data-slot-index', index)
  return slot
}

describe('inventory controller navigation', () => {
  it('resolves registered inventory, hotbar, and crafting-output members', () => {
    const { region } = createInventoryRegion('main')
    const slot = createSlot('4')
    const descendant = document.createElement('span')
    slot.append(descendant)
    region.append(slot)
    expect(inventoryFocusTargetForElement(descendant)).toStrictEqual({ group: 'main', index: 4 })

    const hotbar = document.createElement('div')
    hotbar.setAttribute('data-mx-ui', 'hotbar')
    const firstHotbarSlot = createSlot('0')
    const lastHotbarSlot = createSlot('8')
    hotbar.append(firstHotbarSlot, lastHotbarSlot)
    expect(inventoryFocusTargetForElement(firstHotbarSlot)).toStrictEqual({
      group: 'hotbar',
      index: 0,
    })
    expect(inventoryFocusTargetForElement(lastHotbarSlot)).toStrictEqual({
      group: 'hotbar',
      index: 8,
    })

    const { inventory } = createInventoryRegion('main')
    const outcome = document.createElement('div')
    outcome.setAttribute('data-mx-ui', 'crafting-outcome')
    outcome.setAttribute('data-crafting-state', 'match')
    const output = document.createElement('button')
    output.setAttribute('data-mx-ui', 'crafting-output')
    const outputDescendant = document.createElement('span')
    output.append(outputDescendant)
    outcome.append(output)
    inventory.append(outcome)
    expect(inventoryFocusTargetForElement(outputDescendant)).toStrictEqual({
      group: 'crafting-output',
      index: FIRST_INDEX,
    })
  })

  it('ignores foreign and unknown DOM targets', () => {
    expect(inventoryFocusTargetForElement(undefined)).toBeUndefined()
    expect(inventoryFocusTargetForElement(null)).toBeUndefined()
    expect(inventoryFocusTargetForElement({})).toBeUndefined()
    expect(inventoryFocusTargetForElement(42)).toBeUndefined()
    expect(inventoryFocusTargetForElement(document.createElement('div'))).toBeUndefined()

    const foreignSlot = createSlot('0')
    expect(inventoryFocusTargetForElement(foreignSlot)).toBeUndefined()

    const region = document.createElement('div')
    region.setAttribute('data-mx-ui', 'region')
    region.setAttribute('data-region', 'main')
    region.setAttribute('data-region-state', 'slots')
    region.append(createSlot('0'))
    expect(inventoryFocusTargetForElement(region.firstElementChild)).toBeUndefined()
  })

  it('does not resolve empty, unknown, or malformed inventory groups', () => {
    const { inventory, region } = createInventoryRegion('')
    expect(inventoryFocusTargetForElement(region)).toBeUndefined()

    const { region: missingGroupRegion } = createInventoryRegion('main')
    missingGroupRegion.removeAttribute('data-region')
    const missingGroupSlot = createSlot('0')
    missingGroupRegion.append(missingGroupSlot)
    expect(inventoryFocusTargetForElement(missingGroupSlot)).toBeUndefined()

    const unknownRegion = document.createElement('div')
    unknownRegion.setAttribute('data-mx-ui', 'region')
    unknownRegion.setAttribute('data-region', 'armour')
    unknownRegion.setAttribute('data-region-state', 'unknown')
    const unknownSlot = createSlot('0')
    unknownRegion.append(unknownSlot)
    inventory.append(unknownRegion)
    expect(inventoryFocusTargetForElement(unknownSlot)).toBeUndefined()

    region.setAttribute('data-region', 'main')
    const malformedSlot = createSlot('01')
    region.append(malformedSlot)
    expect(inventoryFocusTargetForElement(malformedSlot)).toBeUndefined()

    const hiddenSlot = createSlot('0')
    hiddenSlot.setAttribute('hidden', '')
    region.append(hiddenSlot)
    expect(inventoryFocusTargetForElement(hiddenSlot)).toBeUndefined()

    const { inventory: outputInventory } = createInventoryRegion('main')
    const outcome = document.createElement('div')
    outcome.setAttribute('data-mx-ui', 'crafting-outcome')
    outcome.setAttribute('data-crafting-state', 'unknown')
    const output = document.createElement('button')
    output.setAttribute('data-mx-ui', 'crafting-output')
    outcome.append(output)
    outputInventory.append(outcome)
    expect(inventoryFocusTargetForElement(output)).toBeUndefined()
  })

  it('does not resolve slots without an index or with an unsafe index', () => {
    const { region } = createInventoryRegion('main')
    const missingIndexSlot = document.createElement('button')
    missingIndexSlot.setAttribute('data-mx-ui', 'slot')
    const unsafeIndexSlot = createSlot('9007199254740992')
    region.append(missingIndexSlot, unsafeIndexSlot)

    expect(inventoryFocusTargetForElement(missingIndexSlot)).toBeUndefined()
    expect(inventoryFocusTargetForElement(unsafeIndexSlot)).toBeUndefined()
  })

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

  it('moves up within a region from the first column of a row, not just a middle column', () => {
    // The boundary condition is `index >= columns`, not `index > columns`: the
    // first slot of a non-first row (index === columns exactly, here 3) is the
    // case an off-by-one in that comparison mishandles, sending the move to the
    // adjacent region above instead of one row up within `main`.
    expect(moveInventoryTarget(model, { index: 3, kind: 'slot', region: 'main' }, 'up')).toStrictEqual({
      index: 0,
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
