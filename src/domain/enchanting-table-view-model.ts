import { type SlotView, slotView } from './hud-view-model'

export const ENCHANTING_SLOT_IDS = ['item', 'lapis'] as const
export const ENCHANTING_OFFER_IDS = ['offer-1', 'offer-2', 'offer-3'] as const
export const ENCHANTING_OPERATION_TARGETS = [
  ...ENCHANTING_SLOT_IDS,
  ...ENCHANTING_OFFER_IDS,
] as const

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

const safeWhole = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0

const projectSlot = (
  id: EnchantingSlotId,
  index: number,
  snapshot: EnchantingSlotSnapshot | undefined,
): EnchantingSlotView =>
  Object.freeze({
    id,
    ...slotView(
      snapshot === undefined ? undefined : { ...snapshot, durability: snapshot.durability },
      index,
      -1,
    ),
  })

const projectOffer = (
  id: EnchantingOfferId,
  snapshot: EnchantingOfferSnapshot | undefined,
): EnchantingOfferView =>
  Object.freeze({
    enchantmentId: snapshot?.enchantmentId,
    enchantmentLevel: safeWhole(snapshot?.enchantmentLevel ?? 0),
    id,
    lapisCost: safeWhole(snapshot?.lapisCost ?? 0),
    levelCost: safeWhole(snapshot?.levelCost ?? 0),
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
      projectSlot('item', 0, snapshot.item),
      projectSlot('lapis', 1, snapshot.lapis),
    ]),
  })
