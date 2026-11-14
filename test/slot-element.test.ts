import { describe, expect, it } from 'vitest'
import { Result } from 'effect'
import { createSlotElement, setSlotButtonView, updateSlotElement } from '../src/application/slot-element'
import { enchantmentsComponent, storedEnchantmentsComponent } from '@nerima-games/mc-kernel'
import { type InventoryCarriedSlot, itemStack } from '@nerima-games/mc-sim'
import { type HotbarSlotSnapshot, slotView } from '../src/domain/hud-view-model'
import { slotSnapshotOf } from '../src/domain/inventory-view-model'
import { fakeDocument, fakeElement } from './fake-dom'

describe('createSlotElement', () => {
  it('keeps the minimum interaction target inclusive of the slot border', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const root = fakeElement(slot.root)

    expect(root.style.properties.get('box-sizing')).toBe('border-box')
    expect(root.style.properties.get('min-width')).toBe('24px')
    expect(root.style.properties.get('min-height')).toBe('24px')
  })

  it('applies a valid button label and reports success', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)

    const result = setSlotButtonView(slot, { disabled: false, focused: false, label: 'Stone, 1', tabStop: true })

    expect(result).toStrictEqual(Result.void)
    expect(fakeElement(slot.root).attributes.get('role')).toBe('button')
    expect(fakeElement(slot.root).attributes.get('aria-label')).toBe('Stone, 1')
  })

  it('returns a typed failure for an invalid runtime button label without changing the slot', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = {
      disabled: false,
      focused: false,
      label: 'valid label',
      tabStop: true,
    }
    expect(Reflect.set(view, 'label', 12)).toBe(true)
    const before = factory.mark()

    const result = setSlotButtonView(slot, view)

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotButtonLabel' }))
    expect(factory.since(before)).toStrictEqual([])
    expect(fakeElement(slot.root).attributes.has('role')).toBe(false)
  })

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
    { label: 'a non-record result', value: { language: 'en', result: null } },
    { label: 'a non-string success', value: { language: 'en', result: Result.succeed(null) } },
    { label: 'a non-record failure', value: { language: 'en', result: Result.fail(null) } },
    { label: 'an unknown failure tag', value: { language: 'en', result: Result.fail({ _tag: 'UnknownFailure' }) } },
    { label: 'an unsupported language', value: { language: 'fr', result: Result.succeed('stone') } },
  ])('returns a typed failure for $label in an item display name', ({ value }) => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    expect(Reflect.set(view, 'itemDisplayName', value)).toBe(true)

    expect(updateSlotElement(slot, view)).toStrictEqual(
      Result.fail({ _tag: 'InvalidSlotViewInput', field: 'itemDisplayName' }),
    )
  })

  it.each([
    { field: 'countLabel', value: 7 },
    { field: 'itemDisplayName', value: 7 },
    { field: 'enchantments', value: null },
    { field: 'enchantments', value: [null] },
    { field: 'enchantments', value: [{ id: 12, level: 1 }] },
    { field: 'enchantments', value: [{ id: 'sharpness', level: 0 }] },
    { field: 'storedEnchantments', value: null },
  ])('returns a typed failure for an invalid $field value $value', ({ field, value }) => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    expect(Reflect.set(view, field, value)).toBe(true)
    const before = factory.mark()

    const result = updateSlotElement(slot, view)

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotViewInput', field }))
    expect(factory.since(before)).toStrictEqual([])
  })

  it('accepts a supported enchantment at a positive level', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 2 }, 0, 0)
    expect(Reflect.set(view, 'enchantments', [{ id: 'sharpness', level: 2 }])).toBe(true)

    expect(updateSlotElement(slot, view)).toStrictEqual(Result.void)
  })

  it('returns a typed failure for a malformed slot view before reading its fields', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const before = factory.mark()

    const result = Reflect.apply(updateSlotElement, undefined, [slot, null])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidSlotViewInput', field: 'view' }))
    expect(factory.since(before)).toStrictEqual([])
  })

  it('renders an icon when a structured clone strips the Effect Result prototype', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView(
      { itemId: 'stone', count: 1 },
      0,
      {
        selectedIndex: 0,
        itemDisplayNameOptions: {
          language: 'en',
          resolver: () => Result.succeed('Stone'),
          iconResolver: () => Result.succeed({ kind: 'url', url: 'https://assets.example/stone.png' }),
        },
      },
    )
    const icon = view.itemIcon
    expect(icon).toBeDefined()
    if (typeof icon === 'undefined') {
      return
    }

    updateSlotElement(slot, { ...view, itemIcon: { result: structuredClone(icon.result) } })

    const root = fakeElement(slot.root)
    expect(root.find('aria-hidden', 'true')?.attributes.get('src')).toBe('https://assets.example/stone.png')
    expect(root.find('data-mx-ui', 'slot-item')?.textContent).toBe('Stone')
  })
})

