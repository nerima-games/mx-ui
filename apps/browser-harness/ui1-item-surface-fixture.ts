import { type ItemType } from '@nerima-games/mc-kernel'
import { emptyInventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { recipeBookViewModel, type RecipeBookViewModel } from '../../src/domain/recipe-book-view-model.js'
import type { ItemIconResolver } from '../../src/domain/item-icon.js'

export const UI1_ITEM_SURFACE_SCENARIO_ID = 'ui1-item-surfaces'
export const UI1_ITEM_SURFACE_SCENARIO_REFERENCE: string = `inventory/${UI1_ITEM_SURFACE_SCENARIO_ID}`

export const createUi1RecipeBookModel = (recipeId?: string): RecipeBookViewModel => {
  const result = recipeBookViewModel(emptyInventory())
  if (Result.isFailure(result)) {
    throw new Error('Expected the kernel recipe table to produce a view model')
  }

  const selected = result.success.uncraftable.find(({ recipe, gridWidths }) =>
    (typeof recipeId === 'undefined' || recipe.id === recipeId) && gridWidths.includes(2) && gridWidths.includes(3),
  )
  if (typeof selected === 'undefined') {
    throw new Error('Expected the selected recipe to fit both crafting grid sizes')
  }
  return {
    craftable: [selected],
    uncraftable: result.success.uncraftable.filter(({ recipe }) => recipe.id !== selected.recipe.id),
  }
}

export const createUi1ItemIconResolver = (iconUrl: string): ItemIconResolver =>
  (itemId: ItemType) => itemId === 'apple'
    ? Result.succeed({ kind: 'url', url: iconUrl })
    : Result.fail({ _tag: 'ItemIconUnavailable' })
