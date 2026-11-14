import { createCreativeInventoryView } from '../../../src/application/creative-inventory-view'
import { createRecipeBookView } from '../../../src/application/recipe-book-view'
import {
  CreativeSearchQuerySchema,
  creativeInventoryViewModel,
} from '../../../src/domain/creative-inventory-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from '../scenario-types'
import {
  createUi1CraftableInventory,
  createUi1RecipeBookModel,
  UI1_ITEM_SURFACE_SCENARIO_ID,
} from '../ui1-item-surface-fixture'

const noTime = (): void => undefined

const mountItemSurfaces = (context: ScenarioContext): ScenarioMount => {
  const recipeModel = createUi1RecipeBookModel(undefined, createUi1CraftableInventory())
  const creativeModel = creativeInventoryViewModel(CreativeSearchQuerySchema.make(''), 'all')
  context.host.style.setProperty('display', 'grid')
  context.host.style.setProperty('gap', '16px')
  context.host.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))')

  const recipeBook = createRecipeBookView(context.factory, context.host, {
    onPlaceRecipe: context.emitIntent,
  })
  recipeBook.render(recipeModel)

  createCreativeInventoryView(context.factory, context.host, {
    onTake: context.emitIntent,
  })

  return {
    dispose: () => {
      context.host.textContent = ''
    },
    root: context.host,
    setTime: noTime,
    viewModel: () => ({ creativeInventory: creativeModel, recipeBook: recipeModel }),
  }
}

export const UI1_ITEM_SURFACE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  {
    id: UI1_ITEM_SURFACE_SCENARIO_ID,
    isDefault: false,
    mount: mountItemSurfaces,
    screen: 'inventory',
    surface: 'Recipe book and Creative inventory',
    title: 'Recipe book and item catalog',
  },
]
