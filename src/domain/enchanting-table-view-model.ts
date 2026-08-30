import { type HotbarSlotSnapshot, type SlotView, slotView } from './hud-view-model.js'

export const ENCHANTING_SLOT_IDS = ['item', 'lapis'] as const
export const ENCHANTING_OFFER_IDS = ['offer-1', 'offer-2', 'offer-3'] as const
export const ENCHANTING_OPERATION_TARGETS: readonly [
  ...typeof ENCHANTING_SLOT_IDS,
  ...typeof ENCHANTING_OFFER_IDS,
] = [...ENCHANTING_SLOT_IDS, ...ENCHANTING_OFFER_IDS]

export type EnchantingSlotId = (typeof ENCHANTING_SLOT_IDS)[number]
export type EnchantingOfferId = (typeof ENCHANTING_OFFER_IDS)[number]
export type EnchantingOperationTarget = (typeof ENCHANTING_OPERATION_TARGETS)[number]

export type EnchantingSlotSnapshot = {
  readonly itemId: string
  readonly count: number
  readonly durability?: number
}

export type EnchantingOfferSnapshot = {
  readonly enchantmentId: string
  readonly enchantmentLevel: number
  readonly levelCost: number
  readonly lapisCost: number
  readonly rejectionReason: string | undefined
}

export type EnchantingTableSnapshot = {
  readonly item: EnchantingSlotSnapshot | undefined
  readonly lapis: EnchantingSlotSnapshot | undefined
  readonly offers: readonly [
    EnchantingOfferSnapshot | undefined,
    EnchantingOfferSnapshot | undefined,
    EnchantingOfferSnapshot | undefined,
  ]
}

export type EnchantingSlotView = SlotView & {
  readonly id: EnchantingSlotId
}

export type EnchantingOfferView = {
  readonly id: EnchantingOfferId
  readonly enchantmentId: string | undefined
  readonly enchantmentLevel: number
  readonly levelCost: number
  readonly lapisCost: number
  readonly rejectionReason: string | undefined
}

export type EnchantingTableViewModel = {
  readonly slots: ReadonlyArray<EnchantingSlotView>
  readonly offers: ReadonlyArray<EnchantingOfferView>
}

const ZERO = 0
/** Passed as `slotView`'s `selectedIndex` for a region with no cursor of its own. */
const NO_SELECTION = -1
const ITEM_INDEX = 0
const LAPIS_INDEX = 1

const safeWhole = (value: number): number => {
  if (Number.isFinite(value)) {
    return Math.max(ZERO, Math.trunc(value))
  }
  return ZERO
}

const toHotbarSlot = (
  snapshot: EnchantingSlotSnapshot | undefined,
): HotbarSlotSnapshot | undefined => {
  if (typeof snapshot === 'undefined') {
    return snapshot
  }
  return { ...snapshot, durability: snapshot.durability }
}

const projectSlot = (
  id: EnchantingSlotId,
  index: number,
  snapshot: EnchantingSlotSnapshot | undefined,
): EnchantingSlotView =>
  Object.freeze({
    id,
    ...slotView(toHotbarSlot(snapshot), index, NO_SELECTION),
  })

const projectOffer = (
  id: EnchantingOfferId,
  snapshot: EnchantingOfferSnapshot | undefined,
): EnchantingOfferView =>
  Object.freeze({
    enchantmentId: snapshot?.enchantmentId,
    enchantmentLevel: safeWhole(snapshot?.enchantmentLevel ?? ZERO),
    id,
    lapisCost: safeWhole(snapshot?.lapisCost ?? ZERO),
    levelCost: safeWhole(snapshot?.levelCost ?? ZERO),
    rejectionReason: snapshot?.rejectionReason,
  })

/** Purely derives the immutable presentation state for an enchanting table. */
export const enchantingTableViewModel = (
  snapshot: EnchantingTableSnapshot,
): EnchantingTableViewModel =>
  Object.freeze({
    offers: Object.freeze(
      ENCHANTING_OFFER_IDS.map((id, index) => projectOffer(id, snapshot.offers[index])),
    ),
    slots: Object.freeze([
      projectSlot('item', ITEM_INDEX, snapshot.item),
      projectSlot('lapis', LAPIS_INDEX, snapshot.lapis),
    ]),
  })
