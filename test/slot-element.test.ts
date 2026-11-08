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
})
