import {
  type CraftingIngredient,
  type ItemType,
  type Recipe,
  type RecipeFailure,
  type RecipeId,
  VANILLA_CRAFTING_RECIPES,
  ingredientMatches,
} from '@nerima-games/mc-kernel'
import type { Inventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'

const FIRST_INDEX = 0
const NEXT_INDEX = 1
const NO_ITEMS = 0
const GRID_WIDTH_TWO = 2
const GRID_WIDTH_THREE = 3
const GRID_TWO_CAPACITY = GRID_WIDTH_TWO * GRID_WIDTH_TWO
const GRID_THREE_CAPACITY = GRID_WIDTH_THREE * GRID_WIDTH_THREE

export type RecipeGridWidth = typeof GRID_WIDTH_TWO | typeof GRID_WIDTH_THREE

export type RecipeBookEntry = Readonly<{
  readonly recipe: Recipe
  readonly gridWidths: ReadonlyArray<RecipeGridWidth>
}>

export type RecipeBookViewModel = Readonly<{
  readonly craftable: ReadonlyArray<RecipeBookEntry>
  readonly uncraftable: ReadonlyArray<RecipeBookEntry>
}>

export type RecipeBookViewModelFailure = Readonly<{
  readonly _tag: 'RecipeIngredientMatchFailure'
  readonly recipeId: RecipeId
  readonly ingredient: CraftingIngredient
  readonly failure: RecipeFailure
}>

export type RecipePlacementOperation = Readonly<{
  readonly kind: 'place-recipe'
  readonly recipeId: RecipeId
  readonly gridWidth: RecipeGridWidth
}>

export type RecipePlacementFailure =
  | Readonly<{ readonly _tag: 'InvalidGridWidth'; readonly gridWidth: unknown }>
  | Readonly<{ readonly _tag: 'RecipeDoesNotFitGrid'; readonly recipeId: RecipeId; readonly gridWidth: RecipeGridWidth }>

const ingredientsOf = (recipe: Recipe): ReadonlyArray<CraftingIngredient> => {
  if (recipe['_tag'] === 'Shapeless') {
    return recipe.ingredients
  }
  return recipe.pattern.cells.filter(
    (ingredient): ingredient is CraftingIngredient => typeof ingredient !== 'undefined',
  )
}

const gridWidthsOf = (recipe: Recipe): ReadonlyArray<RecipeGridWidth> => {
  if (recipe['_tag'] === 'Shaped') {
    const fitsTwo = recipe.pattern.width <= GRID_WIDTH_TWO && recipe.pattern.height <= GRID_WIDTH_TWO
    if (fitsTwo) {
      return [GRID_WIDTH_TWO, GRID_WIDTH_THREE]
    }
    return [GRID_WIDTH_THREE]
  }
  if (recipe.ingredients.length <= GRID_TWO_CAPACITY) {
    return [GRID_WIDTH_TWO, GRID_WIDTH_THREE]
  }
  if (recipe.ingredients.length <= GRID_THREE_CAPACITY) {
    return [GRID_WIDTH_THREE]
  }
  return []
}

const inventoryCountsOf = (inventory: Inventory): Map<ItemType, number> => {
  const counts = new Map<ItemType, number>()
  for (const stack of inventory.slots) {
    if (typeof stack !== 'undefined') {
      counts.set(stack.item, (counts.get(stack.item) ?? NO_ITEMS) + stack.count)
    }
  }
  return counts
}

type IngredientDemand = Readonly<{
  readonly count: number
  readonly itemTypes: ReadonlyArray<ItemType>
}>

const allocationStateKey = (
  index: number,
  itemTypes: ReadonlyArray<ItemType>,
  counts: ReadonlyMap<ItemType, number>,
): string => `${index}:${itemTypes.map((itemType) => counts.get(itemType) ?? NO_ITEMS).join(',')}`

type AllocationState = Readonly<{
  readonly orderedDemands: ReadonlyArray<IngredientDemand>
  readonly counts: Map<ItemType, number>
  readonly itemTypes: ReadonlyArray<ItemType>
  readonly failedStates: Set<string>
}>

type ContinueAllocation = (index: number) => boolean

type AllocationAttempt = Readonly<{
  readonly state: AllocationState
  readonly demand: IngredientDemand
  readonly itemType: ItemType
  readonly nextIndex: number
  readonly continueAllocation: ContinueAllocation
}>

const tryDemandAllocation = ({ state, demand, itemType, nextIndex, continueAllocation }: AllocationAttempt): boolean => {
  const available = state.counts.get(itemType) ?? NO_ITEMS
  if (available < demand.count) {
    return false
  }
  state.counts.set(itemType, available - demand.count)
  const allocated = continueAllocation(nextIndex)
  state.counts.set(itemType, available)
  return allocated
}

type AllocateDemandInput = Readonly<{
  readonly state: AllocationState
  readonly demand: IngredientDemand
  readonly nextIndex: number
  readonly continueAllocation: ContinueAllocation
}>

const allocateDemand = ({ state, demand, nextIndex, continueAllocation }: AllocateDemandInput): boolean => {
  for (const itemType of demand.itemTypes) {
    const allocated = tryDemandAllocation({ continueAllocation, demand, itemType, nextIndex, state })
    if (allocated) {
      return true
    }
  }
  return false
}

type AllocationStep = Readonly<{
  readonly state: AllocationState
  readonly index: number
  readonly continueAllocation: ContinueAllocation
}>

type AllocationStepStatus =
  | Readonly<{ readonly tag: 'finished'; readonly result: boolean }>
  | Readonly<{ readonly tag: 'pending'; readonly stateKey: string; readonly demand: IngredientDemand }>

const allocationStepStatus = (state: AllocationState, index: number): AllocationStepStatus => {
  if (index === state.orderedDemands.length) {
    return { result: true, tag: 'finished' }
  }
  const stateKey = allocationStateKey(index, state.itemTypes, state.counts)
  if (state.failedStates.has(stateKey)) {
    return { result: false, tag: 'finished' }
  }
  const demand = state.orderedDemands[index]
  if (typeof demand === 'undefined') {
    return { result: true, tag: 'finished' }
  }
  return { demand, stateKey, tag: 'pending' }
}

const allocationFailureOf = (state: AllocationState, stateKey: string): false => {
  state.failedStates.add(stateKey)
  return false
}

const allocateAt = ({ state, index, continueAllocation }: AllocationStep): boolean => {
  const status = allocationStepStatus(state, index)
  if (status.tag === 'finished') {
    return status.result
  }
  const allocated = allocateDemand({ continueAllocation, demand: status.demand, nextIndex: index + NEXT_INDEX, state })
  if (allocated) {
    return true
  }
  return allocationFailureOf(state, status.stateKey)
}

const allocationSearchOf = (state: AllocationState): ContinueAllocation => {
  const continueAllocation: ContinueAllocation = (index) => allocateAt({ continueAllocation, index, state })
  return continueAllocation
}

const allocateDemands = (demands: ReadonlyArray<IngredientDemand>, counts: Map<ItemType, number>): boolean => {
  const orderedDemands = [...demands].sort((left, right) =>
    left.itemTypes.length - right.itemTypes.length || right.count - left.count,
  )
  const state: AllocationState = {
    counts,
    failedStates: new Set<string>(),
    itemTypes: [...counts.keys()].sort(),
    orderedDemands,
  }
  return allocationSearchOf(state)(FIRST_INDEX)
}

const matchesForIngredient = (
  recipe: Recipe,
  ingredient: CraftingIngredient,
  itemType: ItemType,
): Result.Result<boolean, RecipeBookViewModelFailure> => {
  const match = ingredientMatches(ingredient, itemType)
  if (Result.isFailure(match)) {
    return Result.fail({
      _tag: 'RecipeIngredientMatchFailure',
      failure: match.failure,
      ingredient,
      recipeId: recipe.id,
    })
  }
  return Result.succeed(match.success)
}

const matchingItemTypesOf = (
  recipe: Recipe,
  ingredient: CraftingIngredient,
  itemTypes: Iterable<ItemType>,
): Result.Result<ReadonlyArray<ItemType>, RecipeBookViewModelFailure> => {
  const matches: ItemType[] = []
  for (const itemType of itemTypes) {
    const match = matchesForIngredient(recipe, ingredient, itemType)
    if (Result.isFailure(match)) {
      return Result.fail(match.failure)
    }
    if (match.success) {
      matches.push(itemType)
    }
  }
  return Result.succeed(matches)
}

const demandsOf = (
  recipe: Recipe,
  inventoryCounts: ReadonlyMap<ItemType, number>,
): Result.Result<ReadonlyArray<IngredientDemand>, RecipeBookViewModelFailure> => {
  const demands: IngredientDemand[] = []
  for (const ingredient of ingredientsOf(recipe)) {
    const itemTypes = matchingItemTypesOf(recipe, ingredient, inventoryCounts.keys())
    if (Result.isFailure(itemTypes)) {
      return Result.fail(itemTypes.failure)
    }
    demands.push({ count: ingredient.count, itemTypes: itemTypes.success })
  }
  return Result.succeed(demands)
}

export const recipeCraftableInInventory = (
  recipe: Recipe,
  inventory: Inventory,
): Result.Result<boolean, RecipeBookViewModelFailure> => {
  const inventoryCounts = inventoryCountsOf(inventory)
  const demands = demandsOf(recipe, inventoryCounts)
  if (Result.isFailure(demands)) {
    return Result.fail(demands.failure)
  }
  return Result.succeed(allocateDemands(demands.success, inventoryCounts))
}

type RecipePartitions = Readonly<{
  readonly craftable: RecipeBookEntry[]
  readonly uncraftable: RecipeBookEntry[]
}>

const appendClassifiedRecipe = (
  partitions: RecipePartitions,
  recipe: Recipe,
  inventory: Inventory,
): Result.Result<RecipeBookEntry, RecipeBookViewModelFailure> => {
  const craftable = recipeCraftableInInventory(recipe, inventory)
  if (Result.isFailure(craftable)) {
    return Result.fail(craftable.failure)
  }
  const entry: RecipeBookEntry = { gridWidths: gridWidthsOf(recipe), recipe }
  if (craftable.success) {
    partitions.craftable.push(entry)
  } else {
    partitions.uncraftable.push(entry)
  }
  return Result.succeed(entry)
}

const recipePartitionsOf = (inventory: Inventory): Result.Result<RecipePartitions, RecipeBookViewModelFailure> => {
  const partitions: RecipePartitions = { craftable: [], uncraftable: [] }
  for (const recipe of VANILLA_CRAFTING_RECIPES) {
    const appended = appendClassifiedRecipe(partitions, recipe, inventory)
    if (Result.isFailure(appended)) {
      return Result.fail(appended.failure)
    }
  }
  return Result.succeed(partitions)
}

export const recipeBookViewModel = (
  inventory: Inventory,
): Result.Result<RecipeBookViewModel, RecipeBookViewModelFailure> => recipePartitionsOf(inventory)

export const recipePlacementOperationOf = (
  recipe: Recipe,
  gridWidth: unknown,
): Result.Result<RecipePlacementOperation, RecipePlacementFailure> => {
  if (gridWidth !== GRID_WIDTH_TWO && gridWidth !== GRID_WIDTH_THREE) {
    return Result.fail({ _tag: 'InvalidGridWidth', gridWidth })
  }
  const typedGridWidth: RecipeGridWidth = gridWidth
  if (!gridWidthsOf(recipe).includes(typedGridWidth)) {
    return Result.fail({ _tag: 'RecipeDoesNotFitGrid', gridWidth: typedGridWidth, recipeId: recipe.id })
  }
  return Result.succeed({ gridWidth: typedGridWidth, kind: 'place-recipe', recipeId: recipe.id })
}
