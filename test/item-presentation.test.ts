import { EnchantmentLevel, ITEM_DISPLAY_NAMES, isItemType } from '@nerima-games/mc-kernel'
import * as fc from 'fast-check'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { itemDisplayNameText, itemDisplayNameValue } from '../src/application/item-display-name'
import { createHudView } from '../src/application/hud-view'
import { createSlotElement, setSlotKeyboardFocus, updateSlotElement } from '../src/application/slot-element'
import { HOTBAR_SLOT_COUNT, hudViewModel, slotView, spawnSnapshot } from '../src/domain/hud-view-model'
import {
  defaultItemDisplayNameResolver,
  itemDisplayNameView,
  resolveItemDisplayName,
} from '../src/domain/item-display-name'
import { resolveItemIcon } from '../src/domain/item-icon'
import { fakeDocument, fakeElement } from './fake-dom'

describe('item presentation', () => {
  it('property: arbitrary item ids resolve to a name or an independently expected typed failure', () => {
    fc.assert(
      fc.property(fc.anything(), (itemId) => {
        const resolved = resolveItemDisplayName(itemId, 'en')
        const isKnownItemId =
          isItemType(itemId) ||
          (typeof itemId === 'string' &&
            itemId.startsWith('minecraft:') &&
            isItemType(itemId.slice('minecraft:'.length)))
        if (!isKnownItemId) {
          expect(resolved).toStrictEqual(Result.fail({ _tag: 'InvalidItemId' }))
          return
        }
        if (Result.isFailure(resolved)) {
          expect(resolved.failure).toStrictEqual({ _tag: 'ItemDisplayNameUnavailable' })
          return
        }
        expect(resolved.success).toBeTypeOf('string')
        expect(resolved.success.length).toBeGreaterThan(0)
        expect(resolved.success).not.toContain('minecraft:')
      }),
      { numRuns: 200 },
    )
  })

  it('uses bilingual kernel names by default and keeps the host resolver override', () => {
    const english = itemDisplayNameView('minecraft:stone')
    const japanese = itemDisplayNameView('stone', { language: 'ja' })
    expect(Result.isSuccess(english.result)).toBe(true)
    expect(Result.isSuccess(japanese.result)).toBe(true)
    if (Result.isSuccess(english.result) && Result.isSuccess(japanese.result)) {
      expect(english.result.success).toBe(ITEM_DISPLAY_NAMES.stone.en)
      expect(japanese.result.success).toBe(ITEM_DISPLAY_NAMES.stone.ja)
    }

    const overridden = resolveItemDisplayName('stone', 'en', () => Result.succeed('Host Stone'))
    expect(Result.isSuccess(overridden)).toBe(true)
    if (Result.isSuccess(overridden)) {
      expect(overridden.success).toBe('Host Stone')
    }

    const hostFailure = resolveItemDisplayName('stone', 'en', () => {
      throw new Error('host display-name resolver failed')
    })
    expect(hostFailure).toStrictEqual(Result.fail({ _tag: 'ItemDisplayNameUnavailable' }))

    const malformedResult = Object.defineProperty(
      Object.create(Object.getPrototypeOf(Result.succeed('safe'))),
      'success',
      { get: () => { throw new Error('result accessors must not execute') } },
    )
    const malformedHostResult = resolveItemDisplayName('stone', 'en', () => malformedResult)
    expect(malformedHostResult).toStrictEqual(Result.fail({ _tag: 'ItemDisplayNameUnavailable' }))

    const unknownItem = resolveItemDisplayName('minecraft:no_such_item', 'en')
    expect(Result.isFailure(unknownItem)).toBe(true)
    if (Result.isFailure(unknownItem)) {
      expect(unknownItem.failure).toStrictEqual({ _tag: 'InvalidItemId' })
    }
    expect(defaultItemDisplayNameResolver('stone', 'en')).toStrictEqual(Result.succeed(ITEM_DISPLAY_NAMES.stone.en))
  })

  it('keeps a host display name when a Result crosses a structured-clone boundary', () => {
    const view = slotView(
      { itemId: 'stone', count: 2 },
      0,
      {
        selectedIndex: 0,
        itemDisplayNameOptions: {
          language: 'en',
          resolver: () => Result.succeed('Host Stone'),
        },
      },
    )
    const { itemDisplayName } = view
    expect(itemDisplayName).toBeDefined()
    if (typeof itemDisplayName === 'undefined') {
      return
    }

    const clonedResult = structuredClone(itemDisplayName.result)
    expect(clonedResult).toStrictEqual({ success: 'Host Stone' })
    const serializedView = {
      ...view,
      itemDisplayName: {
        language: itemDisplayName.language,
        result: clonedResult,
      },
    }
    expect(itemDisplayNameText(serializedView, 'en')).toBe('Host Stone')
    expect(itemDisplayNameValue(serializedView, 'en')).toBe('Host Stone')

    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    updateSlotElement(slot, serializedView)
    expect(fakeElement(slot.root).find('data-mx-ui', 'slot-item')?.textContent).toBe('Host Stone')

    const parent = fakeElement(factory.createElement('main'))
    const hud = createHudView(factory, parent, 'full')
    const emptyHotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, (): undefined => undefined)
    const model = hudViewModel(spawnSnapshot, emptyHotbar, 0)
    hud.render({
      ...model,
      hotbar: model.hotbar.map((hotbarSlot, index) => index === 0 ? serializedView : hotbarSlot),
    })
    expect(fakeElement(hud.root).findAll('data-mx-ui', 'slot')[0]?.attributes.get('aria-label')).toBe(
      'Hotbar slot 1, Host Stone, 2',
    )
  })

  it('accepts absolute icon URLs and bounded atlas rectangles', () => {
    const noResolver = slotView({ itemId: 'stone', count: 1 }, 0, 0)
    expect(noResolver.itemIcon).toStrictEqual({
      result: Result.fail({ _tag: 'ItemIconUnavailable' }),
    })

    const url = resolveItemIcon('minecraft:stone', () =>
      Result.succeed({ kind: 'url', url: 'https://assets.example/stone.png' }),
    )
    expect(Result.isSuccess(url)).toBe(true)

    const atlas = resolveItemIcon('stone', () =>
      Result.succeed({
        kind: 'atlas',
        url: 'https://assets.example/atlas.png',
        x: 24,
        y: 32,
        width: 8,
        height: 8,
        atlasWidth: 32,
        atlasHeight: 40,
      }),
    )
    expect(Result.isSuccess(atlas)).toBe(true)
  })

  it('property: arbitrary identifiers yield a validated icon or an expected typed failure', () => {
    const resolvedIcon = resolveItemIcon('stone', () =>
      Result.succeed({ kind: 'url', url: 'https://assets.example/item.png' }),
    )
    expect(Result.isSuccess(resolvedIcon)).toBe(true)
    if (Result.isFailure(resolvedIcon)) {
      return
    }
    const icon = resolvedIcon.success
    fc.assert(
      fc.property(fc.anything(), (itemId) => {
        const result = resolveItemIcon(itemId, () => Result.succeed(icon))
        const normalizedItemId =
          typeof itemId === 'string' && itemId.startsWith('minecraft:')
            ? itemId.slice('minecraft:'.length)
            : itemId
        const knownItemId = typeof normalizedItemId === 'string' && isItemType(normalizedItemId)

        if (knownItemId) {
          expect(result).toStrictEqual(Result.succeed(icon))
        } else {
          expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidItemId' }))
        }
      }),
      { numRuns: 200 },
    )
  })

  it('returns typed failures for missing, malformed, or unsafe host icon results', () => {
    const unavailable = resolveItemIcon('stone')
    expect(Result.isFailure(unavailable)).toBe(true)
    if (Result.isFailure(unavailable)) {
      expect(unavailable.failure).toStrictEqual({ _tag: 'ItemIconUnavailable' })
    }

    const thrown = resolveItemIcon('stone', () => {
      throw new Error('host resolver failed')
    })
    expect(Result.isFailure(thrown)).toBe(true)
    if (Result.isFailure(thrown)) {
      expect(thrown.failure).toStrictEqual({ _tag: 'ItemIconUnavailable' })
    }

    const scriptUrl = ['javascript', 'alert(1)'].join(':')
    for (const url of [
      'relative.png',
      scriptUrl,
      'https://user:secret@assets.example/stone.png',
    ]) {
      const result = resolveItemIcon('stone', () => Result.succeed({ kind: 'url', url }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toStrictEqual({ _tag: 'InvalidItemIcon' })
      }
    }

    const outOfBounds = resolveItemIcon('stone', () =>
      Result.succeed({
        kind: 'atlas',
        url: 'https://assets.example/atlas.png',
        x: Number.MAX_SAFE_INTEGER,
        y: 0,
        width: 1,
        height: 1,
        atlasWidth: Number.MAX_SAFE_INTEGER,
        atlasHeight: 1,
      }),
    )
    expect(Result.isFailure(outOfBounds)).toBe(true)
    if (Result.isFailure(outOfBounds)) {
      expect(outOfBounds.failure).toStrictEqual({ _tag: 'InvalidItemIcon' })
    }

    const accessor = Object.defineProperty({ kind: 'url' }, 'url', {
      get: () => {
        throw new Error('accessor must not execute')
      },
    })
    const malformedResult = resolveItemIcon('stone', () => Result.succeed(accessor))
    expect(Result.isFailure(malformedResult)).toBe(true)
    if (Result.isFailure(malformedResult)) {
      expect(malformedResult.failure).toStrictEqual({ _tag: 'InvalidItemIcon' })
    }
  })

  it('keeps a text fallback and exposes a complete tooltip while the slot is focused', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView(
      {
        itemId: 'diamond_sword',
        count: 3,
        durability: 0.47,
        enchantments: { sharpness: EnchantmentLevel(5) },
      },
      0,
      {
        selectedIndex: 0,
        itemDisplayNameOptions: {
          language: 'en',
          iconResolver: () => Result.fail({ _tag: 'ItemIconUnavailable' }),
        },
      },
    )

    updateSlotElement(slot, view)
    const root = fakeElement(slot.root)
    const item = root.find('data-mx-ui', 'slot-item')
    const icon = root.find('data-mx-ui', 'slot-icon')
    const tooltip = root.find('role', 'tooltip')
    expect(item?.textContent).toBe(ITEM_DISPLAY_NAMES.diamond_sword.en)
    expect(item?.textContent?.length).toBeGreaterThan(0)
    expect(icon?.attributes.has('hidden')).toBe(true)
    expect(tooltip?.attributes.has('hidden')).toBe(true)

    setSlotKeyboardFocus(slot, true)
    expect(tooltip?.attributes.has('hidden')).toBe(false)
    expect(root.attributes.get('aria-describedby')).toBe(tooltip?.attributes.get('id'))
    expect(tooltip?.textContent).toContain(ITEM_DISPLAY_NAMES.diamond_sword.en)
    expect(tooltip?.textContent).toContain('Count: 3')
    expect(tooltip?.textContent).toContain('Durability: 47%')
    expect(tooltip?.textContent).toContain('Enchantments: sharpness 5')
  })

  it('projects a resolved icon to an image without replacing its text label', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView(
      { itemId: 'stone', count: 1 },
      0,
      {
        selectedIndex: 0,
        itemDisplayNameOptions: {
          language: 'en',
          iconResolver: () => Result.succeed({ kind: 'url', url: 'https://assets.example/stone.png' }),
        },
      },
    )

    updateSlotElement(slot, view)
    const root = fakeElement(slot.root)
    const image = root.find('aria-hidden', 'true')
    expect(image?.attributes.get('src')).toBe('https://assets.example/stone.png')
    expect(root.find('data-mx-ui', 'slot-item')?.textContent).toBe(ITEM_DISPLAY_NAMES.stone.en)
  })
})
