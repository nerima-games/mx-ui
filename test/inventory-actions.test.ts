import {
  EQUIPMENT_SLOT_IDS,
  type InventoryActionState,
  inventoryActionStatus,
  inventoryActionTarget,
} from '../src/application/inventory-actions'
import { describe, expect, it } from 'vitest'

const FIRST_SLOT_INDEX = 0
const INVALID_ARMOUR_INDEX = 4
const INVALID_OFFHAND_INDEX = 1
const STORAGE_SLOT_INDEX = 2

describe('inventory equipment actions', () => {
  it('publishes every equipment slot by semantic identity', () => {
    expect(
      EQUIPMENT_SLOT_IDS.filter((slot) => slot !== 'offhand').map((_slot, index) =>
        inventoryActionTarget({ index, kind: 'slot', region: 'armour' }),
      ),
    ).toStrictEqual([
      { kind: 'equipment-slot', slot: 'head' },
      { kind: 'equipment-slot', slot: 'chest' },
      { kind: 'equipment-slot', slot: 'legs' },
      { kind: 'equipment-slot', slot: 'feet' },
    ])
    expect(
      inventoryActionTarget({ index: FIRST_SLOT_INDEX, kind: 'slot', region: 'offhand' }),
    ).toStrictEqual({ kind: 'equipment-slot', slot: 'offhand' })
  })

  it('rejects impossible equipment coordinates without inventing compatibility rules', () => {
    expect(
      inventoryActionTarget({ index: INVALID_ARMOUR_INDEX, kind: 'slot', region: 'armour' }),
    ).toBeNull()
    expect(
      inventoryActionTarget({ index: INVALID_OFFHAND_INDEX, kind: 'slot', region: 'offhand' }),
    ).toBeNull()
    expect(
      inventoryActionTarget({ index: STORAGE_SLOT_INDEX, kind: 'slot', region: 'main' }),
    ).toStrictEqual({
      index: STORAGE_SLOT_INDEX,
      kind: 'slot',
      region: 'main',
    })
  })

  it('projects a host rejection without interpreting its simulation reason', () => {
    const state: InventoryActionState = {
      action: {
        kind: 'drag',
        source: { index: STORAGE_SLOT_INDEX, kind: 'slot', region: 'main' },
        target: { kind: 'equipment-slot', slot: 'head' },
      },
      kind: 'rejected',
      reason: 'The selected item cannot be worn on the head',
    }

    expect(inventoryActionStatus(state)).toBe('The selected item cannot be worn on the head')
    expect(inventoryActionStatus({ kind: 'idle' })).toBe('')
  })
})
