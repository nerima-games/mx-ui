import { describe, expect, it } from 'vitest'
import { Result } from 'effect'
import { createSlotElement, updateSlotElement } from '../src/application/slot-element'
import { slotView } from '../src/domain/hud-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

describe('createSlotElement', () => {
  it('wraps long display names and counts while retaining their full text and hover values', () => {
    // Catches long slot text widening narrow inventory tracks instead of wrapping.
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const displayName = 'a long localized item display name that wraps inside the slot'
    const view = slotView(
      { itemId: 'stone', count: 100 },
      0,
      { selectedIndex: 0, itemDisplayNameOptions: { language: 'en', resolver: () => Result.succeed(displayName) } },
    )

    updateSlotElement(slot, view)

    const root = fakeElement(slot.root)
    const item = root.find('data-mx-ui', 'slot-item')
    const count = root.find('data-mx-ui', 'slot-count')
    expect(item?.style.properties.get('overflow-wrap')).toBe('anywhere')
    expect(item?.textContent).toBe(displayName)
    expect(item?.attributes.get('title')).toBe(displayName)
    expect(count?.style.properties.get('overflow-wrap')).toBe('anywhere')
    expect(count?.textContent).toBe(view.countLabel)
    expect(count?.attributes.get('title')).toBe(view.countLabel)
  })

  it('returns a typed failure for an explicitly null slot count label', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    Reflect.set(view, 'countLabel', null)

    const result = updateSlotElement(slot, view)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toStrictEqual({ _tag: 'InvalidSlotViewInput', field: 'countLabel' })
    }
    expect(fakeElement(slot.root).find('data-mx-ui', 'slot-count')?.textContent).toBe('')
  })

  it('returns a typed failure for an explicitly null item display name before projecting the slot', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    Reflect.set(view, 'itemDisplayName', null)
    const before = factory.mark()

    const result = updateSlotElement(slot, view)

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotViewInput', field: 'itemDisplayName' }))
    expect(factory.since(before)).toStrictEqual([])
  })

  it.each([
    { field: 'countLabel', value: 7 },
    { field: 'itemDisplayName', value: 7 },
  ])('returns a typed failure for a non-string $field value', ({ field, value }) => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    expect(Reflect.set(view, field, value)).toBe(true)
    const before = factory.mark()

    const result = updateSlotElement(slot, view)

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotViewInput', field }))
    expect(factory.since(before)).toStrictEqual([])
  })

  it('returns a typed failure for a malformed slot view before reading its fields', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const before = factory.mark()

    const result = Reflect.apply(updateSlotElement, undefined, [slot, null])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotViewInput', field: 'view' }))
    expect(factory.since(before)).toStrictEqual([])
  })
})