describe('slot names and icons supplied across a host boundary', () => {
  const stoneWithIcon = (icon: unknown) =>
    slotView(
      { itemId: 'stone', count: 1 },
      0,
      {
        selectedIndex: 0,
        itemDisplayNameOptions: {
          language: 'en',
          resolver: () => Result.succeed('Stone'),
          iconResolver: () => Result.succeed(icon),
        },
      },
    )

  it('shows a host name from a tagged success record', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 1 }, 0, 0)
    Reflect.set(view, 'itemDisplayName', { language: 'en', result: { _tag: 'Success', success: 'Host Stone' } })

    expect(updateSlotElement(slot, view)).toStrictEqual(Result.void)
    expect(fakeElement(slot.root).find('data-mx-ui', 'slot-item')?.textContent).toBe('Host Stone')
  })

  it.each([
    { label: 'an empty cloned name', result: { success: '' } },
    {
      label: 'a cloned name whose property descriptor cannot be read',
      result: new Proxy({ success: 'Host Stone' }, {
        getOwnPropertyDescriptor: () => {
          throw new Error('host value must not be trusted')
        },
      }),
    },
  ])('shows an unknown item for $label instead of falling back to another name', ({ result }) => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = slotView({ itemId: 'stone', count: 1 }, 0, 0)
    Reflect.set(view, 'itemDisplayName', { language: 'en', result })

    expect(updateSlotElement(slot, view)).toStrictEqual(Result.void)
    expect(fakeElement(slot.root).find('data-mx-ui', 'slot-item')?.textContent).toBe('Unknown item')
  })

  it('shows an unknown item for an item id the kernel does not know', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)

    expect(updateSlotElement(slot, slotView({ itemId: 'not_a_kernel_item', count: 2 }, 0, 0))).toStrictEqual(Result.void)
    expect(fakeElement(slot.root).find('data-mx-ui', 'slot-item')?.textContent).toBe('Unknown item')
  })

  it('crops and scales an atlas icon to the 16px slot icon box', () => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const view = stoneWithIcon({
      kind: 'atlas',
      url: 'https://assets.example/atlas.png',
      x: 24,
      y: 32,
      width: 8,
      height: 4,
      atlasWidth: 32,
      atlasHeight: 40,
    })

    expect(updateSlotElement(slot, view)).toStrictEqual(Result.void)
    const root = fakeElement(slot.root)
    const wrapper = fakeElement(root.find('data-mx-ui', 'slot-icon'))
    const image = fakeElement(root.find('aria-hidden', 'true'))
    expect(wrapper.attributes.has('hidden')).toBe(false)
    expect(image.attributes.get('src')).toBe('https://assets.example/atlas.png')
    expect(wrapper.style.properties.get('width')).toBe('16px')
    expect(wrapper.style.properties.get('height')).toBe('8px')
    expect(image.style.properties.get('left')).toBe('-48px')
    expect(image.style.properties.get('top')).toBe('-64px')
    expect(image.style.properties.get('width')).toBe('64px')
    expect(image.style.properties.get('height')).toBe('80px')
  })

  it.each([
    { label: 'a non-object icon result', result: null },
    {
      label: 'an icon result whose keys cannot be listed',
      result: new Proxy({}, {
        ownKeys: () => {
          throw new Error('host value must not be trusted')
        },
      }),
    },
  ])('hides a previously shown icon when a later view carries $label', ({ result }) => {
    const factory = fakeDocument()
    const slot = createSlotElement(factory, 0)
    const shown = stoneWithIcon({ kind: 'url', url: 'https://assets.example/stone.png' })
    expect(updateSlotElement(slot, shown)).toStrictEqual(Result.void)
    const root = fakeElement(slot.root)
    expect(root.find('data-mx-ui', 'slot-icon')?.attributes.has('hidden')).toBe(false)

    const next = stoneWithIcon({ kind: 'url', url: 'https://assets.example/stone.png' })
    Reflect.set(next, 'itemIcon', { result })
    expect(updateSlotElement(slot, next)).toStrictEqual(Result.void)
    expect(root.find('data-mx-ui', 'slot-icon')?.attributes.has('hidden')).toBe(true)
    expect(root.find('aria-hidden', 'true')?.attributes.has('src')).toBe(false)
    expect(root.find('data-mx-ui', 'slot-item')?.textContent).toBe('Stone')
  })
})

