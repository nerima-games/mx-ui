import * as fc from 'fast-check'
import { Result } from 'effect'
import { ITEM_DISPLAY_NAMES, ITEM_TYPES, type ItemType } from '@nerima-games/mc-kernel'
import { describe, expect, it } from 'vitest'
import type { ItemDisplayNameResolver } from '../src/domain/item-display-name.js'
import {
  CREATIVE_ITEM_CATEGORIES,
  creativeInventoryViewModel,
  creativeItemCategoryOf,
  creativeTakeOperationOf,
} from '../src/domain/creative-inventory-view-model'

const itemIdsOf = (query: string, category: 'all' | (typeof CREATIVE_ITEM_CATEGORIES)[number] = 'all') =>
  creativeInventoryViewModel(query, category).items.map(({ itemId }) => itemId)

describe('creative inventory view model', () => {
  it('assigns each kernel item to exactly one category', () => {
    const assigned = CREATIVE_ITEM_CATEGORIES.flatMap((category) =>
      creativeInventoryViewModel('', category).items.map(({ itemId }) => itemId),
    )
    expect(new Set(assigned).size).toBe(ITEM_TYPES.length)
    expect(assigned.slice().sort()).toStrictEqual([...ITEM_TYPES].sort())
  })

  it('exposes bilingual kernel display names for every catalog item', () => {
    const model = creativeInventoryViewModel('', 'all')
    for (const item of model.items) {
      expect(item.displayNames).toStrictEqual(ITEM_DISPLAY_NAMES[item.itemId])
    }
  })

  it('searches either kernel language and normalizes surrounding whitespace and case', () => {
    expect(itemIdsOf(' APPLE ')).toContain('apple')
    const japaneseApple = ITEM_DISPLAY_NAMES.apple.ja
    expect(itemIdsOf(japaneseApple)).toContain('apple')
  })

  it('property: search results equal a direct bilingual filter of the kernel registry', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), (query) => {
          const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
          const expected = ITEM_TYPES.filter((itemId) => {
            const names = ITEM_DISPLAY_NAMES[itemId]
            const matchesName =
              normalizedQuery.length === 0 ||
              names.en.toLocaleLowerCase('en-US').includes(normalizedQuery) ||
              names.ja.includes(normalizedQuery)
            return matchesName
          })
          const actual = itemIdsOf(query)
          expect(actual.slice().sort()).toStrictEqual(expected.slice().sort())
        }),
      { numRuns: 200 },
    )
  })

  it('filters the full category without dropping matching kernel items', () => {
    const food = creativeInventoryViewModel('', 'food').items
    expect(food.length).toBeGreaterThan(0)
    expect(food.every(({ category }) => category === 'food')).toBe(true)
    expect(food.map(({ itemId }) => itemId)).toContain('apple')
  })

  it('includes successful host names in search while keeping kernel names on each item', () => {
    const resolver: ItemDisplayNameResolver = (itemType, language) =>
      Result.succeed(
        itemType === 'apple'
          ? language === 'en'
            ? 'Orchard token'
            : '果樹のしるし'
          : ITEM_DISPLAY_NAMES[itemType][language],
      )
    const english = creativeInventoryViewModel('orchard token', 'all', resolver)
    const japanese = creativeInventoryViewModel('果樹のしるし', 'all', resolver)
    expect(english.items.map(({ itemId }) => itemId)).toContain('apple')
    expect(japanese.items.map(({ itemId }) => itemId)).toContain('apple')
    expect(english.items.find(({ itemId }) => itemId === 'apple')?.displayNames).toStrictEqual(
      ITEM_DISPLAY_NAMES.apple,
    )
  })

  it('keeps kernel-name search available when the host resolver throws', () => {
    const calls: Array<Readonly<{ itemType: ItemType; language: 'en' | 'ja' }>> = []
    const resolver: ItemDisplayNameResolver = (itemType, language) => {
      calls.push({ itemType, language })
      throw new Error('host display-name resolver failed')
    }
    const query = 'stone'
    const model = creativeInventoryViewModel(query, 'all', resolver)
    const expected = ITEM_TYPES.filter((itemId) => {
      const names = ITEM_DISPLAY_NAMES[itemId]
      return names.en.toLocaleLowerCase('en-US').includes(query) || names.ja.includes(query)
    })

    expect(calls.length).toBeGreaterThan(0)
    expect(model.items.map(({ itemId }) => itemId).slice().sort()).toStrictEqual(expected.slice().sort())
    expect(model.items.find(({ itemId }) => itemId === 'stone')?.displayNames).toStrictEqual(ITEM_DISPLAY_NAMES.stone)
  })

  it('returns a typed failure for unknown item identifiers', () => {
    expect(creativeItemCategoryOf('not_a_kernel_item')).toStrictEqual(
      Result.fail({ _tag: 'InvalidItemId' }),
    )
    expect(creativeTakeOperationOf('not_a_kernel_item')).toStrictEqual(
      Result.fail({ _tag: 'InvalidItemId' }),
    )
    expect(creativeTakeOperationOf('diamond')).toStrictEqual(
      Result.succeed({ kind: 'take-item', itemId: 'diamond' satisfies ItemType }),
    )
  })
})
