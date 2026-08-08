import { describe, expect, it } from 'vitest'
import { createFurnaceView, type FurnaceInteractionView } from '../src/application/furnace-view'
import { furnaceViewModel, type FurnaceSlotId } from '../src/domain/furnace-view-model'
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

  it('REGRESSION: an empty slot gets an "empty" label, not an interactive one built from the earlier item', () => {
    // `slotAriaLabel` only runs when `render` is called WITH an interaction — the read-only
    // rendering above never builds the label at all, and the primary test above only ever passes
    // real items, so the `slot.empty` branch of `slotAriaLabel` has no test exercising it.
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
      { focusedSlot: 'input', status: 'Nothing to smelt' },
    )

    const slots = root.findAll('data-interaction-target', 'furnace-slot')
    expect(slots.map((slot) => slot.attributes.get('aria-label'))).toStrictEqual([
      'Furnace input, empty',
      'Furnace fuel, empty',
      'Furnace output, empty',
    ])
  })

  it('REGRESSION: an unrecognized focused slot falls back to the input slot instead of throwing', () => {
    // `FurnaceInteractionView` is a published type with no canonical constructor — a host
    // assembles `focusedSlot` itself, so a stale value round-tripped through persistence can
    // disagree with the `FurnaceSlotId` union it claims to satisfy at compile time.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = view.root as FakeElement
    const interaction: FurnaceInteractionView = {
      focusedSlot: 'stale-slot' as FurnaceSlotId,
      status: 'Recovered focus',
    }
    view.render(
      furnaceViewModel({ input: undefined, fuel: undefined, output: undefined, cookProgress: 0, burnProgress: 0 }),
      interaction,
    )

    expect(
      root.findAll('data-interaction-target', 'furnace-slot').map((slot) => slot.attributes.get('tabindex')),
    ).toStrictEqual(['0', '-1', '-1'])
  })
})
