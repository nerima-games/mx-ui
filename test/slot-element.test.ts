import { describe, expect, it } from 'vitest'
import { createSlotElement, updateSlotElement } from '../src/application/slot-element'
import type { SlotView } from '../src/domain/hud-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

describe('createSlotElement', () => {
  it('wraps long item ids and counts while retaining their full text and hover values', () => {
    // Catches long slot text widening narrow inventory tracks instead of wrapping.
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view: SlotView = {
      countLabel: '100',
      durabilityPercent: undefined,
      empty: false,
      index: 0,
      itemId: 'minecraft:modded_item_with_a_long_identifier',
      selected: false,
    }

    updateSlotElement(slot, view)

    const root = fakeElement(slot.root)
    const item = root.find('data-mx-ui', 'slot-item')
    const count = root.find('data-mx-ui', 'slot-count')
    expect(item?.style.properties.get('overflow-wrap')).toBe('anywhere')
    expect(item?.textContent).toBe(view.itemId)
    expect(item?.attributes.get('title')).toBe(view.itemId)
    expect(count?.style.properties.get('overflow-wrap')).toBe('anywhere')
    expect(count?.textContent).toBe(view.countLabel)
    expect(count?.attributes.get('title')).toBe(view.countLabel)
  })
})
