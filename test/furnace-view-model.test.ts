import { describe, expect, it } from 'vitest'
import { furnaceViewModel, type FurnaceSnapshot } from '../src/domain/furnace-view-model'

const SNAPSHOT: FurnaceSnapshot = {
  input: { itemId: 'minecraft:iron_ore', count: 2 },
  fuel: { itemId: 'minecraft:coal', count: 1 },
  output: undefined,
  cookProgress: 0.425,
  burnProgress: 0.75,
}

describe('furnaceViewModel', () => {
  it('projects three mc-sim-independent slots and normalized progress', () => {
    const model = furnaceViewModel(SNAPSHOT)

    expect(model.slots.map(({ id, itemId, countLabel, empty }) => ({ id, itemId, countLabel, empty }))).toStrictEqual([
      { id: 'input', itemId: 'minecraft:iron_ore', countLabel: '2', empty: false },
      { id: 'fuel', itemId: 'minecraft:coal', countLabel: undefined, empty: false },
      { id: 'output', itemId: undefined, countLabel: undefined, empty: true },
    ])
    expect(model.cookProgressPercent).toBe(43)
    expect(model.burnProgressPercent).toBe(75)
  })

  it('clamps invalid progress without mutating or retaining the snapshot', () => {
    const snapshot: FurnaceSnapshot = { ...SNAPSHOT, cookProgress: Number.NaN, burnProgress: 2 }
    const model = furnaceViewModel(snapshot)

    expect(model.cookProgressPercent).toBe(0)
    expect(model.burnProgressPercent).toBe(100)
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.slots)).toBe(true)
    expect(model.slots.every(Object.isFrozen)).toBe(true)
    expect(snapshot).toStrictEqual({ ...SNAPSHOT, cookProgress: Number.NaN, burnProgress: 2 })
  })
})
