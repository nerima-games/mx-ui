import { describe, expect, it } from 'vitest'
import { createChestStorageView } from '../src/application/chest-storage-view'
import {
  CHEST_STORAGE_SLOT_COUNT,
  chestStorageViewModel,
  type ChestStorageSlotSnapshot,
} from '../src/domain/chest-storage-view-model'
import { fakeDocument, type FakeElement } from './fake-dom'

describe('createChestStorageView', () => {
  it('mounts all regions and projects stacks, durability, selection, and cursor without listeners', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main') as FakeElement
    const view = createChestStorageView(factory, parent)
    const root = view.root as FakeElement
    const chest: Array<ChestStorageSlotSnapshot> = Array.from(
      { length: CHEST_STORAGE_SLOT_COUNT },
      () => undefined,
    )
    chest[0] = { item: 'minecraft:arrow', count: 32, durability: undefined }
    chest[4] = { item: 'minecraft:iron_pickaxe', count: 1, durability: 0.25 }

    view.render(
      chestStorageViewModel({
        chest,
        chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
        playerInventory: [{ item: 'minecraft:bow', count: 1, durability: 0.75 }],
        cursor: { item: 'minecraft:iron_pickaxe', count: 1, durability: 0.375 },
        selectedSlot: { region: 'chest', slot: 4 },
      }),
      { focusedSlot: { region: 'player', slot: 0 }, status: 'Choose a destination slot' },
    )

    expect(parent.children).toContain(root)
    expect(root.find('data-region', 'chest')?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
    expect(root.find('data-region', 'player-main')?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
    expect(root.find('data-region', 'player-hotbar')?.findAll('data-mx-ui', 'slot')).toHaveLength(9)

    const slots = root.findAll('data-interaction-target', 'chest-storage-slot')
    expect(slots).toHaveLength(63)
    expect(slots[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('minecraft:arrow')
    expect(slots[0]?.find('data-mx-ui', 'slot-count')?.textContent).toBe('32')
    expect(slots[4]?.attributes.has('data-selected')).toBe(true)
    expect(slots[4]?.find('data-mx-ui', 'slot-durability')?.attributes.has('hidden')).toBe(false)
    expect(slots[4]?.find('data-mx-ui', 'slot-durability-fill')?.style.properties.get('width')).toBe('25%')
    expect(slots[27]?.attributes.get('data-interaction-region')).toBe('player')
    expect(slots[27]?.attributes.get('data-interaction-slot')).toBe('9')
    expect(slots[54]?.attributes.get('data-interaction-slot')).toBe('0')
    expect(slots[54]?.attributes.get('tabindex')).toBe('0')

    const cursor = root.find('data-mx-ui', 'chest-storage-cursor')
    expect(cursor?.find('data-mx-ui', 'slot')?.attributes.get('data-cursor-state')).toBe(
      'stack',
    )
    expect(cursor?.find('data-mx-ui', 'slot-item')?.textContent).toBe('minecraft:iron_pickaxe')
    expect(cursor?.find('data-mx-ui', 'slot-durability-fill')?.style.properties.get('width')).toBe('38%')
    expect(root.find('data-mx-ui', 'chest-storage-status')?.textContent).toBe('Choose a destination slot')
    const close = root.find('data-interaction-target', 'chest-storage-close')
    expect(close?.tagName).toBe('button')
    expect(close?.attributes.get('type')).toBe('button')
    expect(close?.attributes.get('aria-label')).toBe('Close chest')
    expect(close?.textContent).toBe('Close')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('renders empty slots and clears an earlier cursor stack', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createChestStorageView(factory, parent)
    const root = view.root as FakeElement
    view.render(
      chestStorageViewModel({
        chest: [],
        chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
        playerInventory: [],
        cursor: { item: 'minecraft:arrow', count: 8, durability: undefined },
        selectedSlot: undefined,
      }),
    )
    view.render(
      chestStorageViewModel({
        chest: [],
        chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
        playerInventory: [],
        cursor: undefined,
        selectedSlot: undefined,
      }),
    )

    expect(root.findAll('data-interaction-target', 'chest-storage-slot').every((slot) => slot.attributes.has('data-empty'))).toBe(true)
    const cursor = root.find('data-mx-ui', 'chest-storage-cursor')
    expect(cursor?.find('data-mx-ui', 'slot')?.attributes.get('data-cursor-state')).toBe(
      'empty',
    )
    expect(cursor?.find('data-mx-ui', 'slot-item')?.textContent).toBe('')
    expect(cursor?.find('data-mx-ui', 'slot-count')?.textContent).toBe('')
    expect(cursor?.find('data-mx-ui', 'slot-durability')?.attributes.has('hidden')).toBe(true)
  })
})
