import * as fc from 'fast-check'
import { Result } from 'effect'
import {
  RecipeId,
  RecipeIngredientCount,
  RecipePatternRow,
  RecipePatternSymbol,
  TagLocation,
  VANILLA_CRAFTING_RECIPES,
  anyOf,
  shapedRecipe,
  shapelessRecipe,
  tagged,
  type CraftingIngredientInput,
  type ItemType,
} from '@nerima-games/mc-kernel'
import { emptyInventory, itemStack, type Inventory } from '@nerima-games/mc-sim'
import { describe, expect, it } from 'vitest'
import {
  recipeBookViewModel,
  recipeCraftableInInventory,
  recipePlacementOperationOf,
} from '../src/domain/recipe-book-view-model'

const makeStack = (item: ItemType, count: number) => {
  const result = itemStack(item, count)
  if (Result.isFailure(result)) {
    throw new Error(`fixture stack for ${item} must be valid`)
  }
  return result.success
}

const OUTPUT = makeStack('stick', 1)

const mustSucceed = <T, E>(result: Result.Result<T, E>, message: string): T => {
  if (Result.isFailure(result)) {
    throw new Error(message)
  }
  return result.success
}

const makeShapelessRecipe = (name: string, ingredients: ReadonlyArray<CraftingIngredientInput>) =>
  mustSucceed(shapelessRecipe(RecipeId(name), ingredients, OUTPUT), 'valid shapeless recipe must build')

const makeThreeWideRecipe = () =>
  mustSucceed(
    shapedRecipe(
      RecipeId('test:three-wide'),
      ['SSS', 'S S', 'SSS'].map((row) => RecipePatternRow(row)),
      { [RecipePatternSymbol('S')]: 'stone' },
      OUTPUT,
    ),
    'valid shaped recipe must build',
  )

const inventoryOf = (...stacks: ReadonlyArray<readonly [ItemType, number]>): Inventory => ({
  slots: stacks.map(([item, count]) => makeStack(item, count)),
})

describe('recipe book view model', () => {
  it('separates every kernel recipe into exactly one craftability list', () => {
    const result = recipeBookViewModel(emptyInventory())
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) {
      throw new Error('the kernel recipe table must produce a view model')
    }
    expect(result.success.craftable).toStrictEqual([])
    expect(result.success.uncraftable.map(({ recipe }) => recipe.id)).toStrictEqual(
      VANILLA_CRAFTING_RECIPES.map(({ id }) => id),
    )
  })

  it('counts quantities across slots and refuses to double-count one item', () => {
    const recipe = makeShapelessRecipe(
      'test:two-planks-and-stick',
      ['oak_planks', 'oak_planks', 'stick'],
    )
    expect(recipeCraftableInInventory(recipe, inventoryOf(['oak_planks', 1], ['stick', 1]))).toStrictEqual(
      Result.succeed(false),
    )
    expect(recipeCraftableInInventory(recipe, inventoryOf(['oak_planks', 1], ['oak_planks', 1], ['stick', 1]))).toStrictEqual(
      Result.succeed(true),
    )
  })

  it('assigns alternatives without consuming the same stack twice', () => {
    const alternatives = mustSucceed(anyOf(['oak_planks', 'stick']), 'valid alternatives must build')
    const recipe = makeShapelessRecipe(
      'test:alternative-and-plank',
      [alternatives, 'oak_planks'],
    )
    expect(recipeCraftableInInventory(recipe, inventoryOf(['oak_planks', 1]))).toStrictEqual(
      Result.succeed(false),
    )
    expect(recipeCraftableInInventory(recipe, inventoryOf(['oak_planks', 1], ['stick', 1]))).toStrictEqual(
      Result.succeed(true),
    )

    const countedAlternative = mustSucceed(
      anyOf(['oak_planks', 'stick'], RecipeIngredientCount(2)),
      'valid counted alternatives must build',
    )
    const countedRecipe = makeShapelessRecipe(
      'test:counted-alternative',
      [countedAlternative],
    )
    expect(recipeCraftableInInventory(countedRecipe, inventoryOf(['oak_planks', 1], ['stick', 1]))).toStrictEqual(
      Result.succeed(false),
    )
    expect(recipeCraftableInInventory(countedRecipe, inventoryOf(['oak_planks', 2]))).toStrictEqual(
      Result.succeed(true),
    )
  })

  it('matches item tags using the kernel membership table', () => {
    const ingredient = mustSucceed(
      tagged(TagLocation('#minecraft:trim_templates')),
      'valid trim-template tag must build',
    )
    const recipe = makeShapelessRecipe('test:template-tag', [ingredient])
    expect(
      recipeCraftableInInventory(recipe, inventoryOf(['netherite_upgrade_smithing_template', 1])),
    ).toStrictEqual(
      Result.succeed(true),
    )
  })

  it('property: craftability follows independently calculated exact ingredient totals', () => {
    const recipe = makeShapelessRecipe(
      'test:quantity-property',
      ['oak_planks', 'oak_planks', 'stick'],
    )
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), (plankCount, stickCount) => {
        const stacks: Array<readonly [ItemType, number]> = []
        if (plankCount > 0) {
          stacks.push(['oak_planks', plankCount])
        }
        if (stickCount > 0) {
          stacks.push(['stick', stickCount])
        }
        const actual = recipeCraftableInInventory(recipe, inventoryOf(...stacks))
        expect(actual).toStrictEqual(Result.succeed(plankCount >= 2 && stickCount >= 1))
      }),
      { numRuns: 200 },
    )
  })

  it('rejects a recipe that cannot fit the requested grid and validates grid boundaries', () => {
    const large = makeThreeWideRecipe()
    expect(recipePlacementOperationOf(large, 2)).toStrictEqual(
      Result.fail({ _tag: 'RecipeDoesNotFitGrid', recipeId: large.id, gridWidth: 2 }),
    )
    expect(recipePlacementOperationOf(large, 3)).toStrictEqual(
      Result.succeed({ kind: 'place-recipe', recipeId: large.id, gridWidth: 3 }),
    )
    expect(recipePlacementOperationOf(large, 1)).toStrictEqual(
      Result.fail({ _tag: 'InvalidGridWidth', gridWidth: 1 }),
    )
    expect(recipePlacementOperationOf(large, 4)).toStrictEqual(
      Result.fail({ _tag: 'InvalidGridWidth', gridWidth: 4 }),
    )
  })

  it('accepts both grid sizes for a one-slot recipe', () => {
    const small = makeShapelessRecipe('test:one-slot', ['oak_planks'])
    expect(recipePlacementOperationOf(small, 2)).toStrictEqual(
      Result.succeed({ kind: 'place-recipe', recipeId: small.id, gridWidth: 2 }),
    )
    expect(recipePlacementOperationOf(small, 3)).toStrictEqual(
      Result.succeed({ kind: 'place-recipe', recipeId: small.id, gridWidth: 3 }),
    )
  })
})
