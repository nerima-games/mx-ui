import { describe, expect, it } from 'vitest'
import { createAnvilView } from '../src/application/anvil-view'
import { anvilViewModel } from '../src/domain/anvil-view-model'
import { type FakeElement, fakeDocument } from './fake-dom'

describe('createAnvilView', () => {
  it('projects every operation target, cost, rejection, and accessibility without listeners', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createAnvilView(factory, host)
    const root = view.root as FakeElement
    view.render(
      anvilViewModel({
        levelCost: 39,
        name: 'Too Sharp',
        output: undefined,
        primaryInput: { count: 1, itemId: 'minecraft:iron_sword' },
        rejectionReason: 'Too expensive',
        secondaryInput: { count: 2, itemId: 'minecraft:iron_ingot' },
      }),
      { focusedTarget: 'name', status: 'Anvil name selected' },
    )

    const targets = root.findAll('data-interaction-target', 'anvil-operation')
    expect(targets).toHaveLength(4)
    expect(targets.map((target) => target.attributes.get('data-operation-target'))).toStrictEqual([
      'primary-input',
      'secondary-input',
      'output',
      'name',
    ])
    expect(targets.map((target) => target.attributes.get('tabindex'))).toStrictEqual([
      '-1',
      '-1',
      '-1',
      '0',
    ])
    expect(root.find('data-mx-ui', 'anvil-name')?.value).toBe('Too Sharp')
    expect(root.find('data-mx-ui', 'anvil-level-cost')?.textContent).toBe('Level cost: 39')
    expect(root.find('data-mx-ui', 'anvil-rejection')?.textContent).toBe('Too expensive')
    expect(root.find('data-mx-ui', 'anvil-rejection')?.attributes.has('hidden')).toBe(false)
    expect(root.find('data-mx-ui', 'anvil-status')?.textContent).toBe('Anvil name selected')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('keeps the primary input as the default tab stop and hides absent rejection', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createAnvilView(factory, host)
    const root = view.root as FakeElement
    view.render(
      anvilViewModel({
        levelCost: Number.NaN,
        name: '',
        output: undefined,
        primaryInput: undefined,
        rejectionReason: undefined,
        secondaryInput: undefined,
      }),
    )

    expect(
      root
        .findAll('data-interaction-target', 'anvil-operation')
        .map((target) => target.attributes.get('tabindex')),
    ).toStrictEqual(['0', '-1', '-1', '-1'])
    expect(root.find('data-mx-ui', 'anvil-level-cost')?.textContent).toBe('Level cost: 0')
    expect(root.find('data-mx-ui', 'anvil-rejection')?.attributes.has('hidden')).toBe(true)
  })
})
