import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createEnchantingTableView, type EnchantingInteractionView } from '../src/application/enchanting-table-view'
import { enchantingTableViewModel } from '../src/domain/enchanting-table-view-model'
import { fakeDocument, fakeElement } from './fake-dom'
import { fakeItemDisplayNameOptions } from './helpers/item-display-name'

describe('createEnchantingTableView', () => {
  it('returns typed failures for null slot labels and offer rejection reasons', () => {
    const factory = fakeDocument()
    const view = createEnchantingTableView(factory, factory.createElement('main'))
    const valid = enchantingTableViewModel({
      item: { itemId: 'diamond_sword', count: 1 },
      lapis: undefined,
      offers: [undefined, undefined, undefined],
    })
    const invalidSlot = { ...valid }
    const invalidSlots = valid.slots.map((slot) => ({ ...slot, countLabel: null }))
    expect(Reflect.set(invalidSlot, 'slots', invalidSlots)).toBe(true)
    const invalidRejection = { ...valid }
    const invalidOffers = valid.offers.map((offer) => ({ ...offer, rejectionReason: null }))
    expect(Reflect.set(invalidRejection, 'offers', invalidOffers)).toBe(true)

    expect(view.render(invalidSlot)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'slots[].countLabel',
    }))
    expect(view.render(invalidRejection)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'offers[].rejectionReason',
    }))
  })

  it('returns a typed failure when a nonempty slot item display name is null', () => {
    const factory = fakeDocument()
    const view = createEnchantingTableView(factory, factory.createElement('main'))
    const valid = enchantingTableViewModel({
      item: { itemId: 'diamond_sword', count: 1 },
      lapis: undefined,
      offers: [undefined, undefined, undefined],
    }, fakeItemDisplayNameOptions())
    const itemSlot = valid.slots.find((slot) => slot.id === 'item')
    if (typeof itemSlot === 'undefined') {
      expect(itemSlot).toBeDefined()
      return
    }
    expect(itemSlot.itemId).toBe('diamond_sword')
    expect(itemSlot.itemDisplayName).toBeDefined()
    const invalidItemSlot = { ...itemSlot }
    expect(Reflect.set(invalidItemSlot, 'itemDisplayName', null)).toBe(true)
    const invalid = { ...valid }
    const invalidSlots = valid.slots.map((slot) => slot.id === 'item' ? invalidItemSlot : slot)
    expect(Reflect.set(invalid, 'slots', invalidSlots)).toBe(true)

    expect(view.render(invalid)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'slots[].itemDisplayName',
    }))
  })

  it('returns typed failures for null interaction, status, and focus inputs', () => {
    const factory = fakeDocument()
    const view = createEnchantingTableView(factory, factory.createElement('main'))
    const model = enchantingTableViewModel({
      item: undefined,
      lapis: undefined,
      offers: [undefined, undefined, undefined],
    })
    const invalidStatus: EnchantingInteractionView = { focusedTarget: 'item', status: 'ready' }
    Reflect.set(invalidStatus, 'status', null)
    const invalidFocus: EnchantingInteractionView = { focusedTarget: 'item', status: 'ready' }
    Reflect.set(invalidFocus, 'focusedTarget', null)

    expect(view.render(model, null)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'interaction',
    }))
    expect(view.render(model, invalidStatus)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'interaction.status',
    }))
    expect(view.render(model, invalidFocus)).toStrictEqual(Result.fail({
      _tag: 'InvalidEnchantingTableViewInput',
      field: 'interaction.focusedTarget',
    }))
  })

  it('projects five operation targets, costs, rejection, and accessibility without listeners', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createEnchantingTableView(factory, host)
    const root = fakeElement(view.root)
    view.render(
      enchantingTableViewModel({
        item: { count: 1, itemId: 'minecraft:diamond_sword' },
        lapis: { count: 3, itemId: 'minecraft:lapis_lazuli' },
        offers: [
          {
            enchantmentId: 'minecraft:sharpness',
            enchantmentLevel: 3,
            lapisCost: 1,
            levelCost: 12,
            rejectionReason: undefined,
          },
          {
            enchantmentId: 'minecraft:unbreaking',
            enchantmentLevel: 2,
            lapisCost: 2,
            levelCost: 18,
            rejectionReason: 'Requires 18 levels',
          },
          undefined,
        ],
      }, fakeItemDisplayNameOptions()),
      { focusedTarget: 'offer-2', status: 'Second enchantment selected' },
    )

    const targets = root.findAll('data-interaction-target', 'enchanting-operation')
    expect(targets).toHaveLength(5)
    expect(targets[0]?.attributes.get('aria-label')).toBe('Enchanting item, en:diamond_sword, 1')
    expect(targets[1]?.attributes.get('aria-label')).toBe('Lapis lazuli, en:lapis_lazuli, 3')
    expect(targets[0]?.find('data-mx-ui', 'slot-item')?.textContent).toBe('en:diamond_sword')
    expect(targets.map((target) => target.attributes.get('data-operation-target'))).toStrictEqual([
      'item',
      'lapis',
      'offer-1',
      'offer-2',
      'offer-3',
    ])
    expect(targets.map((target) => target.attributes.get('tabindex'))).toStrictEqual([
      '-1',
      '-1',
      '-1',
      '0',
      '-1',
    ])
    const labels = root.findAll('data-mx-ui', 'enchanting-offer-label')
    expect(labels.map(({ textContent }) => textContent)).toStrictEqual([
      'Sharpness 3; 12 levels; 1 lapis',
      'Unbreaking 2; 18 levels; 2 lapis',
      'Unavailable enchantment offer',
    ])
    const rejections = root.findAll('data-mx-ui', 'enchanting-offer-rejection')
    expect(rejections[1]?.textContent).toBe('Requires 18 levels')
    expect(rejections[1]?.attributes.has('hidden')).toBe(false)
    expect(targets[3]?.attributes.has('disabled')).toBe(true)
    expect(targets[4]?.attributes.has('disabled')).toBe(true)
    expect(root.find('data-mx-ui', 'enchanting-status')?.textContent).toBe(
      'Second enchantment selected',
    )
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('keeps the item slot as the default tab stop and hides absent rejections', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createEnchantingTableView(factory, host)
    const root = fakeElement(view.root)
    view.render(
      enchantingTableViewModel({
        item: undefined,
        lapis: undefined,
        offers: [undefined, undefined, undefined],
      }),
    )

    expect(
      root
        .findAll('data-interaction-target', 'enchanting-operation')
        .map((target) => target.attributes.get('tabindex')),
    ).toStrictEqual(['0', '-1', '-1', '-1', '-1'])
    expect(
      root
        .findAll('data-mx-ui', 'enchanting-offer-rejection')
        .every((rejection) => rejection.attributes.has('hidden')),
    ).toBe(true)
  })

  it('REGRESSION: empty item and lapis slots get an "empty" label when rendered WITH interaction', () => {
    // `slotAriaLabel` only runs when `render` is called with an interaction — the read-only test
    // above never builds a label at all, and the interactive test above only ever passes real
    // items, so `slot.empty`'s TRUE arm in `slotAriaLabel` has no test exercising it.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createEnchantingTableView(factory, host)
    const root = fakeElement(view.root)
    view.render(
      enchantingTableViewModel({
        item: undefined,
        lapis: undefined,
        offers: [undefined, undefined, undefined],
      }),
      { focusedTarget: 'item', status: 'Place an item to enchant' },
    )

    const targets = root.findAll('data-interaction-target', 'enchanting-operation')
    expect(targets.map((target) => target.attributes.get('aria-label'))).toStrictEqual([
      'Enchanting item, empty',
      'Lapis lazuli, empty',
      'Unavailable enchantment offer',
      'Unavailable enchantment offer',
      'Unavailable enchantment offer',
    ])
  })

  it('REGRESSION: an unrecognized focused target falls back to the item slot instead of throwing', () => {
    // `EnchantingInteractionView` is a published type with no canonical constructor — a host
    // assembles `focusedTarget` itself, so a stale value round-tripped through persistence can
    // disagree with the `EnchantingOperationTarget` union it claims to satisfy at compile time.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createEnchantingTableView(factory, host)
    const root = fakeElement(view.root)
    const interaction: EnchantingInteractionView = {
      focusedTarget: JSON.parse('"stale-target"'),
      status: 'Recovered focus',
    }
    view.render(
      enchantingTableViewModel({ item: undefined, lapis: undefined, offers: [undefined, undefined, undefined] }),
      interaction,
    )

    expect(
      root
        .findAll('data-interaction-target', 'enchanting-operation')
        .map((target) => target.attributes.get('tabindex')),
    ).toStrictEqual(['0', '-1', '-1', '-1', '-1'])
  })

  it('REGRESSION: fewer slots and offers than the DOM leaves the surplus elements untouched', () => {
    // EnchantingTableViewModel is a published type (docs/public-api.md) with no
    // canonical constructor site other than `enchantingTableViewModel`, which
    // always returns two slots and three offers — a consumer assembling one by
    // hand, which is what a published view model is for, can hand over fewer.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createEnchantingTableView(factory, host)
    const root = fakeElement(view.root)
    expect(() => view.render({ offers: [], slots: [] })).not.toThrow()
    expect(root.findAll('data-interaction-target', 'enchanting-operation')).toHaveLength(5)
  })
})
