import { describe, expect, it } from 'vitest'
import {
  CHEST_STORAGE_SLOT_COUNT,
  chestStorageCloseIntent,
  chestStorageSlotClickIntent,
  chestStorageViewModel,
  type ChestStorageSnapshot,
} from '../domain/chest-storage-view-model'
import { INVENTORY_MAIN_SLOT_COUNT, INVENTORY_SLOT_COUNT } from '../domain/inventory-view-model'
import { HOTBAR_SLOT_COUNT } from '../domain/hud-view-model'

const EMPTY: ChestStorageSnapshot = {
  chest: [],
  playerInventory: [],
  cursor: undefined,
  selectedSlot: undefined,
}

describe('chestStorageViewModel', () => {
  it('always projects a 27-slot chest and the 27 + 9 player layout', () => {
    const model = chestStorageViewModel(EMPTY)

    expect(model.chest).toHaveLength(27)
    expect(model.playerMain).toHaveLength(27)
    expect(model.playerHotbar).toHaveLength(9)
    expect(model.chest.every((slot) => slot.empty)).toBe(true)
    expect(model.playerMain.map((slot) => slot.target.slot)).toStrictEqual(
      Array.from({ length: INVENTORY_MAIN_SLOT_COUNT }, (_, offset) => offset + HOTBAR_SLOT_COUNT),
    )
    expect(model.playerHotbar.map((slot) => slot.target.slot)).toStrictEqual(
      Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => slot),
    )
    expect(CHEST_STORAGE_SLOT_COUNT).toBe(27)
    expect(INVENTORY_SLOT_COUNT).toBe(36)
  })

  it('projects stacks and durable items while retaining an exact frozen cursor copy', () => {
    const cursor = { item: 'minecraft:iron_pickaxe', count: 1, durability: 0.375 }
    const model = chestStorageViewModel({
      ...EMPTY,
      chest: [{ item: 'minecraft:arrow', count: 32, durability: undefined }],
      playerInventory: [{ item: 'minecraft:bow', count: 1, durability: 0.61 }],
      cursor,
    })

    expect(model.chest[0]).toMatchObject({
      itemId: 'minecraft:arrow',
      countLabel: '32',
      durabilityPercent: undefined,
      empty: false,
    })
    expect(model.playerHotbar[0]).toMatchObject({
      itemId: 'minecraft:bow',
      countLabel: undefined,
      durabilityPercent: 61,
      empty: false,
    })
    expect(model.cursor).toMatchObject({
      itemId: 'minecraft:iron_pickaxe',
      countLabel: undefined,
      durabilityPercent: 38,
      stack: cursor,
    })
    expect(model.cursor?.stack).not.toBe(cursor)
    expect(Object.isFrozen(model.cursor?.stack)).toBe(true)
    cursor.durability = 0
    expect(model.cursor?.stack.durability).toBe(0.375)
  })

  it('selects only the host-provided first-click location', () => {
    const model = chestStorageViewModel({
      ...EMPTY,
      selectedSlot: { region: 'player', slot: 10 },
    })

    expect(model.chest.some((slot) => slot.selected)).toBe(false)
    expect(model.playerMain.filter((slot) => slot.selected).map((slot) => slot.target)).toStrictEqual([
      { region: 'player', slot: 10 },
    ])
    expect(model.playerHotbar.some((slot) => slot.selected)).toBe(false)
  })

  it('returns validated typed slot and close intents for the host', () => {
    expect(chestStorageSlotClickIntent({ region: 'chest', slot: 26 })).toStrictEqual({
      _tag: 'SlotClicked',
      target: { region: 'chest', slot: 26 },
    })
    expect(chestStorageSlotClickIntent({ region: 'player', slot: 35 })).toStrictEqual({
      _tag: 'SlotClicked',
      target: { region: 'player', slot: 35 },
    })
    expect(chestStorageSlotClickIntent({ region: 'chest', slot: 27 })).toBeUndefined()
    expect(chestStorageSlotClickIntent({ region: 'player', slot: -1 })).toBeUndefined()
    expect(chestStorageSlotClickIntent({ region: 'player', slot: 1.5 })).toBeUndefined()
    expect(chestStorageCloseIntent()).toStrictEqual({ _tag: 'CloseRequested' })
  })
})
