import { describe, expect, it } from 'vitest'
import {
  advanceFurnace,
  emptyFurnaceState,
  furnaceSnapshotOf,
  putFurnaceFuel,
  putFurnaceInput,
  takeFurnaceOutput,
  type FurnaceRules,
} from '../src/domain/furnace-controller'

const RULES: FurnaceRules = {
  fuels: [{ burnTimeSecs: 15, itemId: 'minecraft:coal' }],
  recipes: [
    {
      cookTimeSecs: 10,
      experience: 0.7,
      inputItemId: 'minecraft:iron_ore',
      outputCount: 1,
      outputItemId: 'minecraft:iron_ingot',
    },
  ],
}

describe('furnace controller', () => {
  it('owns input and fuel slots, consumes fuel, and persists progress across view closure', () => {
    const loaded = putFurnaceFuel(
      putFurnaceInput(emptyFurnaceState(), { count: 2, itemId: 'minecraft:iron_ore' }),
      { count: 2, itemId: 'minecraft:coal' },
    )
    const beforeClose = advanceFurnace(loaded, 6, RULES)
    expect(beforeClose.cookProgressSecs).toBe(6)
    expect(beforeClose.fuel?.count).toBe(1)

    const afterReopen = advanceFurnace(beforeClose, 4, RULES)
    expect(afterReopen.input?.count).toBe(1)
    expect(afterReopen.output).toStrictEqual({ count: 1, itemId: 'minecraft:iron_ingot' })
    expect(afterReopen.burnRemainingSecs).toBe(5)
    expect(afterReopen.storedExperience).toBeCloseTo(0.7)
    expect(furnaceSnapshotOf(afterReopen, RULES)).toMatchObject({
      burnProgress: 1 / 3,
      cookProgress: 0,
    })
  })

  it('never consumes fuel or input when the output stack cannot accept the recipe', () => {
    const blocked = {
      ...emptyFurnaceState(),
      fuel: { count: 1, itemId: 'minecraft:coal' },
      input: { count: 2, itemId: 'minecraft:iron_ore' },
      output: { count: 64, itemId: 'minecraft:iron_ingot' },
    }
    expect(advanceFurnace(blocked, 100, RULES)).toStrictEqual(blocked)
    expect(
      advanceFurnace(
        { ...blocked, output: { count: 1, itemId: 'minecraft:gold_ingot' } },
        100,
        RULES,
      ),
    ).toStrictEqual({ ...blocked, output: { count: 1, itemId: 'minecraft:gold_ingot' } })
  })

  it('caps output, preserves the remaining input, and awards stored XP on output take', () => {
    const state = advanceFurnace(
      {
        ...emptyFurnaceState(),
        fuel: { count: 2, itemId: 'minecraft:coal' },
        input: { count: 2, itemId: 'minecraft:iron_ore' },
        output: { count: 63, itemId: 'minecraft:iron_ingot' },
      },
      20,
      RULES,
    )
    expect(state.output?.count).toBe(64)
    expect(state.input?.count).toBe(1)
    const taken = takeFurnaceOutput(state)
    expect(taken.stack?.count).toBe(64)
    expect(taken.experience).toBeCloseTo(0.7)
    expect(taken.state.output).toBeUndefined()
    expect(taken.state.storedExperience).toBe(0)
    expect(takeFurnaceOutput(taken.state).state).toBe(taken.state)
  })

  it('clamps a non-finite elapsed time to zero rather than propagating it into progress', () => {
    const loaded = putFurnaceFuel(
      putFurnaceInput(emptyFurnaceState(), { count: 2, itemId: 'minecraft:iron_ore' }),
      { count: 2, itemId: 'minecraft:coal' },
    )
    expect(advanceFurnace(loaded, Number.NaN, RULES)).toStrictEqual(loaded)
    expect(advanceFurnace(loaded, Number.POSITIVE_INFINITY, RULES)).toStrictEqual(loaded)
  })

  it('clears the input slot when given undefined or a zero-count stack, rather than leaving a phantom stack', () => {
    const withInput = putFurnaceInput(emptyFurnaceState(), { count: 2, itemId: 'minecraft:iron_ore' })
    expect(putFurnaceInput(withInput, undefined).input).toBeUndefined()
    expect(putFurnaceInput(withInput, { count: 0, itemId: 'minecraft:iron_ore' }).input).toBeUndefined()
  })

  it('consumes the last fuel item down to an empty slot rather than a zero-count stack', () => {
    const loaded = {
      ...emptyFurnaceState(),
      fuel: { count: 1, itemId: 'minecraft:coal' },
      input: { count: 2, itemId: 'minecraft:iron_ore' },
    }
    const result = advanceFurnace(loaded, 1, RULES)
    expect(result.fuel).toBeUndefined()
    expect(result.burnRemainingSecs).toBe(14)
  })

  it('preserves cook progress instead of resetting it when fuel runs out mid-cook and none is loaded', () => {
    const outOfFuel = {
      ...emptyFurnaceState(),
      burnTotalSecs: 15,
      cookProgressSecs: 6,
      input: { count: 2, itemId: 'minecraft:iron_ore' },
    }
    expect(advanceFurnace(outOfFuel, 100, RULES)).toStrictEqual(outOfFuel)
  })

  it('consumes the last input item down to an empty slot rather than a zero-count stack', () => {
    const state = {
      ...emptyFurnaceState(),
      fuel: { count: 2, itemId: 'minecraft:coal' },
      input: { count: 1, itemId: 'minecraft:iron_ore' },
    }
    const result = advanceFurnace(state, 10, RULES)
    expect(result.input).toBeUndefined()
    expect(result.output).toStrictEqual({ count: 1, itemId: 'minecraft:iron_ingot' })
  })

  it('stalls without cooking when a mid-cook input swap leaves progress past the new recipe cook time', () => {
    const rulesWithShortRecipe: FurnaceRules = {
      fuels: RULES.fuels,
      recipes: [
        ...RULES.recipes,
        {
          cookTimeSecs: 2,
          experience: 0,
          inputItemId: 'minecraft:sand',
          outputCount: 1,
          outputItemId: 'minecraft:glass',
        },
      ],
    }
    const midCook = {
      ...emptyFurnaceState(),
      burnRemainingSecs: 9,
      burnTotalSecs: 15,
      cookProgressSecs: 6,
      input: { count: 3, itemId: 'minecraft:sand' },
    }
    expect(advanceFurnace(midCook, 1, rulesWithShortRecipe)).toStrictEqual(midCook)
  })

  it('reports zero burn and cook progress for a furnace that has never been lit', () => {
    expect(furnaceSnapshotOf(emptyFurnaceState(), RULES)).toMatchObject({
      burnProgress: 0,
      cookProgress: 0,
    })
  })
})
