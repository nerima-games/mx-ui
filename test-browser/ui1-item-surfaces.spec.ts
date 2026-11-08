import { expect, test } from '@playwright/test'
import { ITEM_DISPLAY_NAMES, ITEM_TYPES } from '@nerima-games/mc-kernel'
import { emptyInventory } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { fileURLToPath } from 'node:url'
import { recipeBookViewModel, type RecipePlacementOperation } from '../src/domain/recipe-book-view-model'
import { UI1_ITEM_SURFACE_SCENARIO_REFERENCE } from '../apps/browser-harness/ui1-item-surface-fixture'

const recipeBookViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/recipe-book-view.ts', import.meta.url),
)}`
const creativeInventoryViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/creative-inventory-view.ts', import.meta.url),
)}`
const uiLocalizationModule = `/@fs${fileURLToPath(
  new URL('../src/application/ui-localization.ts', import.meta.url),
)}`
const itemSurfaceFixtureModule = `/@fs${fileURLToPath(
  new URL('../apps/browser-harness/ui1-item-surface-fixture.ts', import.meta.url),
)}`

const recipeModelResult = recipeBookViewModel(emptyInventory())
if (Result.isFailure(recipeModelResult)) {
  throw new Error('Expected the kernel recipe table to produce a view model')
}

const recipeEntry = recipeModelResult.success.uncraftable.find(({ gridWidths }) =>
  gridWidths.includes(2) && gridWidths.includes(3),
)
if (typeof recipeEntry === 'undefined') {
  throw new Error('Expected a recipe that fits both crafting grid sizes')
}

const recipeId = String(recipeEntry.recipe.id)

const pressTabRepeatedly = (page: import('@playwright/test').Page, count: number): Promise<void> =>
  Array.from({ length: count }).reduce<Promise<void>>(
    (previous) => previous.then(() => page.keyboard.press('Tab')),
    Promise.resolve(),
  )

const lastPlacementOf = async (page: import('@playwright/test').Page): Promise<unknown> => {
  const serialized = await page.locator('[data-ui1-item-surfaces]').getAttribute('data-last-placement')
  if (serialized === null) {
    return
  }
  return JSON.parse(serialized)
}

const expectedItemIdsForSearch = (query: string): ReadonlyArray<string> => {
  const trimmedQuery = query.trim()
  const normalizedQuery = trimmedQuery.toLocaleLowerCase('en-US')
  return ITEM_TYPES.filter((itemId) => {
    const names = ITEM_DISPLAY_NAMES[itemId]
    return names.en.toLocaleLowerCase('en-US').includes(normalizedQuery) || names.ja.includes(trimmedQuery)
  })
}

