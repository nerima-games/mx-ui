import { type HotbarSlotSnapshot, type SlotView, slotView } from './hud-view-model.js'
import {
  INVENTORY_MAIN_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  type MirroredItemId,
} from './inventory-view-model.js'

const ZERO = 0
/** The slot index a value with no real position projects through, e.g. the cursor. */
const CURSOR_SLOT_INDEX = 0
/** `slotView`'s `selectedIndex` sentinel meaning "never matches a real slot". */
const NO_SELECTION_INDEX = -1
/** A hopper's capacity — the smallest variable container this screen can show. */
const HOPPER_SLOT_COUNT = 5
/** A dispenser or dropper's capacity. */
const DISPENSER_SLOT_COUNT = 9

export const CHEST_STORAGE_COLUMNS = 9
export const CHEST_STORAGE_ROWS = 3
// A literal, not `CHEST_STORAGE_COLUMNS * CHEST_STORAGE_ROWS`: --isolatedDeclarations
// Cannot infer an arithmetic expression's result without evaluating it, and this
// Needs to stay the exact literal `27` for `ChestStorageSlotCount` below to remain a
// Union of the three real slot counts rather than widening to plain `number`.
export const CHEST_STORAGE_SLOT_COUNT = 27 // === CHEST_STORAGE_COLUMNS * CHEST_STORAGE_ROWS
export type ChestStorageSlotCount =
  | typeof HOPPER_SLOT_COUNT
  | typeof DISPENSER_SLOT_COUNT
  | typeof CHEST_STORAGE_SLOT_COUNT

/** The item state a storage screen must preserve, including durable tools. */
export type ChestStorageStackSnapshot = {
  readonly item: MirroredItemId
  readonly count: number
  readonly durability: number | undefined
}

export type ChestStorageSlotSnapshot = ChestStorageStackSnapshot | undefined

export type ChestStorageRegion = 'chest' | 'player'

export type ChestStorageSlotTarget = {
  readonly region: ChestStorageRegion
  readonly slot: number
}

export type ChestStorageSnapshot = {
  readonly chest: ReadonlyArray<ChestStorageSlotSnapshot>
  readonly chestSlotCount: ChestStorageSlotCount
  /** Mc-sim inventory order: hotbar 0–8 followed by main inventory 9–35. */
  readonly playerInventory: ReadonlyArray<ChestStorageSlotSnapshot>
  readonly cursor: ChestStorageSlotSnapshot
  readonly selectedSlot: ChestStorageSlotTarget | undefined
}

export type ChestStorageSlotView = SlotView & {
  readonly target: ChestStorageSlotTarget
}

export type ChestStorageCursorView = SlotView & {
  /** Exact host state, retained alongside its normalized visual projection. */
  readonly stack: ChestStorageStackSnapshot
}

export type ChestStorageViewModel = {
  readonly chest: ReadonlyArray<ChestStorageSlotView>
  readonly playerMain: ReadonlyArray<ChestStorageSlotView>
  readonly playerHotbar: ReadonlyArray<ChestStorageSlotView>
  readonly cursor: ChestStorageCursorView | undefined
}

export type ChestStorageIntent =
  | { readonly _tag: 'SlotClicked'; readonly target: ChestStorageSlotTarget }
  | { readonly _tag: 'CloseRequested' }

const validSlot = (
  region: ChestStorageRegion,
  slot: number,
  chestSlotCount = CHEST_STORAGE_SLOT_COUNT,
): boolean => {
  let capacity = INVENTORY_SLOT_COUNT
  if (region === 'chest') {
    capacity = chestSlotCount
  }
  return Number.isInteger(slot) && slot >= ZERO && slot < capacity
}

const sameTarget = (
  left: ChestStorageSlotTarget | undefined,
  right: ChestStorageSlotTarget,
): boolean => left?.region === right.region && left.slot === right.slot

const toHotbarSlotSnapshot = (snapshot: ChestStorageSlotSnapshot): HotbarSlotSnapshot | undefined => {
  if (typeof snapshot === 'undefined') {
    return
  }
  return { count: snapshot.count, durability: snapshot.durability, itemId: snapshot.item }
}

const targetSlotIndex = (target: ChestStorageSlotTarget, selected: ChestStorageSlotTarget | undefined): number => {
  if (sameTarget(selected, target)) {
    return target.slot
  }
  return NO_SELECTION_INDEX
}

const projectSlot = (
  target: ChestStorageSlotTarget,
  snapshot: ChestStorageSlotSnapshot,
  selected: ChestStorageSlotTarget | undefined,
): ChestStorageSlotView => {
  const visual = slotView(toHotbarSlotSnapshot(snapshot), target.slot, targetSlotIndex(target, selected))
  return Object.freeze({ ...visual, target: Object.freeze({ ...target }) })
}

const slotAt = (
  slots: ReadonlyArray<ChestStorageSlotSnapshot>,
  index: number,
): ChestStorageSlotSnapshot => slots[index]

const projectCursor = (cursor: ChestStorageStackSnapshot | undefined): ChestStorageCursorView | undefined => {
  if (typeof cursor === 'undefined') {
    return
  }
  return Object.freeze({
    ...slotView(
      { count: cursor.count, durability: cursor.durability, itemId: cursor.item },
      CURSOR_SLOT_INDEX,
      NO_SELECTION_INDEX,
    ),
    stack: Object.freeze({ ...cursor }),
  })
}

/** Purely derives the immutable active container and 36-slot player presentation. */
export const chestStorageViewModel = (snapshot: ChestStorageSnapshot): ChestStorageViewModel => {
  const chest = Object.freeze(
    Array.from({ length: snapshot.chestSlotCount }, (_element, slot) =>
      projectSlot({ region: 'chest', slot }, slotAt(snapshot.chest, slot), snapshot.selectedSlot),
    ),
  )
  const playerHotbar = Object.freeze(
    Array.from({ length: INVENTORY_SLOT_COUNT - INVENTORY_MAIN_SLOT_COUNT }, (_element, slot) =>
      projectSlot({ region: 'player', slot }, slotAt(snapshot.playerInventory, slot), snapshot.selectedSlot),
    ),
  )
  const playerMain = Object.freeze(
    Array.from({ length: INVENTORY_MAIN_SLOT_COUNT }, (_element, offset) => {
      const slot = offset + (INVENTORY_SLOT_COUNT - INVENTORY_MAIN_SLOT_COUNT)
      return projectSlot({ region: 'player', slot }, slotAt(snapshot.playerInventory, slot), snapshot.selectedSlot)
    }),
  )
  const cursor = projectCursor(snapshot.cursor)

  return Object.freeze({ chest, cursor, playerHotbar, playerMain })
}

/** Typed result for a host-owned pointer or keyboard activation of a slot. */
export const chestStorageSlotClickIntent = (
  target: ChestStorageSlotTarget,
  chestSlotCount: ChestStorageSlotCount = CHEST_STORAGE_SLOT_COUNT,
): ChestStorageIntent | undefined => {
  if (validSlot(target.region, target.slot, chestSlotCount)) {
    return Object.freeze({ _tag: 'SlotClicked', target: Object.freeze({ ...target }) })
  }
  return
}

/** Typed result for the listener-free close control or the host's Escape handling. */
export const chestStorageCloseIntent = (): ChestStorageIntent =>
  Object.freeze({ _tag: 'CloseRequested' })
