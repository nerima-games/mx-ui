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
})
