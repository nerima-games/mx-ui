import { ITEM_DISPLAY_NAMES } from '@nerima-games/mc-kernel'
import { emptyInventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createRecipeBookView } from '../src/application/recipe-book-view'
import { recipeBookViewModel } from '../src/domain/recipe-book-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

describe('recipe book view', () => {
  it('shows both craftability sections and emits a typed grid placement intent', () => {
    const modelResult = recipeBookViewModel(emptyInventory())
    expect(Result.isSuccess(modelResult)).toBe(true)
    if (Result.isFailure(modelResult)) {
      return
    }
    const selected = modelResult.success.uncraftable.find(({ gridWidths }) => gridWidths.length > 0)
    expect(selected).toBeDefined()
    if (typeof selected === 'undefined') {
      return
    }
    const [gridWidth] = selected.gridWidths
    if (typeof gridWidth === 'undefined') {
      return
    }
    const viewModel = {
      craftable: [selected],
      uncraftable: modelResult.success.uncraftable.filter(({ recipe }) => recipe.id !== selected.recipe.id),
    }
    const placements: Array<Readonly<{ kind: 'place-recipe'; recipeId: string; gridWidth: 2 | 3 }>> = []
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createRecipeBookView(factory, parent, {
      onPlaceRecipe: (operation) => placements.push(operation),
    })
    view.render(viewModel)

    const root = fakeElement(view.root)
    const craftableSection = fakeElement(root.find('data-mx-ui', 'recipe-book-craftable'))
    const uncraftableSection = fakeElement(root.find('data-mx-ui', 'recipe-book-uncraftable'))
    const visibleRecipe = fakeElement(craftableSection.find('data-recipe-id', selected.recipe.id))
    const hiddenCopy = fakeElement(uncraftableSection.find('data-recipe-id', selected.recipe.id))
    expect(visibleRecipe.attributes.has('hidden')).toBe(false)
    expect(hiddenCopy.attributes.has('hidden')).toBe(true)
    expect(visibleRecipe.find('data-mx-ui', 'recipe-book-output')?.textContent).toContain(
      ITEM_DISPLAY_NAMES[selected.recipe.output.item].en,
    )

    const placeButton = visibleRecipe.findAll('data-mx-ui', 'recipe-book-place').find((button) =>
      button.attributes.get('data-grid-width') === String(gridWidth),
    )
    expect(placeButton?.attributes.get('data-focus-group')).toBe('recipe-book-craftable')
    fakeElement(placeButton).dispatch('click')
    expect(placements).toStrictEqual([{
      kind: 'place-recipe',
      recipeId: selected.recipe.id,
      gridWidth,
    }])

    expect(root.find('data-mx-ui', 'recipe-book-title')?.textContent).toBe('Recipe book')
    expect(Result.isSuccess(view.setUiScale(1.5))).toBe(true)
    expect(root.style.properties.get('zoom')).toBe('1.5')
  })
})
