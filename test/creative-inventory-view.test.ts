import * as fc from 'fast-check'
import { ITEM_DISPLAY_NAMES, ITEM_TYPES, type ItemType } from '@nerima-games/mc-kernel'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createCreativeInventoryView } from '../src/application/creative-inventory-view'
import type { ItemDisplayNameResolver } from '../src/domain/item-display-name'
import { fakeDocument, fakeElement } from './fake-dom'

describe('creative inventory view', () => {
  it('renders the full catalog, searches both host languages, exposes focus tooltips, and emits typed take intents', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const takes: Array<Readonly<{ kind: 'take-item'; itemId: ItemType }>> = []
    const searches: Array<string> = []
    const categories: Array<string> = []
    const resolver: ItemDisplayNameResolver = (itemId, language) =>
      Result.succeed(
        itemId === 'apple'
          ? language === 'en'
            ? 'Orchard token'
            : '果樹のしるし'
          : ITEM_DISPLAY_NAMES[itemId][language],
      )
    const view = createCreativeInventoryView(
      factory,
      parent,
      {
        onCategoryChange: (category) => categories.push(category),
        onSearchChange: (query) => searches.push(query),
        onTake: (operation) => takes.push(operation),
      },
      { displayNameResolver: resolver },
    )
    const root = fakeElement(view.root)
    const items = root.findAll('data-mx-ui', 'creative-item')
    expect(items).toHaveLength(ITEM_TYPES.length)
    expect(items.every((item) => item.attributes.has('hidden') === false)).toBe(true)

    const search = fakeElement(root.find('data-mx-ui', 'creative-search'))
    search.value = 'Orchard token'
    search.dispatch('input')
    const apple = items.find((item) => item.attributes.get('data-item-id') === 'apple')
    expect(apple?.attributes.has('hidden')).toBe(false)
    expect(items.filter((item) => item.attributes.has('hidden') === false)).toHaveLength(1)
    expect(searches).toStrictEqual(['Orchard token'])

    search.value = '果樹のしるし'
    search.dispatch('input')
    expect(apple?.attributes.has('hidden')).toBe(false)

    const food = root.findAll('data-mx-ui', 'creative-category').find((button) =>
      button.attributes.get('data-category') === 'food',
    )
    expect(food?.attributes.get('data-focus-group')).toBe('creative-categories')
    fakeElement(food).dispatch('click')
    expect(food?.attributes.get('aria-pressed')).toBe('true')
    expect(fakeElement(food).style.properties.get('border-width')).toBe('3px')
    const allCategory = root.findAll('data-mx-ui', 'creative-category').find((button) =>
      button.attributes.get('data-category') === 'all',
    )
    expect(fakeElement(allCategory).style.properties.get('border-width')).toBe('1px')
    expect(categories).toStrictEqual(['food'])

    fakeElement(apple).dispatch('focus')
    const tooltipId = apple?.attributes.get('aria-describedby')
    const tooltip = typeof tooltipId === 'undefined'
      ? undefined
      : root.find('id', tooltipId)
    expect(tooltip?.attributes.has('hidden')).toBe(false)
    expect(tooltip?.textContent).toContain('Orchard token')
    fakeElement(apple).dispatch('click')
    expect(takes).toStrictEqual([{ kind: 'take-item', itemId: 'apple' }])

    search.value = 'no-item-has-this-name'
    search.dispatch('input')
    expect(root.find('data-mx-ui', 'creative-no-results')?.attributes.has('hidden')).toBe(false)
    expect(Result.isSuccess(view.setUiScale(1.25))).toBe(true)
    expect(root.style.properties.get('zoom')).toBe('1.25')
    expect(Result.isFailure(view.setUiScale(99))).toBe(true)
    expect(root.style.properties.get('zoom')).toBe('1.25')
  })

  it('property: every catalog item remains reachable by its kernel display name', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createCreativeInventoryView(factory, parent)
    const root = fakeElement(view.root)
    const search = fakeElement(root.find('data-mx-ui', 'creative-search'))
    const items = root.findAll('data-mx-ui', 'creative-item')
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TYPES), (itemId) => {
        search.value = ITEM_DISPLAY_NAMES[itemId].en
        search.dispatch('input')
        const item = items.find((candidate) =>
          candidate.attributes.get('data-item-id') === itemId,
        )
        expect(item?.attributes.has('hidden')).toBe(false)
      }),
      { numRuns: Math.min(ITEM_TYPES.length, 80) },
    )
  })

  it('keeps kernel search results when the host display-name resolver throws', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createCreativeInventoryView(factory, parent, undefined, {
      displayNameResolver: () => {
        throw new Error('host display-name resolver failed')
      },
    })
    const root = fakeElement(view.root)
    const search = fakeElement(root.find('data-mx-ui', 'creative-search'))
    search.value = 'stone'
    expect(() => search.dispatch('input')).not.toThrow()
    const stone = root.findAll('data-mx-ui', 'creative-item').find((item) =>
      item.attributes.get('data-item-id') === 'stone',
    )
    expect(stone?.attributes.has('hidden')).toBe(false)
    expect(stone?.find('data-mx-ui', 'slot-item')?.textContent).toBe(ITEM_DISPLAY_NAMES.stone.en)
  })
})
