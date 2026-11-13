import { Result } from 'effect'
import { type HotbarSlotSnapshot, type SlotView, slotView } from './hud-view-model.js'
import type { ItemDisplayNameOptions } from './item-display-name.js'

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
  readonly rejectionReason?: string | undefined
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

type EnchantingOfferNumericField = 'enchantmentLevel' | 'lapisCost' | 'levelCost'

export type EnchantingTableViewModelFailure =
  | { readonly _tag: 'InvalidEnchantingTableSnapshot' }
  | { readonly _tag: 'NullEnchantingOffer'; readonly offerId: EnchantingOfferId }
  | {
      readonly _tag: 'NullEnchantingOfferValue'
      readonly field: EnchantingOfferNumericField
      readonly offerId: EnchantingOfferId
    }

const ZERO = 0
/** Passed as `slotView`'s `selectedIndex` for a region with no cursor of its own. */
const NO_SELECTION = -1
const ITEM_INDEX = 0
const LAPIS_INDEX = 1
const ENCHANTING_OFFER_NUMERIC_FIELDS: ReadonlyArray<EnchantingOfferNumericField> = [
  'enchantmentLevel',
  'lapisCost',
  'levelCost',
]

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const isSlotSnapshot = (input: unknown): input is EnchantingSlotSnapshot | undefined => {
  if (typeof input === 'undefined') {
    return true
  }
  if (!isRecord(input)) {
    return false
  }
  return typeof input['itemId'] === 'string' &&
    typeof input['count'] === 'number' &&
    (typeof input['durability'] === 'undefined' || typeof input['durability'] === 'number')
}

const isEnchantingOfferSnapshot = (input: unknown): input is EnchantingOfferSnapshot | undefined => {
  if (typeof input === 'undefined') {
    return true
  }
  if (!isRecord(input)) {
    return false
  }
  return typeof input['enchantmentId'] === 'string' &&
    typeof input['enchantmentLevel'] === 'number' &&
    typeof input['lapisCost'] === 'number' &&
    typeof input['levelCost'] === 'number' &&
    (typeof input['rejectionReason'] === 'undefined' || typeof input['rejectionReason'] === 'string')
}

const isEnchantingTableSnapshot = (input: unknown): input is EnchantingTableSnapshot => {
  if (!isRecord(input) || !isSlotSnapshot(input['item']) || !isSlotSnapshot(input['lapis'])) {
    return false
  }
  const offers = input['offers']
  return Array.isArray(offers) &&
    offers.length === ENCHANTING_OFFER_IDS.length &&
    offers.every(isEnchantingOfferSnapshot)
}

const nullOfferFailure = (
  snapshot: unknown,
): EnchantingTableViewModelFailure | undefined => {
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot['offers']) ||
    snapshot['offers'].length !== ENCHANTING_OFFER_IDS.length
  ) {
    return
  }
  for (const [index, offerId] of ENCHANTING_OFFER_IDS.entries()) {
    const offer: unknown = snapshot['offers'][index]
    if (offer === null) {
      return { _tag: 'NullEnchantingOffer', offerId }
    }
    if (isRecord(offer)) {
      for (const field of ENCHANTING_OFFER_NUMERIC_FIELDS) {
        if (offer[field] === null) {
          return { _tag: 'NullEnchantingOfferValue', field, offerId }
        }
      }
    }
  }
  return undefined
}

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
  { snapshot, itemDisplayNameOptions }: Readonly<{
    snapshot: EnchantingSlotSnapshot | undefined
    itemDisplayNameOptions?: ItemDisplayNameOptions | undefined
  }>,
): EnchantingSlotView =>
  Object.freeze({
    id,
    ...slotView(toHotbarSlot(snapshot), index, { itemDisplayNameOptions, selectedIndex: NO_SELECTION }),
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

const projectEnchantingTableViewModel = (
  snapshot: EnchantingTableSnapshot,
  itemDisplayNameOptions?: ItemDisplayNameOptions,
): EnchantingTableViewModel => Object.freeze({
    offers: Object.freeze(
      ENCHANTING_OFFER_IDS.map((id, index) => projectOffer(id, snapshot.offers[index])),
    ),
    slots: Object.freeze([
      projectSlot('item', ITEM_INDEX, { itemDisplayNameOptions, snapshot: snapshot.item }),
      projectSlot('lapis', LAPIS_INDEX, { itemDisplayNameOptions, snapshot: snapshot.lapis }),
    ]),
  })

/** Purely derives the immutable presentation state for an enchanting table. */
export function enchantingTableViewModel(
  snapshot: EnchantingTableSnapshot,
  itemDisplayNameOptions?: ItemDisplayNameOptions,
): EnchantingTableViewModel
export function enchantingTableViewModel(
  snapshot: unknown,
  itemDisplayNameOptions?: ItemDisplayNameOptions,
): Result.Result<EnchantingTableViewModel, EnchantingTableViewModelFailure>
export function enchantingTableViewModel(
  snapshot: unknown,
  itemDisplayNameOptions?: ItemDisplayNameOptions,
): EnchantingTableViewModel | Result.Result<EnchantingTableViewModel, EnchantingTableViewModelFailure> {
  const nullFailure = nullOfferFailure(snapshot)
  if (typeof nullFailure !== 'undefined') {
    return Result.fail(nullFailure)
  }
  if (!isEnchantingTableSnapshot(snapshot)) {
    return Result.fail({ _tag: 'InvalidEnchantingTableSnapshot' })
  }
  return projectEnchantingTableViewModel(snapshot, itemDisplayNameOptions)
}
