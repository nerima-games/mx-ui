// @vitest-environment jsdom

import * as fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import type { FocusTarget } from '@nerima-games/mc-render'
import { focusTargetForElement, moveFocusTarget } from '../src/index'
import { createChestStorageView } from '../src/application/chest-storage-view'
import { CHEST_STORAGE_SLOT_COUNT, chestStorageViewModel } from '../src/domain/chest-storage-view-model'

afterEach(() => document.body.replaceChildren())

const GROUP_ATTRIBUTE = 'data-focus-group'
const INDEX_ATTRIBUTE = 'data-focus-index'
const COLUMNS_ATTRIBUTE = 'data-focus-columns'

const focusButton = (group: string, index: number, columns: number): HTMLButtonElement => {
  const button = document.createElement('button')
  button.setAttribute(GROUP_ATTRIBUTE, group)
  button.setAttribute(INDEX_ATTRIBUTE, String(index))
  button.setAttribute(COLUMNS_ATTRIBUTE, String(columns))
  return button
}

describe('public keyboard focus helpers', () => {
  it('returns no focus target for arbitrary non-element input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(focusTargetForElement(input)).toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })

  it('moves only to an available neighbor inside the selected group', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const first = focusButton('storage', 0, 2)
    const second = focusButton('storage', 1, 2)
    const lower = focusButton('storage', 3, 2)
    root.append(first, second, lower)
    first.focus()

    expect(moveFocusTarget(root, { group: 'storage', index: 0 }, 'right')).toBe(true)
    expect(document.activeElement).toBe(second)
    expect(moveFocusTarget(root, { group: 'storage', index: 1 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(lower)
    expect(moveFocusTarget(root, { group: 'storage', index: 3 }, 'right')).toBe(false)
  })

  it('resolves inventory slots and crafting output only while their owning structure is active', () => {
    const inventory = document.createElement('div')
    inventory.setAttribute('data-mx-ui', 'inventory')
    const region = document.createElement('div')
    region.setAttribute('data-mx-ui', 'region')
    region.setAttribute('data-region', 'main')
    region.setAttribute('data-region-state', 'slots')
    const slot = document.createElement('button')
    slot.setAttribute('data-mx-ui', 'slot')
    slot.setAttribute('data-slot-index', '2')
    const label = document.createElement('span')
    slot.append(label)
    region.append(slot)
    inventory.append(region)

    expect(focusTargetForElement(label)).toStrictEqual({ group: 'main', index: 2 })

    region.setAttribute('data-region-state', 'empty')
    expect(focusTargetForElement(label)).toBeUndefined()
    region.setAttribute('data-region-state', 'slots')
    region.removeAttribute('data-region')
    expect(focusTargetForElement(label)).toBeUndefined()
    region.setAttribute('data-region', 'main')
    slot.setAttribute('data-slot-index', '02')
    expect(focusTargetForElement(label)).toBeUndefined()
    slot.setAttribute('data-slot-index', '2')

    const output = document.createElement('button')
    output.setAttribute('data-mx-ui', 'crafting-output')
    const outcome = document.createElement('div')
    outcome.setAttribute('data-mx-ui', 'crafting-outcome')
    outcome.setAttribute('data-crafting-state', 'match')
    outcome.append(output)
    inventory.append(outcome)
    expect(focusTargetForElement(output)).toStrictEqual({ group: 'crafting-output', index: 0 })

    outcome.setAttribute('data-crafting-state', 'empty')
    expect(focusTargetForElement(output)).toBeUndefined()
    outcome.setAttribute('data-crafting-state', 'match')
    output.setAttribute('hidden', '')
    expect(focusTargetForElement(output)).toBeUndefined()
  })

  it('rejects unavailable or malformed marked members and falls back to one column for invalid geometry', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const first = focusButton('station', 0, 0)
    first.removeAttribute(COLUMNS_ATTRIBUTE)
    const malformed = focusButton('station', Number.MAX_SAFE_INTEGER + 1, 1)
    const malformedIndex = focusButton('station', 1, 1)
    malformedIndex.setAttribute(INDEX_ATTRIBUTE, '01')
    const disabled = focusButton('station', 1, 1)
    disabled.setAttribute('disabled', '')
    const ariaDisabled = focusButton('station', 1, 1)
    ariaDisabled.setAttribute('aria-disabled', 'true')
    const hiddenParent = document.createElement('div')
    hiddenParent.setAttribute('hidden', '')
    const hidden = focusButton('station', 1, 1)
    hiddenParent.append(hidden)
    root.append(first, malformed, malformedIndex, disabled, ariaDisabled, hiddenParent)

    first.focus()
    expect(focusTargetForElement(first)).toStrictEqual({ group: 'station', index: 0 })
    expect(moveFocusTarget(root, { group: 'station', index: 0 }, 'right')).toBe(false)
    expect(focusTargetForElement(disabled)).toBeUndefined()
    expect(focusTargetForElement(ariaDisabled)).toBeUndefined()
    expect(focusTargetForElement(hidden)).toBeUndefined()
    expect(focusTargetForElement(malformedIndex)).toBeUndefined()
    expect(focusTargetForElement(malformed)).toBeUndefined()

    const validNext = focusButton('station', 1, Number.MAX_SAFE_INTEGER + 1)
    root.append(validNext)
    first.setAttribute(COLUMNS_ATTRIBUTE, '0')
    expect(moveFocusTarget(root, { group: 'station', index: 0 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(validNext)
    first.setAttribute(COLUMNS_ATTRIBUTE, String(Number.MAX_SAFE_INTEGER + 1))
    expect(moveFocusTarget(root, { group: 'station', index: 0 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(validNext)
  })

  it('moves left and up within the same grid while respecting the requested direction', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const first = focusButton('grid', 0, 2)
    const second = focusButton('grid', 1, 2)
    const third = focusButton('grid', 2, 2)
    const fourth = focusButton('grid', 3, 2)
    root.append(first, second, third, fourth)

    expect(moveFocusTarget(root, { group: 'grid', index: 1 }, 'left')).toBe(true)
    expect(document.activeElement).toBe(first)
    expect(moveFocusTarget(root, { group: 'grid', index: 3 }, 'up')).toBe(true)
    expect(document.activeElement).toBe(second)
  })

  it('moves between chest and player grids with one tab stop and handles shorter chests', () => {
    const root = document.createElement('main')
    document.body.append(root)
    const view = createChestStorageView(document, root)
    view.render(
      chestStorageViewModel({
        chest: [],
        chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
        playerInventory: [],
        cursor: undefined,
        selectedSlot: undefined,
      }),
      { focusedSlot: { region: 'chest', slot: 18 }, status: 'Ready' },
    )

    const chestLastRow = root.querySelector<HTMLButtonElement>(
      '[data-interaction-region="chest"][data-interaction-slot="18"]',
    )
    const playerMainFirstRow = root.querySelector<HTMLButtonElement>(
      '[data-interaction-region="player"][data-interaction-slot="9"]',
    )
    const playerHotbar = root.querySelector<HTMLButtonElement>(
      '[data-interaction-region="player"][data-interaction-slot="0"]',
    )
    expect(chestLastRow?.getAttribute('tabindex')).toBe('0')
    expect(root.querySelectorAll('[data-mx-ui="slot"][tabindex="0"]')).toHaveLength(1)
    expect(chestLastRow?.getAttribute('data-focus-group')).toBe('chest-storage-slots')
    chestLastRow?.focus()

    expect(moveFocusTarget(root, { group: 'chest-storage-slots', index: 18 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(playerMainFirstRow)
    expect(moveFocusTarget(root, { group: 'chest-storage-slots', index: 45 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(playerHotbar)

    const shortRoot = document.createElement('main')
    document.body.append(shortRoot)
    const shortView = createChestStorageView(document, shortRoot)
    shortView.render(
      chestStorageViewModel({
        chest: [],
        chestSlotCount: 5,
        playerInventory: [],
        cursor: undefined,
        selectedSlot: undefined,
      }),
      { focusedSlot: { region: 'chest', slot: 4 }, status: 'Ready' },
    )
    const shortChestEnd = shortRoot.querySelector<HTMLButtonElement>(
      '[data-interaction-region="chest"][data-interaction-slot="4"]',
    )
    const shortPlayerColumn = shortRoot.querySelector<HTMLButtonElement>(
      '[data-interaction-region="player"][data-interaction-slot="13"]',
    )
    shortChestEnd?.focus()
    expect(moveFocusTarget(shortRoot, { group: 'chest-storage-slots', index: 4 }, 'down')).toBe(true)
    expect(document.activeElement).toBe(shortPlayerColumn)
    expect(focusTargetForElement(document.activeElement)).toStrictEqual({
      group: 'chest-storage-slots',
      index: 13,
    })
  })

  it('rejects malformed focus coordinates and missing groups across property inputs', () => {
    const root = document.createElement('div')
    fc.assert(
      fc.property(fc.integer({ min: -200, max: 200 }), (index) => {
        const target: FocusTarget = { group: 'missing', index }
        expect(moveFocusTarget(root, target, 'right')).toBe(false)
      }),
      { numRuns: 100 },
    )

    expect(moveFocusTarget(root, { group: '', index: 0 }, 'left')).toBe(false)
    expect(moveFocusTarget(root, { group: 'missing', index: -1 }, 'left')).toBe(false)
    expect(
      moveFocusTarget(root, { group: 'missing', index: Number.MAX_SAFE_INTEGER + 1 }, 'left'),
    ).toBe(false)
  })
})
