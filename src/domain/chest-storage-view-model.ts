import { slotView, type SlotView } from './hud-view-model'
import {
  INVENTORY_MAIN_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  type MirroredItemId,
} from './inventory-view-model'

export const CHEST_STORAGE_COLUMNS = 9
export const CHEST_STORAGE_ROWS = 3
export const CHEST_STORAGE_SLOT_COUNT = CHEST_STORAGE_COLUMNS * CHEST_STORAGE_ROWS

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
  /** mc-sim inventory order: hotbar 0–8 followed by main inventory 9–35. */
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

const validSlot = (region: ChestStorageRegion, slot: number): boolean =>
  Number.isInteger(slot) && slot >= 0 && slot < (region === 'chest' ? CHEST_STORAGE_SLOT_COUNT : INVENTORY_SLOT_COUNT)

const sameTarget = (
  left: ChestStorageSlotTarget | undefined,
  right: ChestStorageSlotTarget,
): boolean => left?.region === right.region && left.slot === right.slot

const projectSlot = (
  region: ChestStorageRegion,
  slot: number,
  snapshot: ChestStorageSlotSnapshot,
  selected: ChestStorageSlotTarget | undefined,
): ChestStorageSlotView => {
  const target = Object.freeze({ region, slot })
  const visual = slotView(
    snapshot === undefined
      ? undefined
      : { itemId: snapshot.item, count: snapshot.count, durability: snapshot.durability },
    slot,
    sameTarget(selected, target) ? slot : -1,
  )
  return Object.freeze({ ...visual, target })
}

const slotAt = (
  slots: ReadonlyArray<ChestStorageSlotSnapshot>,
  index: number,
): ChestStorageSlotSnapshot => slots[index]

/** Purely derives the immutable 27-slot chest and 36-slot player presentation. */
export const chestStorageViewModel = (snapshot: ChestStorageSnapshot): ChestStorageViewModel => {
  const chest = Object.freeze(
    Array.from({ length: CHEST_STORAGE_SLOT_COUNT }, (_, slot) =>
      projectSlot('chest', slot, slotAt(snapshot.chest, slot), snapshot.selectedSlot),
    ),
  )
  const playerHotbar = Object.freeze(
    Array.from({ length: INVENTORY_SLOT_COUNT - INVENTORY_MAIN_SLOT_COUNT }, (_, slot) =>
      projectSlot('player', slot, slotAt(snapshot.playerInventory, slot), snapshot.selectedSlot),
    ),
  )
  const playerMain = Object.freeze(
    Array.from({ length: INVENTORY_MAIN_SLOT_COUNT }, (_, offset) => {
      const slot = offset + (INVENTORY_SLOT_COUNT - INVENTORY_MAIN_SLOT_COUNT)
      return projectSlot('player', slot, slotAt(snapshot.playerInventory, slot), snapshot.selectedSlot)
    }),
  )
  const cursor =
    snapshot.cursor === undefined
      ? undefined
      : Object.freeze({
          ...slotView(
            {
              itemId: snapshot.cursor.item,
              count: snapshot.cursor.count,
              durability: snapshot.cursor.durability,
            },
            0,
            -1,
          ),
          stack: Object.freeze({ ...snapshot.cursor }),
        })

  return Object.freeze({ chest, playerMain, playerHotbar, cursor })
}

/** Typed result for a host-owned pointer or keyboard activation of a slot. */
export const chestStorageSlotClickIntent = (
  target: ChestStorageSlotTarget,
): ChestStorageIntent | undefined =>
  validSlot(target.region, target.slot)
    ? Object.freeze({ _tag: 'SlotClicked', target: Object.freeze({ ...target }) })
    : undefined

/** Typed result for the listener-free close control or the host's Escape handling. */
export const chestStorageCloseIntent = (): ChestStorageIntent =>
  Object.freeze({ _tag: 'CloseRequested' })
