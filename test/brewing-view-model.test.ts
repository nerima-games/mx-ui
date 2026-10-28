import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  BREWING_TIME_SECS,
  BrewingStateSchema,
  itemStack as makeItemStack,
  type BrewingState,
} from '@nerima-games/mc-sim'
import { brewingViewModel } from '../src/domain/brewing-view-model.js'

const testItemStack = (
  item: Parameters<typeof makeItemStack>[0],
  count: Parameters<typeof makeItemStack>[1],
) => {
  const result = makeItemStack(item, count)
  if (Result.isSuccess(result)) {
    return result.success
  }
  expect.fail(`mc-sim itemStack failed: ${JSON.stringify(result.failure)}`)
}

const snapshot = (input: unknown): BrewingState =>
  Schema.decodeUnknownSync(BrewingStateSchema)(input)

const emptySnapshot = (): BrewingState =>
  snapshot({
    bottles: [undefined, undefined, undefined],
    ingredient: undefined,
    fuel: undefined,
    fuelCharges: 0,
    brewProgressSecs: 0,
  })

describe('brewingViewModel', () => {
  it('projects the mc-sim snapshot without retaining its stacks or changing it', () => {
    const waterBottle = testItemStack('water_bottle', 1)
    const ingredient = testItemStack('nether_wart', 2)
    const fuel = testItemStack('blaze_powder', 1)
    const input = {
      bottles: [waterBottle, undefined, waterBottle],
      ingredient,
      fuel,
      fuelCharges: 3,
      brewProgressSecs: BREWING_TIME_SECS / 2,
    }
    const state = snapshot(input)

    const model = brewingViewModel(state)

    expect(model.bottles).toStrictEqual([
      { label: 'Bottle 1', stack: { item: waterBottle.item, count: waterBottle.count } },
      { label: 'Bottle 2', stack: undefined },
      { label: 'Bottle 3', stack: { item: waterBottle.item, count: waterBottle.count } },
    ])
    expect(model.ingredient).toStrictEqual({ item: ingredient.item, count: ingredient.count })
    expect(model.fuel).toStrictEqual({ count: fuel.count, item: fuel.item })
    expect(model.fuelCharges).toBe(3)
    expect(model.progress).toStrictEqual({
      _tag: 'Brewing',
      remainingSecs: BREWING_TIME_SECS / 2,
    })
    expect(model.bottles[0]?.stack).not.toBe(waterBottle)
    expect(state).toStrictEqual(snapshot(input))
  })

  it('projects an empty brewing stand as idle with three empty bottle slots', () => {
    const model = brewingViewModel(emptySnapshot())

    expect(model.fuel).toBeUndefined()
    expect(model.fuelCharges).toBe(0)
    expect(model.ingredient).toBeUndefined()
    expect(model.bottles).toStrictEqual([
      { label: 'Bottle 1', stack: undefined },
      { label: 'Bottle 2', stack: undefined },
      { label: 'Bottle 3', stack: undefined },
    ])
    expect(model.progress).toStrictEqual({ _tag: 'Idle' })
  })

  it('keeps service operation support out of the snapshot projection', () => {
    const model = brewingViewModel(emptySnapshot())

    expect(model).not.toHaveProperty('operations')
  })
})
