/** Project owner supplied game state into UI-ready HUD values. */

import {
  EnchantmentLevel,
  SUPPORTED_VANILLA_ENCHANTMENT_IDS,
  type SupportedVanillaEnchantmentId,
} from '@nerima-games/mc-kernel'
import { Result } from 'effect'
import {
  type HudPresentationSnapshot,
  hudPresentationView,
} from './hud-presentation.js'
import {
  type InventoryCarriedSlot,
  type Vitals,
  clampHotbarIndex,
  isDead,
  vitalsView,
} from '@nerima-games/mc-sim'
import {
  type ItemDisplayNameOptions,
  type ItemDisplayNameView,
  itemDisplayNameView,
} from './item-display-name.js'
import { type ItemIconView, itemIconView } from './item-icon.js'

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
  readonly enchantments?: Readonly<Partial<Record<SupportedVanillaEnchantmentId, EnchantmentLevel>>> | undefined
}
export type VitalsSnapshot = Vitals

export type SlotView = {
  readonly index: number
  readonly itemId: string | undefined
  readonly itemDisplayName?: ItemDisplayNameView
  readonly itemIcon?: ItemIconView
  readonly enchantments?: ReadonlyArray<Readonly<{ id: SupportedVanillaEnchantmentId; level: EnchantmentLevel }>>
  readonly countLabel: string | undefined
  readonly durabilityPercent: number | undefined
  readonly selected: boolean
  readonly empty: boolean
}

type SlotViewOptions = Readonly<{
  readonly selectedIndex: number
  readonly itemDisplayNameOptions?: ItemDisplayNameOptions | undefined
}>

type HudViewModelOptions = Readonly<{
  readonly selectedHotbarSlot: number
  readonly itemDisplayNameOptions?: ItemDisplayNameOptions | undefined
  readonly presentation?: HudPresentationSnapshot | undefined
}>

type InvalidCountCarriedSlot = Readonly<{
  readonly count: null | undefined
  readonly item?: unknown
  readonly itemId?: unknown
}>
type InvalidHudSlotCountFailure = Readonly<{ readonly _tag: 'InvalidSlotCount' }>

const hasValidHotbarSlotCounts = (
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot | InvalidCountCarriedSlot>,
): hotbarSlots is ReadonlyArray<InventoryCarriedSlot> => {
  for (const slot of hotbarSlots) {
    if (
      typeof slot !== 'undefined' &&
      (Object.is(slot, null) || typeof slot !== 'object' || typeof slot.count !== 'number')
    ) {
      return false
    }
  }
  return true
}

