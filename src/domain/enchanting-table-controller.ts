import { Result } from 'effect'
import {
  generateEnchantmentTableOffers,
  itemStack,
  type EnchantmentTableFailure,
  type EnchantmentTableOffer,
  type EnchantmentTableOffers,
  type EnchantmentTableRandom,
  type ItemStackFailure,
} from '@nerima-games/mc-sim'
import type { ItemType } from '@nerima-games/mc-kernel'
import {
  ENCHANTING_OFFER_IDS,
  type EnchantingOfferId,
  type EnchantingOfferSnapshot,
  type EnchantingTableSnapshot,
} from './enchanting-table-view-model.js'

export type EnchantableItem = {
  readonly itemId: ItemType
  readonly count: number
  readonly durability?: number
}

export type EnchantingSeedFailure = {
  readonly _tag: 'EnchantingSeedFailure'
  readonly reason: 'expected-unsigned-32-bit-integer'
  readonly seed: number
}

export type EnchantingOfferProjectionFailure = {
  readonly _tag: 'EnchantingOfferProjectionFailure'
  readonly offerId: EnchantingOfferId
  readonly offer: EnchantmentTableOffer
}

export type EnchantingOffersFailure =
  | ItemStackFailure
  | EnchantmentTableFailure
  | EnchantingSeedFailure
  | EnchantingOfferProjectionFailure

export type EnchantingApplyFailure = {
  readonly _tag: 'EnchantingApplyUnsupported'
  readonly offerId: EnchantingOfferId
  readonly reason: 'mc-sim plan-fragment API is not available'
}

export type EnchantingTableState = {
  readonly item: EnchantableItem | undefined
  readonly lapisCount: number
  readonly experienceLevel: number
  readonly bookshelfCount: number
  readonly seed: number
}

const ZERO = 0
const TWO = 2

const UINT32_BIT_WIDTH = 32
/** 2**32, the wraparound modulus `>>> 0` produces; used to reimplement it without a bitwise op. */
const UINT32_MODULUS = TWO ** UINT32_BIT_WIDTH
const LCG_MULTIPLIER = 1_664_525
const LCG_INCREMENT = 1_013_904_223

/**
 * `x >>> 0` without the bitwise operator: the same wrap into `[0, 2**32)`,
 * done with modulo arithmetic instead of a shift.
 */
const toUint32 = (value: number): number => ((value % UINT32_MODULUS) + UINT32_MODULUS) % UINT32_MODULUS

/** Advances the persisted seed for the simulation's deterministic random adapter. */
const nextSeed = (seed: number): number => toUint32(Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT)

const randomOfSeed = (
  seed: number,
): Result.Result<EnchantmentTableRandom, EnchantingSeedFailure> => {
  if (!Number.isSafeInteger(seed) || seed < ZERO || seed >= UINT32_MODULUS) {
    return Result.fail({
      _tag: 'EnchantingSeedFailure',
      reason: 'expected-unsigned-32-bit-integer',
      seed,
    })
  }
  let currentSeed = seed
  const nextRandom = (): number => {
    currentSeed = nextSeed(currentSeed)
    return currentSeed
  }
  return Result.succeed({
    nextInt: (bound) => nextRandom() % bound,
    nextFloat: () => nextRandom() / UINT32_MODULUS,
  })
}

/** The current view-model only stores one enchantment per offer. */
const snapshotOfferOf = (
  offer: EnchantmentTableOffers[number],
  offerId: EnchantingOfferId,
): Result.Result<EnchantingOfferSnapshot | undefined, EnchantingOfferProjectionFailure> => {
  if (typeof offer === 'undefined') {
    return Result.succeed(undefined)
  }
  const [enchantment, ...additionalEnchantments] = offer.enchantments
  if (typeof enchantment === 'undefined') {
    return Result.succeed(undefined)
  }
  if (additionalEnchantments.length > ZERO) {
    return Result.fail({ _tag: 'EnchantingOfferProjectionFailure', offerId, offer })
  }
  return Result.succeed({
    enchantmentId: enchantment.id,
    enchantmentLevel: enchantment.level,
    lapisCost: offer.lapisCost,
    levelCost: offer.levelCost,
    rejectionReason: 'mc-sim plan-fragment API is not available',
  })
}

const snapshotOffersOf = (
  offers: EnchantmentTableOffers,
): Result.Result<EnchantingTableSnapshot['offers'], EnchantingOfferProjectionFailure> => {
  const first = snapshotOfferOf(offers[0], ENCHANTING_OFFER_IDS[0])
  if (Result.isFailure(first)) {
    return Result.fail(first.failure)
  }
  const second = snapshotOfferOf(offers[1], ENCHANTING_OFFER_IDS[1])
  if (Result.isFailure(second)) {
    return Result.fail(second.failure)
  }
  const third = snapshotOfferOf(offers[2], ENCHANTING_OFFER_IDS[2])
  if (Result.isFailure(third)) {
    return Result.fail(third.failure)
  }
  const projectedOffers: EnchantingTableSnapshot['offers'] = [
    first.success,
    second.success,
    third.success,
  ]
  return Result.succeed(projectedOffers)
}

export const enchantingOffers = (
  state: EnchantingTableState,
): Result.Result<EnchantingTableSnapshot['offers'], EnchantingOffersFailure> => {
  if (typeof state.item === 'undefined') {
    return Result.succeed([undefined, undefined, undefined])
  }
  const stack = itemStack(state.item.itemId, state.item.count)
  if (Result.isFailure(stack)) {
    return Result.fail(stack.failure)
  }
  const random = randomOfSeed(state.seed)
  if (Result.isFailure(random)) {
    return Result.fail(random.failure)
  }
  const generated = generateEnchantmentTableOffers({
    item: stack.success.item,
    bookshelfCount: state.bookshelfCount,
    random: random.success,
  })
  if (Result.isFailure(generated)) {
    return Result.fail(generated.failure)
  }
  const offers = snapshotOffersOf(generated.success)
  if (Result.isFailure(offers)) {
    return Result.fail(offers.failure)
  }
  return Result.succeed(offers.success)
}

/** The lapis slot, or nothing — an empty table has no lapis to show. */
const lapisSlot = (state: EnchantingTableState): EnchantingTableSnapshot['lapis'] => {
  if (state.lapisCount > ZERO) {
    return { count: state.lapisCount, itemId: 'minecraft:lapis_lazuli' }
  }
  return
}

export const enchantingTableSnapshotOf = (
  state: EnchantingTableState,
): Result.Result<EnchantingTableSnapshot, EnchantingOffersFailure> => {
  const offers = enchantingOffers(state)
  if (Result.isFailure(offers)) {
    return Result.fail(offers.failure)
  }
  return Result.succeed({
    item: state.item,
    lapis: lapisSlot(state),
    offers: offers.success,
  })
}

/** Rejects local application until mc-sim exposes its plan-fragment API. */
export const applyEnchantmentOffer = (
  _state: EnchantingTableState,
  offerId: EnchantingOfferId,
): Result.Result<never, EnchantingApplyFailure> =>
  Result.fail({
    _tag: 'EnchantingApplyUnsupported',
    offerId,
    reason: 'mc-sim plan-fragment API is not available',
  })
