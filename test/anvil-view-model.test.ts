import { describe, expect, it } from 'vitest'
import {
  ANVIL_OPERATION_TARGETS,
  type AnvilSnapshot,
  anvilViewModel,
} from '../src/domain/anvil-view-model'

const SNAPSHOT: AnvilSnapshot = {
  levelCost: 7,
  name: 'Cave Finder',
  output: { count: 1, durability: 1, itemId: 'minecraft:diamond_sword' },
  primaryInput: { count: 1, durability: 0.5, itemId: 'minecraft:diamond_sword' },
  rejectionReason: undefined,
  secondaryInput: { count: 2, itemId: 'minecraft:diamond' },
}

describe('anvilViewModel', () => {
  it('projects two inputs, output, name, level cost, rejection, and operation targets', () => {
    const model = anvilViewModel(SNAPSHOT)

    expect(
      model.slots.map(({ id, itemId, countLabel, durabilityPercent }) => ({
        countLabel,
        durabilityPercent,
        id,
        itemId,
      })),
    ).toStrictEqual([
      {
        countLabel: undefined,
        durabilityPercent: 50,
        id: 'primary-input',
        itemId: 'minecraft:diamond_sword',
      },
      {
        countLabel: '2',
        durabilityPercent: undefined,
        id: 'secondary-input',
        itemId: 'minecraft:diamond',
      },
      {
        countLabel: undefined,
        durabilityPercent: 100,
        id: 'output',
        itemId: 'minecraft:diamond_sword',
      },
    ])
    expect(model.name).toBe('Cave Finder')
    expect(model.levelCost).toBe(7)
    expect(model.rejectionReason).toBeUndefined()
    expect(ANVIL_OPERATION_TARGETS).toStrictEqual([
      'primary-input',
      'secondary-input',
      'output',
      'name',
    ])
  })

  it('normalizes invalid costs and returns deeply frozen presentation state', () => {
    const snapshot: AnvilSnapshot = {
      ...SNAPSHOT,
      levelCost: -3.7,
      rejectionReason: 'Insufficient levels',
    }
    const model = anvilViewModel(snapshot)

    expect(model.levelCost).toBe(0)
    expect(model.rejectionReason).toBe('Insufficient levels')
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.slots)).toBe(true)
    expect(model.slots.every(Object.isFrozen)).toBe(true)
    expect(snapshot).toStrictEqual({
      ...SNAPSHOT,
      levelCost: -3.7,
      rejectionReason: 'Insufficient levels',
    })
  })
})
