import { describe, expect, it } from 'vitest'
import { createFurnaceView } from '../application/furnace-view'
import { furnaceViewModel } from '../domain/furnace-view-model'
import { fakeDocument, type FakeElement } from './fake-dom'

describe('createFurnaceView', () => {
  it('projects host interaction attributes, accessibility, and progress without listeners', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = view.root as FakeElement
    view.render(
      furnaceViewModel({
        input: { itemId: 'minecraft:sand', count: 3 },
        fuel: undefined,
        output: { itemId: 'minecraft:glass', count: 1 },
        cookProgress: 0.5,
        burnProgress: 0.25,
      }),
      { focusedSlot: 'fuel', status: 'Furnace fuel selected' },
    )

    const slots = root.findAll('data-interaction-target', 'furnace-slot')
    expect(slots).toHaveLength(3)
    expect(slots.map((slot) => slot.attributes.get('data-interaction-slot'))).toStrictEqual([
      'input',
      'fuel',
      'output',
    ])
    expect(slots.map((slot) => slot.attributes.get('tabindex'))).toStrictEqual(['-1', '0', '-1'])
    expect(slots.map((slot) => slot.attributes.get('role'))).toStrictEqual([
      'button',
      'button',
      'button',
    ])
    expect(slots[0]?.attributes.get('aria-label')).toBe('Furnace input, minecraft:sand, 3')
    expect(root.find('data-mx-ui', 'furnace-cook-progress')?.attributes.get('aria-valuenow')).toBe('50')
    expect(root.find('data-mx-ui', 'furnace-burn-progress')?.attributes.get('aria-valuenow')).toBe('25')
    expect(root.find('data-mx-ui', 'furnace-status')?.textContent).toBe('Furnace fuel selected')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('keeps one default tab stop in read-only rendering', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = view.root as FakeElement
    view.render(
      furnaceViewModel({
        input: undefined,
        fuel: undefined,
        output: undefined,
        cookProgress: 0,
        burnProgress: 0,
      }),
    )

    expect(
      root.findAll('data-interaction-target', 'furnace-slot').map((slot) => slot.attributes.get('tabindex')),
    ).toStrictEqual(['0', '-1', '-1'])
  })
})
