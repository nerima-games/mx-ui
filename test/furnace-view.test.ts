import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createFurnaceView, type FurnaceInteractionView } from '../src/application/furnace-view'
import { furnaceViewModel } from '../src/domain/furnace-view-model'
import { fakeDocument, fakeElement } from './fake-dom'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'

describe('createFurnaceView', () => {
  it('returns a typed failure for a null model', () => {
    const factory = fakeDocument()
    const view = createFurnaceView(factory, factory.createElement('main'))

    expect(view.render(null)).toStrictEqual(Result.fail({ _tag: 'InvalidFurnaceViewInput', field: 'model' }))
  })

  it('returns typed failures for null slot labels', () => {
    const factory = fakeDocument()
    const view = createFurnaceView(factory, factory.createElement('main'))
    const valid = furnaceViewModel({
      input: { itemId: 'sand', count: 1 },
      fuel: undefined,
      output: undefined,
      cookProgress: 0,
      burnProgress: 0,
    })
    const invalid = { ...valid }
    const invalidSlots = valid.slots.map((slot) => ({ ...slot, countLabel: null }))
    expect(Reflect.set(invalid, 'slots', invalidSlots)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidFurnaceViewInput',
      field: 'slots[].countLabel',
    }))
  })

  it('returns a typed failure when a nonempty slot item display name is null', () => {
    const factory = fakeDocument()
    const view = createFurnaceView(factory, factory.createElement('main'))
    const valid = furnaceViewModel({
      input: { itemId: 'sand', count: 1 },
      fuel: undefined,
      output: undefined,
      cookProgress: 0,
      burnProgress: 0,
    }, fakeItemDisplayNameOptions())
    const input = valid.slots.find((slot) => slot.id === 'input')
    if (typeof input === 'undefined') {
      expect(input).toBeDefined()
      return
    }
    expect(input.itemId).toBe('sand')
    expect(input.itemDisplayName).toBeDefined()
    const invalidInput = { ...input }
    expect(Reflect.set(invalidInput, 'itemDisplayName', null)).toBe(true)
    const invalid = { ...valid }
    const invalidSlots = valid.slots.map((slot) => slot.id === 'input' ? invalidInput : slot)
    expect(Reflect.set(invalid, 'slots', invalidSlots)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidFurnaceViewInput',
      field: 'slots[].itemDisplayName',
    }))
  })

  it('returns typed failures for null interaction, status, and focus inputs', () => {
    const factory = fakeDocument()
    const view = createFurnaceView(factory, factory.createElement('main'))
    const model = furnaceViewModel({
      input: undefined,
      fuel: undefined,
      output: undefined,
      cookProgress: 0,
      burnProgress: 0,
    })
    const invalidStatus: FurnaceInteractionView = { focusedSlot: 'input', status: 'ready' }
    Reflect.set(invalidStatus, 'status', null)
    const invalidFocus: FurnaceInteractionView = { focusedSlot: 'input', status: 'ready' }
    Reflect.set(invalidFocus, 'focusedSlot', null)

    expect(view.render(model, null)).toStrictEqual(Result.fail({
      _tag: 'InvalidFurnaceViewInput',
      field: 'interaction',
    }))
    expect(view.render(model, invalidStatus)).toStrictEqual(Result.fail({
      _tag: 'InvalidFurnaceViewInput',
      field: 'interaction.status',
    }))
    expect(view.render(model, invalidFocus)).toStrictEqual(Result.fail({
      _tag: 'InvalidFurnaceViewInput',
      field: 'interaction.focusedSlot',
    }))
  })

  it('projects host interaction attributes, accessibility, and progress without listeners', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = fakeElement(view.root)
    view.render(
      furnaceViewModel({
        input: { itemId: 'minecraft:sand', count: 3 },
        fuel: undefined,
        output: { itemId: 'minecraft:glass', count: 1 },
        cookProgress: 0.5,
        burnProgress: 0.25,
      }, fakeItemDisplayNameOptions()),
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
    expect(slots[0]?.attributes.get('aria-label')).toBe('Furnace input, en:sand, 3')
    expect(slots[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:sand')
    expect(root.find('data-mx-ui', 'furnace-cook-progress')?.attributes.get('aria-valuenow')).toBe('50')
    expect(root.find('data-mx-ui', 'furnace-burn-progress')?.attributes.get('aria-valuenow')).toBe('25')
    expect(root.find('data-mx-ui', 'furnace-status')?.textContent).toBe('Furnace fuel selected')
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('keeps one default tab stop in read-only rendering', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = fakeElement(view.root)
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
    const root = fakeElement(view.root)
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

  it('returns a typed failure for an unrecognized focused slot', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const interaction: FurnaceInteractionView = {
      focusedSlot: JSON.parse('"stale-slot"'),
      status: 'Recovered focus',
    }
    const result = view.render(
      furnaceViewModel({ input: undefined, fuel: undefined, output: undefined, cookProgress: 0, burnProgress: 0 }),
      interaction,
    )

    expect(result).toStrictEqual(
      Result.fail({ _tag: 'InvalidFurnaceViewInput', field: 'interaction.focusedSlot' }),
    )
  })

  it('REGRESSION: a shorter slots array than the DOM leaves the surplus slot elements untouched', () => {
    // FurnaceViewModel is a published type (docs/public-api.md) with no canonical
    // constructor site other than `furnaceViewModel`, which always returns
    // exactly three slots — a consumer assembling one by hand, which is what a
    // published view model is for, can hand over fewer.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createFurnaceView(factory, host)
    const root = fakeElement(view.root)
    expect(() =>
      view.render({ burnProgressPercent: 0, cookProgressPercent: 0, slots: [] }),
    ).not.toThrow()
    expect(root.findAll('data-interaction-target', 'furnace-slot')).toHaveLength(3)
  })
})