const succeeded = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isSuccess(result)) {
    return result.success
  }
  return expect.fail(`expected success: ${JSON.stringify(result.failure)}`)
}

const bookWith = (enchantments: Record<string, number>, storedEnchantments: Record<string, number>) => {
  const book = succeeded(itemStack('book', 1))
  return {
    ...book,
    components: {
      ...book.components,
      enchantments: succeeded(enchantmentsComponent(enchantments)),
      storedEnchantments: succeeded(storedEnchantmentsComponent(storedEnchantments)),
    },
  }
}

describe('active and stored enchantments', () => {
  const bookView = (slot: InventoryCarriedSlot | HotbarSlotSnapshot) =>
    slotView(slot, 0, {
      selectedIndex: 0,
      itemDisplayNameOptions: { language: 'en', resolver: () => Result.succeed('Book') },
    })

  it.each([
    {
      name: '(a) empty enchantments with stored enchantments lists only the stored ones',
      active: {},
      stored: { mending: 1 },
      expectedActive: undefined,
      expectedStored: [{ id: 'mending', level: 1 }],
      tooltip: 'Book\nCount: 1\nStored enchantments: mending 1',
    },
    {
      name: '(b) enchantments with empty stored enchantments lists only the active ones',
      active: { sharpness: 5 },
      stored: {},
      expectedActive: [{ id: 'sharpness', level: 5 }],
      expectedStored: undefined,
      tooltip: 'Book\nCount: 1\nEnchantments: sharpness 5',
    },
    {
      name: '(c) both empty lists neither and adds no enchantment tooltip line',
      active: {},
      stored: {},
      expectedActive: undefined,
      expectedStored: undefined,
      tooltip: 'Book\nCount: 1',
    },
    {
      name: '(d) both non-empty lists both with the stored line before the enchantments line',
      active: { sharpness: 5 },
      stored: { mending: 1 },
      expectedActive: [{ id: 'sharpness', level: 5 }],
      expectedStored: [{ id: 'mending', level: 1 }],
      tooltip: 'Book\nCount: 1\nStored enchantments: mending 1\nEnchantments: sharpness 5',
    },
  ])('$name', ({ active, stored, expectedActive, expectedStored, tooltip }) => {
    const stack = bookWith(active, stored)
    const views = [bookView(stack), bookView(slotSnapshotOf(stack))]

    for (const view of views) {
      expect(view.enchantments).toStrictEqual(expectedActive)
      expect(view.storedEnchantments).toStrictEqual(expectedStored)
      expect(Reflect.has(view, 'enchantments')).toBe(typeof expectedActive !== 'undefined')
      expect(Reflect.has(view, 'storedEnchantments')).toBe(typeof expectedStored !== 'undefined')

      const factory = fakeDocument()
      const slot = createSlotElement(factory, 0)
      expect(updateSlotElement(slot, view)).toStrictEqual(Result.void)
      expect(fakeElement(slot.root).find('data-mx-ui', 'slot-tooltip')?.textContent).toBe(tooltip)
    }
  })

  it('copies each enchantment component into its own snapshot field', () => {
    const snapshot = slotSnapshotOf(bookWith({ sharpness: 5 }, { mending: 1 }))

    expect(snapshot.enchantments).toStrictEqual({ sharpness: 5 })
    expect(snapshot.storedEnchantments).toStrictEqual({ mending: 1 })
  })
})
