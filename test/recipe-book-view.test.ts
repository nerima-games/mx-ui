import { ITEM_DISPLAY_NAMES } from '@nerima-games/mc-kernel'
import { emptyInventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createRecipeBookView } from '../src/application/recipe-book-view'
import { type RecipeBookEntry, recipeBookViewModel } from '../src/domain/recipe-book-view-model'
import { type FakeElement, fakeDocument, fakeElement } from './fake-dom'

const kernelEntries = (): ReadonlyArray<RecipeBookEntry> => {
  const model = recipeBookViewModel(emptyInventory())
  if (Result.isFailure(model)) {
    return expect.fail('the kernel recipe table must produce a view model')
  }
  return model.success.uncraftable
}

const placementButtonIn = (
  root: FakeElement,
  section: 'craftable' | 'uncraftable',
  recipeId: string,
  gridWidth: 2 | 3,
): FakeElement | undefined =>
  fakeElement(fakeElement(root.find('data-mx-ui', `recipe-book-${section}`)).find('data-recipe-id', recipeId))
    .findAll('data-mx-ui', 'recipe-book-place')
    .find((button) => button.attributes.get('data-grid-width') === String(gridWidth))

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

  it('names outputs with the host resolver and disables placement without a handler', () => {
    const [entry] = kernelEntries().filter(({ gridWidths }) => gridWidths.length > 0)
    if (typeof entry === 'undefined') {
      return expect.fail('the kernel recipe table must contain a placeable recipe')
    }
    const factory = fakeDocument()
    const view = createRecipeBookView(factory, factory.createElement('main'), undefined, {
      displayNameResolver: () => Result.succeed('Host output'),
    })
    view.render({ craftable: [entry], uncraftable: [] })

    const root = fakeElement(view.root)
    const card = fakeElement(fakeElement(root.find('data-mx-ui', 'recipe-book-craftable')).find('data-recipe-id', entry.recipe.id))
    expect(card.find('data-mx-ui', 'recipe-book-output')?.textContent).toBe(
      `Host output × ${String(entry.recipe.output.count)}`,
    )
    const buttons = card.findAll('data-mx-ui', 'recipe-book-place')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every((button) => button.attributes.has('disabled'))).toBe(true)
    expect(buttons.every((button) => button.attributes.get('aria-disabled') === 'true')).toBe(true)
  })

  it('explains a recipe that fits no grid and ignores a grid the recipe does not fit', () => {
    const tableOnly = kernelEntries().find(({ gridWidths }) => gridWidths.length === 1 && gridWidths[0] === 3)
    const [placeable] = kernelEntries().filter(({ gridWidths }) => gridWidths.length > 0)
    if (typeof tableOnly === 'undefined' || typeof placeable === 'undefined') {
      return expect.fail('the kernel recipe table must contain table-only and placeable recipes')
    }
    const placements: Array<unknown> = []
    const factory = fakeDocument()
    const view = createRecipeBookView(factory, factory.createElement('main'), {
      onPlaceRecipe: (operation) => placements.push(operation),
    })
    view.render({
      craftable: [{ recipe: tableOnly.recipe, gridWidths: [2, 3] }],
      uncraftable: [{ recipe: placeable.recipe, gridWidths: [] }],
    })

    const root = fakeElement(view.root)
    fakeElement(placementButtonIn(root, 'craftable', tableOnly.recipe.id, 2)).dispatch('click')
    expect(placements).toStrictEqual([])

    const noFitCard = fakeElement(
      fakeElement(root.find('data-mx-ui', 'recipe-book-uncraftable')).find('data-recipe-id', placeable.recipe.id),
    )
    expect(noFitCard.find('data-mx-ui', 'recipe-book-no-grid-fit')?.textContent).toBe(
      'Does not fit a crafting grid',
    )
    expect(noFitCard.findAll('data-mx-ui', 'recipe-book-place')).toHaveLength(0)
  })

  it('reuses its cards across renders and returns focus to the placement button that had it', () => {
    const [first, second] = kernelEntries().filter(({ gridWidths }) => gridWidths.length === 2)
    if (typeof first === 'undefined' || typeof second === 'undefined') {
      return expect.fail('the kernel recipe table must contain two recipes that fit both grids')
    }
    const factory = fakeDocument()
    const view = createRecipeBookView(factory, factory.createElement('main'), { onPlaceRecipe: () => undefined })
    const root = fakeElement(view.root)
    const firstCraftable = { craftable: [first], uncraftable: [second] }
    const bothUncraftable = { craftable: [], uncraftable: [first, second] }
    const focusedDuring = (render: () => void): ReadonlyArray<unknown> => {
      const before = factory.mark()
      render()
      return factory.since(before).filter(({ kind }) => kind === 'focus').map(({ target }) => target)
    }
    const expectFocusOn = (focused: ReadonlyArray<unknown>, button: FakeElement | undefined): void => {
      expect(focused).toHaveLength(1)
      expect(focused[0] === button).toBe(true)
    }

    view.render(firstCraftable)
    const cardCount = root.findAll('data-mx-ui', 'recipe-book-entry').length
    expect(focusedDuring(() => view.render(firstCraftable))).toHaveLength(0)
    expect(root.findAll('data-mx-ui', 'recipe-book-entry')).toHaveLength(cardCount)

    fakeElement(placementButtonIn(root, 'craftable', first.recipe.id, 2)).dispatch('focus')
    expectFocusOn(focusedDuring(() => view.render(bothUncraftable)), placementButtonIn(root, 'uncraftable', first.recipe.id, 2))
    expectFocusOn(focusedDuring(() => view.render(firstCraftable)), placementButtonIn(root, 'craftable', first.recipe.id, 2))

    fakeElement(placementButtonIn(root, 'uncraftable', second.recipe.id, 3)).dispatch('focus')
    fakeElement(placementButtonIn(root, 'craftable', first.recipe.id, 2)).dispatch('blur')
    expectFocusOn(focusedDuring(() => view.render(firstCraftable)), placementButtonIn(root, 'uncraftable', second.recipe.id, 3))

    fakeElement(placementButtonIn(root, 'uncraftable', second.recipe.id, 2)).dispatch('focus')
    fakeElement(placementButtonIn(root, 'uncraftable', second.recipe.id, 3)).dispatch('blur')
    expectFocusOn(focusedDuring(() => view.render(firstCraftable)), placementButtonIn(root, 'uncraftable', second.recipe.id, 2))

    fakeElement(placementButtonIn(root, 'uncraftable', second.recipe.id, 2)).dispatch('blur')
    expect(focusedDuring(() => view.render(firstCraftable))).toHaveLength(0)
    fakeElement(placementButtonIn(root, 'uncraftable', second.recipe.id, 2)).dispatch('blur')
    expect(focusedDuring(() => view.render(firstCraftable))).toHaveLength(0)

    fakeElement(placementButtonIn(root, 'craftable', first.recipe.id, 2)).dispatch('focus')
    expect(focusedDuring(() => view.render({ craftable: [], uncraftable: [second] }))).toHaveLength(0)
  })
})