test(UI1_ITEM_SURFACE_SCENARIO_REFERENCE, async ({ page }, testInfo) => {
  await page.goto('/session.html')
  await page.waitForFunction(() => document.documentElement.dataset['sessionReady'] === '1')
  const sessionRoot = page.locator('#session-root')
  await page.keyboard.press('E')
  await expect(sessionRoot.locator('[data-mx-ui="inventory"]')).toBeVisible()

  const beforeScreenshot = testInfo.outputPath('ui1-before-inventory.png')
  await sessionRoot.screenshot({ path: beforeScreenshot })

  await page.route('https://items.test/apple.svg', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="9" r="6" fill="#df5548"/><path d="M8 3c1-2 3-2 4-2-1 2-2 3-4 3" fill="#477c42"/></svg>',
  }))

  await page.evaluate(async ({
    recipePath,
    creativePath,
    localizationPath,
    fixturePath,
    selectedRecipeId,
    iconUrl,
  }) => {
    const root = document.querySelector<HTMLElement>('#session-root')
    const mountedUi = root?.querySelector<HTMLElement>('[data-mx-ui="mount-root"]')
    if (root === null || mountedUi === null || typeof mountedUi === 'undefined') {
      throw new Error('Expected the mounted session UI root')
    }
    mountedUi.setAttribute('hidden', '')

    const fixture = document.createElement('main')
    fixture.setAttribute('data-ui1-item-surfaces', '')
    fixture.style.setProperty('box-sizing', 'border-box')
    fixture.style.setProperty('display', 'grid')
    fixture.style.setProperty('font-family', 'system-ui, sans-serif')
    fixture.style.setProperty('gap', '16px')
    fixture.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))')
    fixture.style.setProperty('margin', '20px auto')
    fixture.style.setProperty('max-width', '1200px')
    fixture.style.setProperty('padding', '16px')
    fixture.style.setProperty('width', 'calc(100vw - 40px)')
    root.appendChild(fixture)

    const [
      { createRecipeBookView },
      { createCreativeInventoryView },
      { applyUiLanguage },
      { createUi1ItemIconResolver, createUi1RecipeBookModel },
    ] =
      await Promise.all([
        import(recipePath),
        import(creativePath),
        import(localizationPath),
        import(fixturePath),
      ])

    const recipeHost = document.createElement('section')
    const creativeHost = document.createElement('section')
    fixture.append(recipeHost, creativeHost)
    applyUiLanguage(recipeHost, 'ja')
    applyUiLanguage(creativeHost, 'ja')

    const recipeView = createRecipeBookView(document, recipeHost, {
      onPlaceRecipe: (operation: RecipePlacementOperation) => {
        fixture.dataset['lastPlacement'] = JSON.stringify(operation)
      },
    })
    recipeView.render(createUi1RecipeBookModel(selectedRecipeId))

    const iconResolver = createUi1ItemIconResolver(iconUrl)
    createCreativeInventoryView(document, creativeHost, {}, { iconResolver })
  }, {
    recipePath: recipeBookViewModule,
    creativePath: creativeInventoryViewModule,
    localizationPath: uiLocalizationModule,
    fixturePath: itemSurfaceFixtureModule,
    selectedRecipeId: recipeId,
    iconUrl: 'https://items.test/apple.svg',
  })

  const recipeHost = page.locator('[data-ui1-item-surfaces] > section').nth(0)
  const creativeHost = page.locator('[data-ui1-item-surfaces] > section').nth(1)
  await expect(recipeHost.locator('[data-mx-ui="recipe-book"]')).toBeVisible()
  await expect(creativeHost.locator('[data-mx-ui="creative-inventory"]')).toBeVisible()

  const placeTwoByTwo = recipeHost.locator('[data-mx-ui="recipe-book-place"][data-grid-width="2"]').first()
  const placeThreeByThree = recipeHost.locator('[data-mx-ui="recipe-book-place"][data-grid-width="3"]').first()
  await expect(placeTwoByTwo).toBeVisible()
  await expect(placeThreeByThree).toBeVisible()
  await placeTwoByTwo.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => lastPlacementOf(page)).toEqual({
    kind: 'place-recipe',
    recipeId: recipeEntry.recipe.id,
    gridWidth: 2,
  })
  await page.keyboard.press('ArrowRight')
  await expect(placeThreeByThree).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => lastPlacementOf(page)).toEqual({
    kind: 'place-recipe',
    recipeId: recipeEntry.recipe.id,
    gridWidth: 3,
  })

  const search = creativeHost.locator('[data-mx-ui="creative-search"]')
  const apple = creativeHost.locator('[data-mx-ui="creative-item"][data-item-id="apple"]')
  const visibleItems = creativeHost.locator('[data-mx-ui="creative-item"]:visible')
  const assertSearch = async (query: string): Promise<void> => {
    const expectedItemIds = expectedItemIdsForSearch(query).slice().sort()
    await search.fill(query)
    await expect(apple).toBeVisible()
    await expect(visibleItems).toHaveCount(expectedItemIds.length)
    await expect.poll(() => visibleItems.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-item-id')).filter((itemId): itemId is string => itemId !== null).sort(),
    )).toEqual(expectedItemIds)
  }
  await assertSearch(ITEM_DISPLAY_NAMES.apple.en)
  await assertSearch(ITEM_DISPLAY_NAMES.apple.ja)
  await expect(apple.locator('[data-mx-ui="slot-item"]')).toHaveText(ITEM_DISPLAY_NAMES.apple.ja)
  await expect(apple.locator('[data-mx-ui="slot-icon"]')).toBeVisible()
  await expect(apple.locator('[data-mx-ui="slot-icon"] img')).toHaveJSProperty('naturalWidth', 16)

  await search.focus()
  const categoryCount = await creativeHost.locator('[data-mx-ui="creative-category"]').count()
  await pressTabRepeatedly(page, categoryCount + 1)
  await expect(apple).toBeFocused()
  const tooltip = apple.locator('[role="tooltip"]')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText(ITEM_DISPLAY_NAMES.apple.ja)

  const afterScreenshot = testInfo.outputPath('ui1-after-item-surfaces.png')
  await page.screenshot({ path: afterScreenshot })
})
