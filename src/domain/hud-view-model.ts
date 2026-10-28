/** Project owner supplied game state into UI-ready HUD values. */

import {
  type InventoryCarriedSlot,
  type Vitals,
  clampHotbarIndex,
  isDead,
  vitalsView,
} from '@nerima-games/mc-sim'

export {
  DEFAULT_MAX_HEALTH_POINTS,
  DEFAULT_MAX_HUNGER_POINTS,
  HOTBAR_SIZE as HOTBAR_SLOT_COUNT,
  SPAWN_VITALS as spawnSnapshot,
  clampHotbarIndex as hotbarSlotIndex,
} from '@nerima-games/mc-sim'

/** Two health points per heart, as in vanilla. */
export const HEALTH_POINTS_PER_HEART = 2

const ZERO = 0
const ONE = 1
const FULL_PERCENT = 100

export type IconState = 'full' | 'half' | 'empty'

export type HotbarSlotSnapshot = {
  readonly itemId: string | undefined
  readonly count: number
  readonly durability?: number | undefined
}
export type VitalsSnapshot = Vitals

export type SlotView = {
  readonly index: number
  readonly itemId: string | undefined
  readonly countLabel: string | undefined
  readonly durabilityPercent: number | undefined
  readonly selected: boolean
  readonly empty: boolean
}

export type HudViewModel = {
  readonly hearts: ReadonlyArray<IconState>
  readonly shanks: ReadonlyArray<IconState>
  readonly experienceLevelLabel: string
  readonly experiencePercent: number
  readonly hotbar: ReadonlyArray<SlotView>
  readonly dead: boolean
}

/** Split owner supplied points into full, half, and empty icons. */
export const iconRow = (points: number, maxPoints: number): ReadonlyArray<IconState> => {
  const iconCount = Math.ceil(maxPoints / HEALTH_POINTS_PER_HEART)

  return Array.from({ length: iconCount }, (_element, index): IconState => {
    const remaining = points - index * HEALTH_POINTS_PER_HEART
    if (remaining >= HEALTH_POINTS_PER_HEART) {
      return 'full'
    }
    if (remaining === ONE) {
      return 'half'
    }
    return 'empty'
  })
}

const slotCountLabel = (count: number, empty: boolean): string | undefined => {
  if (empty || count <= ONE) {
    return
  }
  return String(count)
}

const visibleSlotValue = <TValue,>(value: TValue, empty: boolean): TValue | undefined => {
  if (empty) {
    return
  }
  return value
}

const ownerSlotDurabilityPercent = (
  slot: Exclude<InventoryCarriedSlot, undefined>,
): number | undefined => {
  const { durability } = slot
  if (typeof durability === 'undefined') {
    return
  }
  return Math.round((durability.current / durability.max) * FULL_PERCENT)
}

const slotDurabilityPercent = (
  slot: InventoryCarriedSlot | HotbarSlotSnapshot,
): number | undefined => {
  if (typeof slot === 'undefined') {
    return
  }
  if ('item' in slot) {
    return ownerSlotDurabilityPercent(slot)
  }
  const { durability } = slot
  if (typeof durability === 'undefined') {
    return
  }
  return Math.round(durability * FULL_PERCENT)
}

const itemIdOf = (slot: InventoryCarriedSlot | HotbarSlotSnapshot): string | undefined => {
  if (typeof slot === 'undefined') {
    return
  }
  if ('item' in slot) {
    return slot.item
  }
  return slot.itemId
}

/** Project an owner supplied carried slot into the shared slot view. */
export const slotView = (
  slot: InventoryCarriedSlot | HotbarSlotSnapshot,
  index: number,
  selectedIndex: number,
): SlotView => {
  const count = slot?.count ?? ZERO
  const candidateItemId = itemIdOf(slot)
  const empty =
    typeof slot === 'undefined' ||
    typeof candidateItemId === 'undefined' ||
    !Number.isSafeInteger(count) ||
    count <= ZERO

  return {
    countLabel: slotCountLabel(count, empty),
    durabilityPercent: visibleSlotValue(slotDurabilityPercent(slot), empty),
    empty,
    index,
    itemId: visibleSlotValue(candidateItemId, empty),
    selected: index === selectedIndex,
  }
}

/** Derive the HUD from authoritative simulation state and inventory input. */
export const hudViewModel = (
  vitals: Vitals,
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot>,
  selectedHotbarSlot: number,
): HudViewModel => {
  const view = vitalsView(vitals)
  const selectedIndex = clampHotbarIndex(selectedHotbarSlot)

  return {
    dead: isDead(vitals),
    experienceLevelLabel: String(view.experienceLevel),
    experiencePercent: Math.floor(view.experienceProgress * FULL_PERCENT),
    hearts: iconRow(view.healthPoints, view.maxHealthPoints),
    hotbar: hotbarSlots.map((slot, index) => slotView(slot, index, selectedIndex)),
    shanks: iconRow(view.hungerPoints, view.maxHungerPoints),
  }
}
