import { expect, type Locator, type Page, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const recipeBookViewModule = `/@fs${fileURLToPath(
  new URL('../src/application/recipe-book-view.ts', import.meta.url),
)}`
const uiLocalizationModule = `/@fs${fileURLToPath(
  new URL('../src/application/ui-localization.ts', import.meta.url),
)}`
const itemSurfaceFixtureModule = `/@fs${fileURLToPath(
  new URL('../apps/browser-harness/ui1-item-surface-fixture.ts', import.meta.url),
)}`

const mountBoneMealRecipeBook = async (page: Page, language: 'en' | 'ja'): Promise<Locator> => {
  await page.goto('/session.html')
  await page.waitForFunction(() => document.documentElement.dataset['sessionReady'] === '1')
  await page.evaluate(async ({ recipePath, localizationPath, fixturePath, uiLanguage }) => {
    const root = document.querySelector<HTMLElement>('#session-root')
    if (root === null) {
      throw new Error('Expected the session root')
    }
    root.querySelector<HTMLElement>('[data-mx-ui="mount-root"]')?.setAttribute('hidden', '')
    const host = document.createElement('section')
    host.setAttribute('data-recipe-book-names', '')
    root.appendChild(host)

    const [{ createRecipeBookView }, { applyUiLanguage }, { createUi1RecipeBookModel }] = await Promise.all([
      import(recipePath),
      import(localizationPath),
      import(fixturePath),
    ])
    applyUiLanguage(host, uiLanguage)
    const view = createRecipeBookView(document, host, { onPlaceRecipe: () => undefined })
    view.render(createUi1RecipeBookModel('minecraft:bone-meal'))
  }, {
    recipePath: recipeBookViewModule,
    localizationPath: uiLocalizationModule,
    fixturePath: itemSurfaceFixtureModule,
    uiLanguage: language,
  })
  const card = page.locator(
    '[data-recipe-book-names] [data-mx-ui="recipe-book-uncraftable"] [data-recipe-id="minecraft:bone-meal"]',
  )
  await expect(card).toBeVisible()
  return card
}

const expectDistinctPlacementNames = async (card: Locator, twoByTwo: string, threeByThree: string): Promise<void> => {
  const placeTwoByTwo = card.getByRole('button', { name: twoByTwo, exact: true })
  const placeThreeByThree = card.getByRole('button', { name: threeByThree, exact: true })
  await expect(placeTwoByTwo).toHaveCount(1)
  await expect(placeThreeByThree).toHaveCount(1)
  await expect(placeTwoByTwo).toHaveAttribute('data-grid-width', '2')
  await expect(placeThreeByThree).toHaveAttribute('data-grid-width', '3')
  await expect(placeTwoByTwo).toHaveAccessibleName(twoByTwo)
  await expect(placeThreeByThree).toHaveAccessibleName(threeByThree)
  const [renderedTwoByTwo, renderedThreeByThree] = await Promise.all([
    placeTwoByTwo.getAttribute('aria-label'),
    placeThreeByThree.getAttribute('aria-label'),
  ])
  expect(renderedTwoByTwo).not.toBe(renderedThreeByThree)
}

test('recipe book placement buttons name their grid size in English', async ({ page }) => {
  const card = await mountBoneMealRecipeBook(page, 'en')
  await expectDistinctPlacementNames(card, 'Place Bone Meal in the 2×2 grid', 'Place Bone Meal in the 3×3 grid')
})

test('recipe book placement buttons name their grid size in Japanese', async ({ page }) => {
  const card = await mountBoneMealRecipeBook(page, 'ja')
  await expectDistinctPlacementNames(card, '骨粉 の材料を 2×2 のクラフト枠に配置', '骨粉 の材料を 3×3 のクラフト枠に配置')
})