export type HudViewModel = {
  readonly hearts: ReadonlyArray<IconState>
  readonly shanks: ReadonlyArray<IconState>
  readonly experienceLevelLabel: string
  readonly experiencePercent: number
  readonly hotbar: ReadonlyArray<SlotView>
  readonly dead: boolean
  readonly presentation?: ReturnType<typeof hudPresentationView>
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

const enchantmentsForSlot = (
  slot: InventoryCarriedSlot | HotbarSlotSnapshot | undefined,
): Readonly<Partial<Record<SupportedVanillaEnchantmentId, EnchantmentLevel>>> | undefined => {
  if (typeof slot === 'undefined') {
    return
  }
  if ('item' in slot) {
    return slot.components.enchantments ?? slot.components.storedEnchantments
  }
  const { enchantments } = slot
  return enchantments
}

const enchantmentEntries = (
  enchantments: Readonly<Partial<Record<SupportedVanillaEnchantmentId, EnchantmentLevel>>>,
): ReadonlyArray<Readonly<{ id: SupportedVanillaEnchantmentId; level: EnchantmentLevel }>> | undefined => {
  const entries: Array<Readonly<{ id: SupportedVanillaEnchantmentId; level: EnchantmentLevel }>> = []
  for (const id of SUPPORTED_VANILLA_ENCHANTMENT_IDS) {
    const level = enchantments[id]
    if (typeof level !== 'undefined' && EnchantmentLevel.is(level) && level > ZERO) {
      entries.push({ id, level })
    }
  }
  entries.sort((left, right) => left.id.localeCompare(right.id))
  if (entries.length === ZERO) {
    return
  }
  return entries
}

const enchantmentsOf = (
  slot: InventoryCarriedSlot | HotbarSlotSnapshot | undefined,
): ReadonlyArray<Readonly<{ id: SupportedVanillaEnchantmentId; level: EnchantmentLevel }>> | undefined => {
  if (typeof slot === 'undefined') {
    return
  }
  const enchantments = enchantmentsForSlot(slot)
  if (typeof enchantments === 'undefined') {
    return
  }
  return enchantmentEntries(enchantments)
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
const slotOptionsOf = (selection: number | SlotViewOptions): SlotViewOptions => {
  if (typeof selection === 'number') {
    return { selectedIndex: selection }
  }
  return selection
}

const hudOptionsOf = (selection: number | HudViewModelOptions): HudViewModelOptions => {
  if (typeof selection === 'number') {
    return { selectedHotbarSlot: selection }
  }
  return selection
}

type NullSlotViewFailure = Readonly<{ readonly _tag: 'NullSlotViewInput' }>
type InvalidSlotCountInput = Readonly<{
  readonly count: null | undefined
  readonly item?: unknown
  readonly itemId?: unknown
}>
type InvalidSlotCountFailure = Readonly<{ readonly _tag: 'InvalidSlotCount' }>

const optionalDisplayName = (
  itemId: string,
  options: ItemDisplayNameOptions | undefined,
): ItemDisplayNameView | undefined => {
  if (typeof options === 'undefined') {
    return
  }
  return itemDisplayNameView(itemId, options)
}

type SlotViewPresentation = Readonly<{
  readonly displayName: ItemDisplayNameView | undefined
  readonly itemIcon: ItemIconView
  readonly enchantments: SlotView['enchantments']
}>

const completeSlotView = (view: SlotView, presentation: SlotViewPresentation): SlotView => {
  let combined: SlotView = { ...view, itemIcon: presentation.itemIcon }
  if (typeof presentation.displayName !== 'undefined') {
    combined = { ...combined, itemDisplayName: presentation.displayName }
  }
  if (typeof presentation.enchantments !== 'undefined') {
    combined = { ...combined, enchantments: presentation.enchantments }
  }
  return combined
}

const summarySlotView = (
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

const projectSlotView = (
  slot: InventoryCarriedSlot | HotbarSlotSnapshot,
  index: number,
  selection: number | SlotViewOptions,
): SlotView => {
  const { itemDisplayNameOptions, selectedIndex } = slotOptionsOf(selection)
  const view = summarySlotView(slot, index, selectedIndex)
  const { itemId } = view
  if (typeof itemId === 'undefined') {
    return view
  }
  return completeSlotView(view, {
    displayName: optionalDisplayName(itemId, itemDisplayNameOptions),
    enchantments: enchantmentsOf(slot),
    itemIcon: itemIconView(itemId, itemDisplayNameOptions?.iconResolver),
  })
}

export function slotView(
  slot: InventoryCarriedSlot | HotbarSlotSnapshot,
  index: number,
  selection: number | SlotViewOptions,
): SlotView
export function slotView(
  slot: null,
  index: number,
  selection: number | SlotViewOptions,
): Result.Result<SlotView, NullSlotViewFailure | InvalidSlotCountFailure>
export function slotView(
  slot: InvalidSlotCountInput,
  index: number,
  selection: number | SlotViewOptions,
): Result.Result<SlotView, NullSlotViewFailure | InvalidSlotCountFailure>
export function slotView(
  slot: InventoryCarriedSlot | HotbarSlotSnapshot | InvalidSlotCountInput | null,
  index: number,
  selection: number | SlotViewOptions,
): SlotView | Result.Result<SlotView, NullSlotViewFailure | InvalidSlotCountFailure>
export function slotView(
  slot: InventoryCarriedSlot | HotbarSlotSnapshot | InvalidSlotCountInput | null,
  index: number,
  selection: number | SlotViewOptions,
): SlotView | Result.Result<SlotView, NullSlotViewFailure | InvalidSlotCountFailure> {
  if (slot === null) {
    return Result.fail({ _tag: 'NullSlotViewInput' })
  }
  if (typeof slot !== 'undefined' && typeof slot.count !== 'number') {
    return Result.fail({ _tag: 'InvalidSlotCount' })
  }
  return projectSlotView(slot, index, selection)
}

const projectHudViewModel = (
  vitals: Vitals,
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot>,
  selection: number | HudViewModelOptions,
): HudViewModel => {
  const { itemDisplayNameOptions, presentation, selectedHotbarSlot } = hudOptionsOf(selection)
  const view = vitalsView(vitals)
  const selectedIndex = clampHotbarIndex(selectedHotbarSlot)
  const slotOptions: SlotViewOptions = { itemDisplayNameOptions, selectedIndex }

  const model: HudViewModel = {
    dead: isDead(vitals),
    experienceLevelLabel: String(view.experienceLevel),
    experiencePercent: Math.floor(view.experienceProgress * FULL_PERCENT),
    hearts: iconRow(view.healthPoints, view.maxHealthPoints),
    hotbar: hotbarSlots.map((slot, index) => slotView(slot, index, slotOptions)),
    shanks: iconRow(view.hungerPoints, view.maxHungerPoints),
  }

  if (typeof presentation !== 'undefined') {
    return { ...model, presentation: hudPresentationView(presentation) }
  }
  return model
}

/** Derive the HUD from authoritative simulation state and inventory input. */
export function hudViewModel(
  vitals: Vitals,
  hotbarSlots: readonly [InvalidCountCarriedSlot, ...InvalidCountCarriedSlot[]],
  selection: number | HudViewModelOptions,
): Result.Result<HudViewModel, InvalidHudSlotCountFailure>
export function hudViewModel(
  vitals: Vitals,
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot>,
  selection: number | HudViewModelOptions,
): HudViewModel
export function hudViewModel(
  vitals: Vitals,
  hotbarSlots: ReadonlyArray<InventoryCarriedSlot | InvalidCountCarriedSlot>,
  selection: number | HudViewModelOptions,
): HudViewModel | Result.Result<HudViewModel, InvalidHudSlotCountFailure> {
  if (!hasValidHotbarSlotCounts(hotbarSlots)) {
    return Result.fail({ _tag: 'InvalidSlotCount' })
  }
  return projectHudViewModel(vitals, hotbarSlots, selection)
}
