import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createChestStorageView, type ChestStorageInteractionView } from '../src/application/chest-storage-view'
import {
  CHEST_STORAGE_SLOT_COUNT,
  chestStorageViewModel,
  type ChestStorageSlotSnapshot,
} from '../src/domain/chest-storage-view-model'
import { fakeDocument, fakeElement, type FakeElement } from './fake-dom'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'

/**
 * The three region slot counts, split out of the big mount assertion below so
 * each helper stays well under the complexity limit that the optional-chained
 * lookups blow past when they are all read in a single function.
 */
const expectRegionSlotCounts = (root: FakeElement): void => {
  expect(root.find('data-region', 'chest')?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
  expect(root.find('data-region', 'player-main')?.findAll('data-mx-ui', 'slot')).toHaveLength(27)
  expect(root.find('data-region', 'player-hotbar')?.findAll('data-mx-ui', 'slot')).toHaveLength(9)
}

const expectSlotStacksAndDurability = (root: FakeElement): void => {
  const slots = root.findAll('data-interaction-target', 'chest-storage-slot')
  expect(slots).toHaveLength(63)
  expect(slots[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:arrow')
  expect(slots[0]?.attributes.get('aria-label')).toBe('Chest slot 1, en:arrow, 32')
  expect(slots[0]?.find('data-mx-ui', 'slot-count')?.textContent).toBe('32')
  expect(slots[4]?.attributes.has('data-selected')).toBe(true)
  expect(slots[4]?.find('data-mx-ui', 'slot-durability')?.attributes.has('hidden')).toBe(false)
  expect(slots[4]?.find('data-mx-ui', 'slot-durability-fill')?.style.properties.get('width')).toBe('25%')
  expect(slots[27]?.attributes.get('data-interaction-region')).toBe('player')
  expect(slots[27]?.attributes.get('data-interaction-slot')).toBe('9')
  expect(slots[54]?.attributes.get('data-interaction-slot')).toBe('0')
  expect(slots[54]?.attributes.get('tabindex')).toBe('0')
}

const expectCursorStack = (root: FakeElement): void => {
  const cursor = root.find('data-mx-ui', 'chest-storage-cursor')
  expect(cursor?.find('data-mx-ui', 'slot')?.attributes.get('data-cursor-state')).toBe('stack')
  expect(cursor?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:iron_pickaxe')
  expect(cursor?.find('data-mx-ui', 'slot-durability-fill')?.style.properties.get('width')).toBe('38%')
}

const expectStatusAndCloseButton = (root: FakeElement): void => {
  expect(root.find('data-mx-ui', 'chest-storage-status')?.textContent).toBe('Choose a destination slot')
  const close = root.find('data-interaction-target', 'chest-storage-close')
  expect(close?.tagName).toBe('button')
  expect(close?.attributes.get('type')).toBe('button')
  expect(close?.attributes.get('aria-label')).toBe('Close chest')
  expect(close?.textContent).toBe('Close')
}

describe('createChestStorageView', () => {
  it('returns a typed failure for a null model', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))

    expect(view.render(null)).toStrictEqual(Result.fail({ _tag: 'InvalidChestStorageViewInput', field: 'model' }))
  })

  it('returns a typed failure for a null grid slot', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const valid = chestStorageViewModel({
      chest: [],
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory: [],
      cursor: undefined,
      selectedSlot: undefined,
    })
    const invalid = { ...valid }
    expect(Reflect.set(invalid, 'chest', [null])).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'chest.slot',
    }))
  })

  it('returns typed failures for null cursor and cursor count label', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const valid = chestStorageViewModel({
      chest: [],
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory: [],
      cursor: { item: 'minecraft:arrow', count: 1, durability: undefined },
      selectedSlot: undefined,
    })
    const invalidCursor = { ...valid }
    expect(Reflect.set(invalidCursor, 'cursor', null)).toBe(true)
    const invalidCount = { ...valid }
    if (typeof valid.cursor !== 'undefined') {
      const cursor = { ...valid.cursor }
      expect(Reflect.set(cursor, 'countLabel', null)).toBe(true)
      expect(Reflect.set(invalidCount, 'cursor', cursor)).toBe(true)
    }

    expect(view.render(invalidCursor)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'cursor',
    }))
    expect(view.render(invalidCount)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'cursor.countLabel',
    }))
  })

  it('rejects null count labels in every grid region before projecting any slots', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const chest: Array<ChestStorageSlotSnapshot> = Array.from(
      { length: CHEST_STORAGE_SLOT_COUNT },
      () => undefined,
    )
    chest[0] = { item: 'minecraft:arrow', count: 1, durability: undefined }
    const playerInventory: Array<ChestStorageSlotSnapshot> = Array.from({ length: 36 }, () => undefined)
    playerInventory[0] = { item: 'minecraft:stone', count: 1, durability: undefined }
    playerInventory[9] = { item: 'minecraft:apple', count: 1, durability: undefined }
    const valid = chestStorageViewModel({
      chest,
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory,
      cursor: undefined,
      selectedSlot: undefined,
    })
    view.render(valid)
    const before = factory.mark()

    for (const region of ['chest', 'playerMain', 'playerHotbar'] as const) {
      const invalid = { ...valid }
      const invalidSlots = valid[region].map((slot, index) => {
        if (index !== 0) {
          return slot
        }
        const invalidSlot = { ...slot }
        expect(Reflect.set(invalidSlot, 'countLabel', null)).toBe(true)
        return invalidSlot
      })
      expect(Reflect.set(invalid, region, invalidSlots)).toBe(true)

      expect(view.render(invalid)).toStrictEqual(Result.fail({
        _tag: 'InvalidChestStorageViewInput',
        field: `${region}.countLabel`,
      }))
    }
    expect(factory.since(before)).toStrictEqual([])
  })

  it('rejects null item display names in every nonempty grid region and on the cursor', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const chest: Array<ChestStorageSlotSnapshot> = Array.from(
      { length: CHEST_STORAGE_SLOT_COUNT },
      () => undefined,
    )
    chest[0] = { item: 'minecraft:arrow', count: 1, durability: undefined }
    const playerInventory: Array<ChestStorageSlotSnapshot> = Array.from({ length: 36 }, () => undefined)
    playerInventory[0] = { item: 'minecraft:stone', count: 1, durability: undefined }
    playerInventory[9] = { item: 'minecraft:apple', count: 1, durability: undefined }
    const valid = chestStorageViewModel({
      chest,
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory,
      cursor: { item: 'minecraft:iron_pickaxe', count: 1, durability: 0.38 },
      selectedSlot: undefined,
    }, fakeItemDisplayNameOptions())

    for (const [region, field] of [
      ['chest', 'chest.itemDisplayName'],
      ['playerMain', 'playerMain.itemDisplayName'],
      ['playerHotbar', 'playerHotbar.itemDisplayName'],
    ] as const) {
      const [slot] = valid[region]
      if (typeof slot === 'undefined') {
        expect(slot).toBeDefined()
        return
      }
      expect(slot.itemId).toBeDefined()
      expect(slot.itemDisplayName).toBeDefined()
      const invalidSlot = { ...slot }
      expect(Reflect.set(invalidSlot, 'itemDisplayName', null)).toBe(true)
      const invalid = { ...valid }
      const invalidSlots = valid[region].map((candidate, index) => index === 0 ? invalidSlot : candidate)
      expect(Reflect.set(invalid, region, invalidSlots)).toBe(true)

      expect(view.render(invalid)).toStrictEqual(Result.fail({
        _tag: 'InvalidChestStorageViewInput',
        field,
      }))
    }

    const { cursor } = valid
    if (typeof cursor === 'undefined') {
      expect(cursor).toBeDefined()
      return
    }
    expect(cursor.itemId).toBe('minecraft:iron_pickaxe')
    expect(cursor.itemDisplayName).toBeDefined()
    const invalidCursor = { ...cursor }
    expect(Reflect.set(invalidCursor, 'itemDisplayName', null)).toBe(true)
    const invalid = { ...valid }
    expect(Reflect.set(invalid, 'cursor', invalidCursor)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'cursor.itemDisplayName',
    }))
  })

  it('returns typed failures for null interaction, status, and focus inputs', () => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const model = chestStorageViewModel({
      chest: [],
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory: [],
      cursor: undefined,
      selectedSlot: undefined,
    })
    const invalidStatus: ChestStorageInteractionView = {
      focusedSlot: { region: 'player', slot: 0 },
      status: 'ready',
    }
    Reflect.set(invalidStatus, 'status', null)
    const invalidFocus: ChestStorageInteractionView = {
      focusedSlot: { region: 'player', slot: 0 },
      status: 'ready',
    }
    Reflect.set(invalidFocus, 'focusedSlot', null)

    expect(view.render(model, null)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'interaction',
    }))
    expect(view.render(model, invalidStatus)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'interaction.status',
    }))
    expect(view.render(model, invalidFocus)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'interaction.focusedSlot',
    }))
  })

  it.each([
    { region: 'inventory', slot: 0 },
    { region: 'chest', slot: -1 },
    { region: 'chest', slot: CHEST_STORAGE_SLOT_COUNT },
    { region: 'player', slot: 36 },
    { region: 'player', slot: 1.5 },
  ])('returns a typed failure for malformed focused slot targets: %o', (target) => {
    const factory = fakeDocument()
    const view = createChestStorageView(factory, factory.createElement('main'))
    const model = chestStorageViewModel({
      chest: [],
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory: [],
      cursor: undefined,
      selectedSlot: undefined,
    })
    const interaction: ChestStorageInteractionView = {
      focusedSlot: { region: 'chest', slot: 0 },
      status: 'ready',
    }
    expect(Reflect.set(interaction, 'focusedSlot', target)).toBe(true)

    expect(view.render(model, interaction)).toStrictEqual(Result.fail({
      _tag: 'InvalidChestStorageViewInput',
      field: 'interaction.focusedSlot',
    }))
  })

  it('uses the first chest slot as the tab stop when focus is omitted', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('main'))
    const view = createChestStorageView(factory, parent)
    const root = fakeElement(view.root)
    const model = chestStorageViewModel({
      chest: [{ item: 'minecraft:stone', count: 1, durability: undefined }],
      chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
      playerInventory: [],
      cursor: undefined,
      selectedSlot: undefined,
    }, fakeItemDisplayNameOptions())

    expect(view.render(model)).toBe(Result.void)
    expect(root.findAll('data-interaction-target', 'chest-storage-slot').map((slot) =>
      slot.attributes.get('tabindex'),
    )).toStrictEqual(['0'])
  })

  it('mounts all regions and projects stacks, durability, selection, and cursor without listeners', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('main'))
    const view = createChestStorageView(factory, parent)
    const root = fakeElement(view.root)
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
      }, fakeItemDisplayNameOptions()),
      { focusedSlot: { region: 'player', slot: 0 }, status: 'Choose a destination slot' },
    )

    expect(parent.children).toContain(root)
    expectRegionSlotCounts(root)
    expectSlotStacksAndDurability(root)
    expectCursorStack(root)
    expectStatusAndCloseButton(root)
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('renders empty slots and clears an earlier cursor stack', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createChestStorageView(factory, parent)
    const root = fakeElement(view.root)
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

  it('REGRESSION: a smaller container hides the chest grid squares its model has no slot for', () => {
    // `createChestStorageGrids` builds a FIXED 27-square chest grid at mount, sized for the
    // largest container this screen shows. `chestStorageViewModel` derives `chest` at
    // `snapshot.chestSlotCount`, which a hopper (5) or dispenser (9) sets far smaller than 27 —
    // so `updateGrid`'s `views[index]` really is `undefined` past the model's own slot count,
    // and those surplus squares have to be hidden rather than left showing the previous
    // container's items.
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createChestStorageView(factory, parent)
    const root = fakeElement(view.root)

    view.render(
      chestStorageViewModel({
        chest: [{ item: 'minecraft:arrow', count: 3, durability: undefined }],
        chestSlotCount: 5,
        playerInventory: [],
        cursor: undefined,
        selectedSlot: undefined,
      }, fakeItemDisplayNameOptions()),
    )

    const chestSlots = root.find('data-region', 'chest')?.findAll('data-mx-ui', 'slot')
    expect(chestSlots).toHaveLength(27)
    expect(chestSlots?.[0]?.attributes.has('data-empty')).toBe(false)
    expect(chestSlots?.[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:arrow')
    for (const slot of chestSlots?.slice(5) ?? []) {
      expect(slot.attributes.get('hidden')).toBe('')
      expect(slot.attributes.has('role')).toBe(false)
      expect(slot.attributes.has('data-selected')).toBe(false)
    }
  })
})
