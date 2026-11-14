// @vitest-environment jsdom

import * as fc from 'fast-check'
import { ITEM_DISPLAY_NAMES, ITEM_TYPES, type ItemType } from '@nerima-games/mc-kernel'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { createCreativeInventoryView } from '../src/application/creative-inventory-view'
import { focusTargetForElement, moveFocusTarget } from '../src/application/inventory-navigation'
import type { ItemDisplayNameResolver } from '../src/domain/item-display-name'
import { type FakeElement, fakeDocument, fakeElement } from './fake-dom'

type FocusRow = readonly [string | undefined, string | undefined, string | undefined]

const visibleFocusOrder = (root: FakeElement): ReadonlyArray<FocusRow> =>
  root.findAll('data-mx-ui', 'creative-item')
    .filter((item) => !item.attributes.has('hidden'))
    .map((item): FocusRow => [
      item.attributes.get('data-item-id'),
      item.attributes.get('data-focus-index'),
      item.attributes.get('data-focus-columns'),
    ])

/**
 * Copy every creative item's attributes, as the view wrote them, onto plain jsdom
 * buttons so the real navigation code can query them. Rendering the whole catalog
 * in jsdom takes seconds per step; navigation reads only these attributes.
 */
const projectCreativeItems = (root: FakeElement): HTMLElement => {
  const container = document.createElement('div')
  for (const item of root.findAll('data-mx-ui', 'creative-item')) {
    const button = document.createElement('button')
    for (const [name, value] of item.attributes) {
      button.setAttribute(name, value)
    }
    container.append(button)
  }
  document.body.replaceChildren(container)
  return container
}

const creativeItemInDocument = (root: Element, itemId: string): HTMLElement => {
  const element = root.querySelector(`[data-mx-ui="creative-item"][data-item-id="${itemId}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected creative item ${itemId}`)
  }
  return element
}

const focusedItemId = (): string | null | undefined => document.activeElement?.getAttribute('data-item-id')

const moveFocused = (root: Element, direction: 'down' | 'right'): boolean => {
  const target = focusTargetForElement(document.activeElement)
  if (typeof target === 'undefined') {
    return false
  }
  return moveFocusTarget(root, target, direction)
}

const pressRightUntilStopped = (root: Element): ReadonlyArray<string | null | undefined> => {
  const visited = [focusedItemId()]
  while (moveFocused(root, 'right')) {
    visited.push(focusedItemId())
  }
  return visited
}

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
    expect(apple?.find('data-mx-ui', 'slot-item')?.textContent).toBe('Orcha…')
    expect(apple?.attributes.get('aria-label')).toBe('Take Orchard token')
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

  it('shows host icons with untruncated names and hides a tooltip when focus leaves', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createCreativeInventoryView(factory, parent, undefined, {
      displayNameResolver: (itemId, language) =>
        Result.succeed(itemId === 'apple' && language === 'en' ? 'Orchard token' : ITEM_DISPLAY_NAMES[itemId][language]),
      iconResolver: (itemId) => Result.succeed({ kind: 'url', url: `https://assets.example/${itemId}.png` }),
    })
    const root = fakeElement(view.root)
    const apple = fakeElement(
      root.findAll('data-mx-ui', 'creative-item').find((item) => item.attributes.get('data-item-id') === 'apple'),
    )
    expect(apple.find('aria-hidden', 'true')?.attributes.get('src')).toBe('https://assets.example/apple.png')
    expect(apple.find('data-mx-ui', 'slot-icon')?.attributes.has('hidden')).toBe(false)
    expect(apple.find('data-mx-ui', 'slot-item')?.textContent).toBe('Orchard token')

    const tooltip = apple.find('role', 'tooltip')
    apple.dispatch('focus')
    expect(tooltip?.attributes.has('hidden')).toBe(false)
    apple.dispatch('blur')
    expect(tooltip?.attributes.has('hidden')).toBe(true)
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
    expect(stone?.find('data-mx-ui', 'slot-item')?.attributes.get('title')).toBe('Unknown item')
  })

  it('numbers focus targets in visible display order and renumbers them on search and category changes', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createCreativeInventoryView(factory, parent)
    const root = fakeElement(view.root)
    const search = fakeElement(root.find('data-mx-ui', 'creative-search'))

    search.value = 'book'
    search.dispatch('input')
    expect(visibleFocusOrder(root)).toStrictEqual([
      ['bookshelf', '0', '9'],
      ['enchanted_book', '1', '9'],
      ['book', '2', '9'],
      ['written_book', '3', '9'],
      ['writable_book', '4', '9'],
    ])

    const equipment = root.findAll('data-mx-ui', 'creative-category').find((button) =>
      button.attributes.get('data-category') === 'equipment',
    )
    fakeElement(equipment).dispatch('click')
    expect(visibleFocusOrder(root)).toStrictEqual([
      ['enchanted_book', '0', '9'],
      ['book', '1', '9'],
      ['written_book', '2', '9'],
      ['writable_book', '3', '9'],
    ])

    search.value = 'stone'
    search.dispatch('input')
    expect(visibleFocusOrder(root)).toStrictEqual([
      ['stone_pickaxe', '0', '9'],
      ['stone_hoe', '1', '9'],
      ['stone_shovel', '2', '9'],
      ['stone_axe', '3', '9'],
    ])
  })

  it('moves arrow focus through the packed visible grid and never onto hidden items', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const root = fakeElement(createCreativeInventoryView(factory, parent).root)
    const search = fakeElement(root.find('data-mx-ui', 'creative-search'))

    search.value = 'book'
    search.dispatch('input')
    const bookGrid = projectCreativeItems(root)
    const cobblestone = creativeItemInDocument(bookGrid, 'cobblestone')
    expect(cobblestone.hasAttribute('hidden')).toBe(true)
    expect(focusTargetForElement(cobblestone)).toBeUndefined()
    creativeItemInDocument(bookGrid, 'bookshelf').focus()
    expect(pressRightUntilStopped(bookGrid)).toStrictEqual([
      'bookshelf',
      'enchanted_book',
      'book',
      'written_book',
      'writable_book',
    ])

    search.value = 'stone'
    search.dispatch('input')
    const stoneGrid = projectCreativeItems(root)
    creativeItemInDocument(stoneGrid, 'stone').focus()
    expect(moveFocused(stoneGrid, 'down')).toBe(true)
    expect(focusedItemId()).toBe('stone_hoe')

    const redstone = root.findAll('data-mx-ui', 'creative-category').find((button) =>
      button.attributes.get('data-category') === 'redstone',
    )
    fakeElement(redstone).dispatch('click')
    const redstoneGrid = projectCreativeItems(root)
    creativeItemInDocument(redstoneGrid, 'redstone_block').focus()
    expect(pressRightUntilStopped(redstoneGrid)).toStrictEqual([
      'redstone_block',
      'redstone_torch',
      'stone_button',
      'redstone_lamp',
      'redstone_dust',
      'redstone_ore',
      'deepslate_redstone_ore',
    ])
    redstoneGrid.remove()
  })
})
