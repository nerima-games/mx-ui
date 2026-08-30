import type {
  EnchantingOfferId,
  EnchantingOfferSnapshot,
  EnchantingTableSnapshot,
} from './enchanting-table-view-model.js'

export type ItemEnchantment = {
  readonly enchantmentId: string
  readonly level: number
}

export type EnchantableItem = {
  readonly itemId: string
  readonly count: number
  readonly durability?: number
  readonly enchantments: ReadonlyArray<ItemEnchantment>
}

export type EnchantmentDefinition = {
  readonly enchantmentId: string
  readonly allowedItemIds: ReadonlyArray<string>
  readonly incompatibleWith: ReadonlyArray<string>
  readonly maxLevel: number
  readonly levelCost: number
}

export type EnchantingRules = {
  readonly enchantments: ReadonlyArray<EnchantmentDefinition>
}

export type EnchantingTableState = {
  readonly item: EnchantableItem | undefined
  readonly lapisCount: number
  readonly experienceLevel: number
  readonly seed: number
}

export type EnchantResult = {
  readonly state: EnchantingTableState
  readonly applied: boolean
  readonly reason?: string
}

const OFFER_INDEX: Readonly<Record<EnchantingOfferId, number>> = {
  'offer-1': 0,
  'offer-2': 1,
  'offer-3': 2,
}

const ZERO = 0
const ONE = 1
const TWO = 2
/** How many offers the table shows at once — see `OFFER_INDEX` above. */
const OFFER_COUNT = 3

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

/**
 * `Math.imul` already does `ToInt32` on both of its arguments per spec, so the
 * `seed | 0` the bitwise-free version of this file used to need is redundant
 * — the multiply is exactly as 32-bit as it always was.
 */
const nextSeed = (seed: number): number => toUint32(Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT)

const availableDefinitions = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): ReadonlyArray<EnchantmentDefinition> => {
  const { item } = state
  if (typeof item === 'undefined') {
    return []
  }
  // `item` is bound to a const above, so its narrowed (non-undefined) type survives into the filter callback below — unlike `state.item`, whose narrowing TypeScript cannot carry across a closure boundary.
  // That is what let the previous `state.item?.` fallbacks look reachable to the coverage tool even though every caller has already been turned away by the guard above.
  const existing = new Set(item.enchantments.map(({ enchantmentId }) => enchantmentId))
  return rules.enchantments.filter(
    (definition) =>
      definition.allowedItemIds.includes(item.itemId) &&
      !existing.has(definition.enchantmentId) &&
      definition.incompatibleWith.every((id) => !existing.has(id)) &&
      item.enchantments.every(({ enchantmentId }) => {
        const existingDefinition = rules.enchantments.find(
          (candidate) => candidate.enchantmentId === enchantmentId,
        )
        return existingDefinition?.incompatibleWith.includes(definition.enchantmentId) !== true
      }),
  )
}

/** One draw from the shrinking pool, or nothing left to draw. */
const drawOffer = (
  pool: Array<EnchantmentDefinition>,
  random: number,
): EnchantmentDefinition | undefined => {
  if (pool.length === ZERO) {
    return
  }
  const poolIndex = random % pool.length
  const [drawn] = pool.splice(poolIndex, ONE)
  return drawn
}

const offerDefinitions = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): ReadonlyArray<EnchantmentDefinition | undefined> => {
  const pool = [...availableDefinitions(state, rules)]
  let random = toUint32(state.seed)
  const selected: Array<EnchantmentDefinition | undefined> = []
  for (let index = 0; index < OFFER_COUNT; index += ONE) {
    random = nextSeed(random)
    selected.push(drawOffer(pool, random))
  }
  return selected
}

/** Why this offer can't be taken right now, or nothing — it is affordable. */
const offerRejectionReason = (
  state: EnchantingTableState,
  lapisCost: number,
  levelCost: number,
): string | undefined => {
  if (state.lapisCount < lapisCost) {
    return `Requires ${String(lapisCost)} lapis`
  }
  if (state.experienceLevel < levelCost) {
    return `Requires ${String(levelCost)} levels`
  }
  return
}

const offerOf = (
  definition: EnchantmentDefinition | undefined,
  index: number,
  state: EnchantingTableState,
): EnchantingOfferSnapshot | undefined => {
  if (typeof definition === 'undefined') {
    return
  }
  const lapisCost = index + ONE
  const levelCost = Math.max(lapisCost, Math.trunc(definition.levelCost))
  const rejectionReason = offerRejectionReason(state, lapisCost, levelCost)
  return {
    enchantmentId: definition.enchantmentId,
    enchantmentLevel: Math.max(ONE, Math.min(Math.trunc(definition.maxLevel), index + ONE)),
    lapisCost,
    levelCost,
    rejectionReason,
  }
}

export const enchantingOffers = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): EnchantingTableSnapshot['offers'] => {
  const definitions = offerDefinitions(state, rules)
  return [
    offerOf(definitions[ZERO], ZERO, state),
    offerOf(definitions[ONE], ONE, state),
    offerOf(definitions[TWO], TWO, state),
  ]
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
  rules: EnchantingRules,
): EnchantingTableSnapshot => ({
  item: state.item,
  lapis: lapisSlot(state),
  offers: enchantingOffers(state, rules),
})

/** Applies one currently displayed offer atomically; every rejection preserves state identity. */
export const applyEnchantmentOffer = (
  state: EnchantingTableState,
  offerId: EnchantingOfferId,
  rules: EnchantingRules,
): EnchantResult => {
  const index = OFFER_INDEX[offerId]
  const offer = enchantingOffers(state, rules)[index]
  if (typeof state.item === 'undefined' || typeof offer === 'undefined') {
    return { applied: false, reason: 'No compatible enchantment', state }
  }
  if (typeof offer.rejectionReason !== 'undefined') {
    return { applied: false, reason: offer.rejectionReason, state }
  }
  return {
    applied: true,
    state: {
      ...state,
      experienceLevel: state.experienceLevel - offer.levelCost,
      item: {
        ...state.item,
        enchantments: [
          ...state.item.enchantments,
          { enchantmentId: offer.enchantmentId, level: offer.enchantmentLevel },
        ],
      },
      lapisCount: state.lapisCount - offer.lapisCost,
      seed: nextSeed(state.seed),
    },
  }
}
