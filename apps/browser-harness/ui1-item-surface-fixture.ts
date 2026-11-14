import { ITEM_TYPES, type ItemType } from '@nerima-games/mc-kernel'
import { emptyInventory, itemStack, type Inventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { recipeBookViewModel, type RecipeBookViewModel } from '../../src/domain/recipe-book-view-model.js'
import type { ItemIconResolver } from '../../src/domain/item-icon.js'

export const UI1_ITEM_SURFACE_SCENARIO_ID = 'ui1-item-surfaces'
export const UI1_ITEM_SURFACE_SCENARIO_REFERENCE: string = `inventory/${UI1_ITEM_SURFACE_SCENARIO_ID}`

export const createUi1CraftableInventory = (): Inventory => {
  const bone = ITEM_TYPES.find((itemId) => itemId === 'bone')
  if (typeof bone === 'undefined') {
    throw new Error('Expected bone in the kernel item catalog')
  }
  const stack = itemStack(bone, 1)
  if (Result.isFailure(stack)) {
    throw new Error('Expected a valid UI1 bone inventory stack')
  }
  return { slots: [stack.success] }
}

export const createUi1RecipeBookModel = (
  recipeId?: string,
  inventory: Inventory = emptyInventory(),
): RecipeBookViewModel => {
  const result = recipeBookViewModel(inventory)
  if (Result.isFailure(result)) {
    throw new Error('Expected the kernel recipe table to produce a view model')
  }

  const selected = [...result.success.craftable, ...result.success.uncraftable].find(({ recipe, gridWidths }) =>
    (typeof recipeId === 'undefined' || recipe.id === recipeId) && gridWidths.includes(2) && gridWidths.includes(3),
  )
  if (typeof selected === 'undefined') {
    throw new Error('Expected the selected recipe to fit both crafting grid sizes')
  }
  const selectedIsCraftable = result.success.craftable.some(({ recipe }) => recipe.id === selected.recipe.id)
  return {
    craftable: selectedIsCraftable ? [selected] : [],
    uncraftable: selectedIsCraftable ? [] : [selected],
  }
}

export const createUi1ItemIconResolver = (iconUrl: string): ItemIconResolver =>
  (itemId: ItemType) => itemId === 'apple'
    ? Result.succeed({ kind: 'url', url: iconUrl })
    : Result.fail({ _tag: 'ItemIconUnavailable' })
