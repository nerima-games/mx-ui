// @vitest-environment jsdom

import { DEFAULT_SETTINGS, itemStack as makeItemStack } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnvilView } from '../src/application/anvil-view'
import { createChestStorageView } from '../src/application/chest-storage-view'
import { createEnchantingTableView } from '../src/application/enchanting-table-view'
import { createFurnaceView } from '../src/application/furnace-view'
import { createInventoryView } from '../src/application/inventory-view'
import { createSettingsView } from '../src/application/settings-view'
import { anvilViewModel } from '../src/domain/anvil-view-model'
import { CHEST_STORAGE_SLOT_COUNT, chestStorageViewModel } from '../src/domain/chest-storage-view-model'
import { enchantingTableViewModel } from '../src/domain/enchanting-table-view-model'
import { furnaceViewModel } from '../src/domain/furnace-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../src/domain/inventory-view-model'
import { settingsViewModel } from '../src/domain/settings-view-model'
import { TEST_BINDABLE_ACTIONS, TEST_DEFAULT_BINDINGS } from './fixtures/settings-input'

afterEach(() => document.body.replaceChildren())

describe('keyboard-activatable UI4 controls', () => {
  it('renders chest slots and close action as native buttons wired to the host', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const onFocusChange = vi.fn()
    const view = createChestStorageView(document, host, { onActivate, onClose, onFocusChange })
    view.render(
      chestStorageViewModel({
        chest: [],
        chestSlotCount: CHEST_STORAGE_SLOT_COUNT,
        playerInventory: [],
        cursor: undefined,
        selectedSlot: undefined,
      }),
      { focusedSlot: { region: 'chest', slot: 0 }, status: 'Ready' },
    )

    const slot = host.querySelector<HTMLButtonElement>('[data-region="chest"] [data-mx-ui="slot"]')
    const close = host.querySelector<HTMLButtonElement>('[data-interaction-target="chest-storage-close"]')
    expect(slot?.tagName).toBe('BUTTON')
    expect(slot?.querySelector('div')).toBeNull()
    expect(slot?.getAttribute('data-focus-group')).toBe('chest-storage-slots')
    slot?.click()
    slot?.focus()
    close?.click()
    expect(onActivate).toHaveBeenCalledWith({ region: 'chest', slot: 0 })
    expect(onFocusChange).toHaveBeenCalledWith({ region: 'chest', slot: 0 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders furnace slots as native buttons with focus direction metadata and host actions', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const onFocusChange = vi.fn()
    const view = createFurnaceView(document, host, { onActivate, onClose, onFocusChange })
    view.render(
      furnaceViewModel({
        input: undefined,
        fuel: undefined,
        output: undefined,
        cookProgress: 0,
        burnProgress: 0,
      }),
      { focusedSlot: 'input', status: 'Ready' },
    )

    const slot = host.querySelector<HTMLButtonElement>('[data-furnace-slot="fuel"]')
    expect(slot?.tagName).toBe('BUTTON')
    expect(slot?.querySelector('div')).toBeNull()
    expect(slot?.getAttribute('data-focus-group')).toBe('furnace')
    slot?.click()
    slot?.focus()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="furnace-close"]')?.click()
    expect(onActivate).toHaveBeenCalledWith('fuel')
    expect(onFocusChange).toHaveBeenCalledWith('fuel')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders anvil operation slots as native buttons wired to host actions', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const onFocusChange = vi.fn()
    const onNameChange = vi.fn()
    const view = createAnvilView(document, host, { onActivate, onClose, onFocusChange, onNameChange })
    view.render(
      anvilViewModel({
        primaryInput: undefined,
        secondaryInput: undefined,
        output: undefined,
        name: '',
        levelCost: 0,
        rejectionReason: undefined,
      }),
      { focusedTarget: 'primary-input', status: 'Ready' },
    )

    const slot = host.querySelector<HTMLButtonElement>('[data-operation-target="primary-input"]')
    expect(slot?.tagName).toBe('BUTTON')
    expect(slot?.querySelector('div')).toBeNull()
    expect(slot?.getAttribute('data-focus-group')).toBe('anvil-operation')
    slot?.click()
    slot?.focus()
    const nameInput = host.querySelector<HTMLInputElement>('[data-mx-ui="anvil-name"]')
    if (nameInput === null) {
      throw new Error('Expected the anvil name input')
    }
    nameInput.value = 'Iron blade'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.focus()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="anvil-close"]')?.click()
    expect(onActivate).toHaveBeenCalledWith('primary-input')
    expect(onFocusChange).toHaveBeenNthCalledWith(1, 'primary-input')
    expect(onFocusChange).toHaveBeenNthCalledWith(2, 'name')
    expect(onNameChange).toHaveBeenCalledWith('Iron blade')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders enchanting operations as native buttons wired to host actions', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const onFocusChange = vi.fn()
    const view = createEnchantingTableView(document, host, { onActivate, onClose, onFocusChange })
    view.render(
      enchantingTableViewModel({
        item: undefined,
        lapis: undefined,
        offers: [
          {
            enchantmentId: 'minecraft:sharpness',
            enchantmentLevel: 3,
            lapisCost: 1,
            levelCost: 12,
            rejectionReason: undefined,
          },
          undefined,
          undefined,
        ],
      }),
      { focusedTarget: 'item', status: 'Ready' },
    )

    const slot = host.querySelector<HTMLButtonElement>('[data-operation-target="item"]')
    const offer = host.querySelector<HTMLButtonElement>('[data-operation-target="offer-1"]')
    expect(slot?.tagName).toBe('BUTTON')
    expect(slot?.querySelector('div')).toBeNull()
    expect(slot?.getAttribute('data-focus-group')).toBe('enchanting-operation')
    slot?.click()
    slot?.focus()
    offer?.focus()
    host.querySelector<HTMLButtonElement>('[data-mx-ui="enchanting-close"]')?.click()
    expect(onActivate).toHaveBeenCalledWith('item')
    expect(onFocusChange).toHaveBeenCalledWith('item')
    expect(onFocusChange).toHaveBeenCalledWith('offer-1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uses native settings choices and sends an action the host can persist', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onChoiceChange = vi.fn()
    const onSliderChange = vi.fn()
    const onToggleChange = vi.fn()
    const onBindingActivate = vi.fn()
    const onClose = vi.fn()
    const view = createSettingsView(document, host, {
      onBindingActivate,
      onChoiceChange,
      onClose,
      onSliderChange,
      onToggleChange,
    })
    const result = settingsViewModel(DEFAULT_SETTINGS, TEST_DEFAULT_BINDINGS, TEST_BINDABLE_ACTIONS)
    if (!Result.isSuccess(result)) {
      throw new Error('Expected default settings to be valid')
    }
    view.render(result.success)

    const choice = host.querySelector<HTMLButtonElement>(
      '[data-settings-field="colorVisionCorrection"][data-setting-value="deuteranopia"]',
    )
    expect(choice?.tagName).toBe('BUTTON')
    choice?.click()
    expect(onChoiceChange).toHaveBeenCalledWith('colorVisionCorrection', 'deuteranopia')

    const slider = host.querySelector<HTMLInputElement>('[data-settings-field="uiScale"]')
    if (slider === null) {
      throw new Error('Expected the UI scale slider')
    }
    slider.value = '1.4'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onSliderChange).toHaveBeenCalledWith('uiScale', 1.4)

    host.querySelector<HTMLButtonElement>('[data-settings-field="audioEnabled"]')?.click()
    expect(onToggleChange).toHaveBeenCalledWith('audioEnabled', false)

    host.querySelector<HTMLButtonElement>('[data-binding-action="moveForward"]')?.click()
    expect(onBindingActivate).toHaveBeenCalledWith('moveForward')

    const close = host.querySelector<HTMLButtonElement>('[data-mx-ui="settings-close"]')
    expect(close?.getAttribute('aria-label')).toBe('Close settings')
    close?.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('forwards crafting-output focus and shift-click activation to the host', () => {
    const host = document.createElement('main')
    document.body.append(host)
    const onActivate = vi.fn()
    const onFocusChange = vi.fn()
    const view = createInventoryView(document, host, { onActivate, onFocusChange })
    const result = makeItemStack('stick', 1)
    if (Result.isFailure(result)) {
      throw new Error('Expected the test item stack to be valid')
    }
    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      crafting: {
        gridWidth: 2,
        grid: [undefined, undefined, undefined, undefined],
        result: { _tag: 'Match', output: result.success },
      },
    })
    view.render(model, { focused: { kind: 'crafting-output' }, status: 'Recipe ready' })

    const output = host.querySelector<HTMLButtonElement>('[data-mx-ui="crafting-output"]')
    expect(output?.tagName).toBe('BUTTON')
    output?.focus()
    output?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))

    expect(onFocusChange).toHaveBeenCalledWith({ kind: 'crafting-output' })
    expect(onActivate).toHaveBeenCalledWith({ kind: 'crafting-output' }, true)
  })
})
