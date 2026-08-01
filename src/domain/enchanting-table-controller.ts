import type {
  EnchantingOfferId,
  EnchantingOfferSnapshot,
  EnchantingTableSnapshot,
} from './enchanting-table-view-model'

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
  readonly reason: string | undefined
}

const OFFER_INDEX: Readonly<Record<EnchantingOfferId, number>> = {
  'offer-1': 0,
  'offer-2': 1,
  'offer-3': 2,
}

const nextSeed = (seed: number): number => (Math.imul(seed | 0, 1_664_525) + 1_013_904_223) >>> 0

const availableDefinitions = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): ReadonlyArray<EnchantmentDefinition> => {
  if (state.item === undefined) {
    return []
  }
  const existing = new Set(state.item.enchantments.map(({ enchantmentId }) => enchantmentId))
  return rules.enchantments.filter(
    (definition) =>
      definition.allowedItemIds.includes(state.item?.itemId ?? '') &&
      !existing.has(definition.enchantmentId) &&
      definition.incompatibleWith.every((id) => !existing.has(id)) &&
      state.item?.enchantments.every(({ enchantmentId }) => {
        const existingDefinition = rules.enchantments.find(
          (candidate) => candidate.enchantmentId === enchantmentId,
        )
        return existingDefinition?.incompatibleWith.includes(definition.enchantmentId) !== true
      }) === true,
  )
}

const offerDefinitions = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): ReadonlyArray<EnchantmentDefinition | undefined> => {
  const pool = [...availableDefinitions(state, rules)]
  let random = state.seed >>> 0
  const selected: Array<EnchantmentDefinition | undefined> = []
  for (let index = 0; index < 3; index += 1) {
    random = nextSeed(random)
    if (pool.length === 0) {
      selected.push(undefined)
      continue
    }
    const poolIndex = random % pool.length
    selected.push(pool.splice(poolIndex, 1)[0])
  }
  return selected
}

const offerOf = (
  definition: EnchantmentDefinition | undefined,
  index: number,
  state: EnchantingTableState,
): EnchantingOfferSnapshot | undefined => {
  if (definition === undefined) {
    return undefined
  }
  const lapisCost = index + 1
  const levelCost = Math.max(lapisCost, Math.trunc(definition.levelCost))
  const rejectionReason =
    state.lapisCount < lapisCost
      ? `Requires ${String(lapisCost)} lapis`
      : state.experienceLevel < levelCost
        ? `Requires ${String(levelCost)} levels`
        : undefined
  return {
    enchantmentId: definition.enchantmentId,
    enchantmentLevel: Math.max(1, Math.min(Math.trunc(definition.maxLevel), index + 1)),
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
    offerOf(definitions[0], 0, state),
    offerOf(definitions[1], 1, state),
    offerOf(definitions[2], 2, state),
  ]
}

export const enchantingTableSnapshotOf = (
  state: EnchantingTableState,
  rules: EnchantingRules,
): EnchantingTableSnapshot => ({
  item: state.item,
  lapis:
    state.lapisCount > 0
      ? { count: state.lapisCount, itemId: 'minecraft:lapis_lazuli' }
      : undefined,
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
  if (state.item === undefined || offer === undefined) {
    return { applied: false, reason: 'No compatible enchantment', state }
  }
  if (offer.rejectionReason !== undefined) {
    return { applied: false, reason: offer.rejectionReason, state }
  }
  return {
    applied: true,
    reason: undefined,
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
