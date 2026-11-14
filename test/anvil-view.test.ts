import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createAnvilView, type AnvilInteractionView } from '../src/application/anvil-view'
import { anvilViewModel } from '../src/domain/anvil-view-model'
import { fakeDocument, fakeElement } from './fake-dom'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'

describe('createAnvilView', () => {
  it('returns a typed failure for a null model', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))

    expect(view.render(null)).toStrictEqual(Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'model' }))
  })

  it('returns typed failures for null slot labels and rejection reasons', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const valid = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    })
    const invalidSlot = { ...valid }
    const invalidSlots = valid.slots.map((slot) =>
      slot?.id === 'primary-input' ? { ...slot, countLabel: null } : slot,
    )
    expect(Reflect.set(invalidSlot, 'slots', invalidSlots)).toBe(true)
    const invalidRejection = { ...valid }
    expect(Reflect.set(invalidRejection, 'rejectionReason', null)).toBe(true)

    expect(view.render(invalidSlot)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots[].countLabel',
    }))
    expect(view.render(invalidRejection)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'rejectionReason',
    }))
  })

  it('returns a typed failure when a nonempty slot item display name is null', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const valid = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    }, fakeItemDisplayNameOptions())
    const primaryInput = valid.slots.find((slot) => slot.id === 'primary-input')
    if (typeof primaryInput === 'undefined') {
      expect(primaryInput).toBeDefined()
      return
    }
    expect(primaryInput.itemId).toBe('iron_sword')
    expect(primaryInput.itemDisplayName).toBeDefined()
    const invalidPrimaryInput = { ...primaryInput }
    expect(Reflect.set(invalidPrimaryInput, 'itemDisplayName', null)).toBe(true)
    const invalid = { ...valid }
    const invalidSlots = valid.slots.map((slot) =>
      slot.id === 'primary-input' ? invalidPrimaryInput : slot,
    )
    expect(Reflect.set(invalid, 'slots', invalidSlots)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots[].itemDisplayName',
    }))
  })

  it.each([
    { label: 'a missing Result record', value: { language: 'en', result: null } },
    { label: 'a non-string success value', value: { language: 'en', result: Result.succeed(null) } },
    { label: 'a non-record failure value', value: { language: 'en', result: Result.fail(null) } },
    { label: 'an unknown failure tag', value: { language: 'en', result: Result.fail({ _tag: 'UnknownFailure' }) } },
    { label: 'a non-string failure tag', value: { language: 'en', result: Result.fail({ _tag: 7 }) } },
  ])('returns a typed failure for $label in a slot item display name', ({ value }) => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const valid = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    }, fakeItemDisplayNameOptions())
    const primaryInput = valid.slots.find((slot) => slot.id === 'primary-input')
    expect(primaryInput).toBeDefined()
    if (typeof primaryInput === 'undefined') {
      return
    }
    const invalidPrimaryInput = { ...primaryInput }
    expect(Reflect.set(invalidPrimaryInput, 'itemDisplayName', value)).toBe(true)
    const invalid = { ...valid }
    const invalidSlots = valid.slots.map((slot) =>
      slot.id === 'primary-input' ? invalidPrimaryInput : slot,
    )
    expect(Reflect.set(invalid, 'slots', invalidSlots)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots[].itemDisplayName',
    }))
  })

  it('accepts an omitted slot entry and rejects a non-record slot through render', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const sparseSlots = { levelCost: 0, name: '', rejectionReason: undefined, slots: [undefined] }
    const invalidSlots = { levelCost: 0, name: '', rejectionReason: undefined, slots: [null] }

    expect(Reflect.apply(view.render, view, [sparseSlots])).toStrictEqual(Result.void)
    expect(Reflect.apply(view.render, view, [invalidSlots])).toStrictEqual(
      Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'slots[].slot' }),
    )
  })

  it('accepts a recognized item display name failure from the host', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const model = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    }, fakeItemDisplayNameOptions())
    const primaryInput = model.slots.find((slot) => slot.id === 'primary-input')
    expect(primaryInput).toBeDefined()
    if (typeof primaryInput === 'undefined') {
      return
    }
    const unavailableName = {
      language: 'en',
      result: Result.fail({ _tag: 'ItemDisplayNameUnavailable' }),
    }
    const unavailableNameSlot = { ...primaryInput }
    expect(Reflect.set(unavailableNameSlot, 'itemDisplayName', unavailableName)).toBe(true)
    const unavailableNameModel = { ...model }
    const slots = model.slots.map((slot) =>
      slot.id === 'primary-input' ? unavailableNameSlot : slot,
    )
    expect(Reflect.set(unavailableNameModel, 'slots', slots)).toBe(true)

    expect(view.render(unavailableNameModel)).toStrictEqual(Result.void)
  })

  it.each([
    { language: 'ja', expected: Result.void },
    { language: 'fr', expected: Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'slots[].itemDisplayName' }) },
  ])('accepts Japanese and rejects unsupported item display languages: $language', ({ language, expected }) => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const model = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    }, fakeItemDisplayNameOptions())
    const slot = model.slots.find((candidate) => candidate.id === 'primary-input')
    expect(slot).toBeDefined()
    if (typeof slot === 'undefined') {
      return
    }
    const localizedSlot = { ...slot }
    expect(Reflect.set(localizedSlot, 'itemDisplayName', { language, result: Result.succeed('sword') })).toBe(true)
    const localizedModel = { ...model }
    expect(Reflect.set(localizedModel, 'slots', model.slots.map((candidate) =>
      candidate.id === 'primary-input' ? localizedSlot : candidate,
    ))).toBe(true)

    expect(view.render(localizedModel)).toStrictEqual(expected)
  })

  it('returns typed failures instead of stringifying malformed slot, rejection, and interaction text', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const valid = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: { count: 1, itemId: 'iron_sword' },
      rejectionReason: undefined,
      secondaryInput: undefined,
    }, fakeItemDisplayNameOptions())
    const invalidCount = { ...valid }
    const countSlots = valid.slots.map((slot) =>
      slot.id === 'primary-input' ? { ...slot, countLabel: 7 } : slot,
    )
    expect(Reflect.set(invalidCount, 'slots', countSlots)).toBe(true)
    const invalidName = { ...valid }
    const nameSlots = valid.slots.map((slot) =>
      slot.id === 'primary-input' ? { ...slot, itemDisplayName: 7 } : slot,
    )
    expect(Reflect.set(invalidName, 'slots', nameSlots)).toBe(true)
    const invalidRejection = { ...valid }
    expect(Reflect.set(invalidRejection, 'rejectionReason', 7)).toBe(true)

    expect(view.render(invalidCount)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots[].countLabel',
    }))
    expect(view.render(invalidName)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots[].itemDisplayName',
    }))
    expect(view.render(invalidRejection)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'rejectionReason',
    }))
    expect(Reflect.apply(view.render, view, [valid, { focusedTarget: 'name', status: 7 }])).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'interaction.status',
    }))
    expect(Reflect.apply(view.render, view, [valid, 7])).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'interaction',
    }))
    expect(Reflect.apply(view.render, view, [7])).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'model',
    }))
    expect(Reflect.apply(view.render, view, [{}])).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'slots',
    }))
  })

  it('returns typed failures for null interaction, status, and focus inputs', () => {
    const factory = fakeDocument()
    const view = createAnvilView(factory, factory.createElement('main'))
    const valid = anvilViewModel({
      levelCost: 1,
      name: '',
      output: undefined,
      primaryInput: undefined,
      rejectionReason: undefined,
      secondaryInput: undefined,
    })
    const invalidStatus: AnvilInteractionView = { focusedTarget: 'name', status: 'ready' }
    Reflect.set(invalidStatus, 'status', null)
    const invalidFocus: AnvilInteractionView = { focusedTarget: 'name', status: 'ready' }
    Reflect.set(invalidFocus, 'focusedTarget', null)

    expect(view.render(valid, null)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'interaction',
    }))
    expect(view.render(valid, invalidStatus)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'interaction.status',
    }))
    expect(view.render(valid, invalidFocus)).toStrictEqual(Result.fail({
      _tag: 'InvalidAnvilViewInput',
      field: 'interaction.focusedTarget',
    }))
  })

  it('projects every operation target, cost, rejection, and accessibility without listeners', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createAnvilView(factory, host)
    const root = fakeElement(view.root)
    view.render(
      anvilViewModel({
        levelCost: 39,
        name: 'Too Sharp',
        output: undefined,
        primaryInput: { count: 1, itemId: 'minecraft:iron_sword' },
        rejectionReason: 'Too expensive',
        secondaryInput: { count: 2, itemId: 'minecraft:iron_ingot' },
      }, fakeItemDisplayNameOptions()),
      { focusedTarget: 'name', status: 'Anvil name selected' },
    )

    const targets = root.findAll('data-interaction-target', 'anvil-operation')
    expect(targets).toHaveLength(4)
    expect(targets[0]?.attributes.get('aria-label')).toBe('Anvil primary input, en:iron_sword, 1')
    expect(targets[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:iron_sword')
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
    const root = fakeElement(view.root)
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

  it('returns a typed failure for an unrecognized focused target', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createAnvilView(factory, host)
    const interaction: AnvilInteractionView = {
      focusedTarget: JSON.parse('"stale-target"'),
      status: 'Recovered focus',
    }
    const result = view.render(
      anvilViewModel({
        levelCost: 1,
        name: '',
        output: undefined,
        primaryInput: undefined,
        rejectionReason: undefined,
        secondaryInput: undefined,
      }),
      interaction,
    )

    expect(result).toStrictEqual(
      Result.fail({ _tag: 'InvalidAnvilViewInput', field: 'interaction.focusedTarget' }),
    )
  })

  it('REGRESSION: a shorter slots array than the DOM leaves the surplus slot elements untouched', () => {
    // AnvilViewModel is a published type (docs/public-api.md) with no canonical
    // constructor site other than `anvilViewModel`, which always returns exactly
    // three slots — a consumer assembling one by hand, which is what a published
    // view model is for, can hand over fewer.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createAnvilView(factory, host)
    const root = fakeElement(view.root)
    expect(() =>
      view.render({ levelCost: 0, name: '', rejectionReason: undefined, slots: [] }),
    ).not.toThrow()
    expect(root.findAll('data-interaction-target', 'anvil-operation')).toHaveLength(4)
  })
})
