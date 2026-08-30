// @vitest-environment jsdom

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeUiMount } from '../src/application/ui-mount'
import { uiModule } from '../src/stages/registration'
import { initialMainMenuState, mainMenuViewModel, type SavedWorld } from '../src/domain/main-menu'
import {
  emptyInventorySnapshot,
  inventoryViewModel,
  type InventoryViewModel,
} from '../src/domain/inventory-view-model'

const SAVED_WORLDS: ReadonlyArray<SavedWorld> = [{ sessionId: 'session-1', name: 'Cliff House' }]

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('UiMount', () => {
  it('mounts the initial views and removes only its owned root', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const runtime = makeUiMount({ motion: 'reduced', root: host })

    await expect(Effect.runPromise(runtime.start)).resolves.toBe(uiModule)

    const mounted = runtime.current()
    expect(mounted?.root.parentElement).toBe(host)
    expect(host.querySelector('[data-mx-ui="hud"]')).not.toBeNull()
    expect(host.querySelector('[data-mx-ui="inventory"]')).not.toBeNull()
    expect(host.querySelector('[data-mx-ui="main-menu"]')).not.toBeNull()

    await Effect.runPromise(runtime.stop)
    await Effect.runPromise(runtime.stop)

    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('remounts cleanly and detaches listeners from the previous menu', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onOpenSettings = vi.fn()
    const runtime = makeUiMount({
      menuCallbacks: {
        onCreateWorld: () => undefined,
        onLoadWorld: () => undefined,
        onOpenSettings,
        onStateChange: () => undefined,
      },
      root: host,
    })

    await Effect.runPromise(runtime.start)
    const firstSettings = host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')
    expect(firstSettings).not.toBeNull()

    await Effect.runPromise(runtime.start)
    expect(host.querySelectorAll('[data-mx-ui="mount-root"]')).toHaveLength(1)
    firstSettings?.click()
    expect(onOpenSettings).not.toHaveBeenCalled()

    host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')?.click()
    expect(onOpenSettings).toHaveBeenCalledOnce()

    const currentSettings = host.querySelector<HTMLButtonElement>('[data-menu-entry="settings"]')
    await Effect.runPromise(runtime.stop)
    currentSettings?.click()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('rolls back owned DOM and listeners when initial rendering fails', async () => {
    const host = document.createElement('main')
    const unrelated = document.createElement('p')
    host.appendChild(unrelated)
    document.body.appendChild(host)
    const original = HTMLElement.prototype.setAttribute
    vi.spyOn(HTMLElement.prototype, 'setAttribute').mockImplementation(function (
      this: HTMLElement,
      name,
      value,
    ) {
      if (name === 'data-menu-showing') {
        throw new Error('render failed')
      }
      return original.call(this, name, value)
    })
    const runtime = makeUiMount({ root: host })

    await expect(Effect.runPromise(runtime.start)).rejects.toThrow('Failed to mount mx-ui')

    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })

  it('toggles the debug HUD and updates it from a typed snapshot', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    expect(debug?.hidden).toBe(true)
    expect(debug?.getAttribute('role')).toBe('region')
    expect(debug?.getAttribute('aria-label')).toBe('Debug information')
    expect(debug?.getAttribute('aria-live')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(debug?.hidden).toBe(false)

    runtime.updateDebug({
      chunk: { chunkX: 3, chunkZ: -2 },
      coordinates: { worldX: 12.5, worldY: 64, worldZ: -8.25 },
      facing: 'north',
      fps: 59.94,
    })
    expect(debug?.textContent).toContain('FPS: 59.9')
    expect(debug?.textContent).toContain('XYZ: 12.5 / 64.0 / -8.3')
    expect(debug?.textContent).toContain('Chunk: 3 / -2')
    expect(debug?.textContent).toContain('Facing: north')
  })

  it('opens accessible settings, reports changes, and restores focus', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const onMouseSensitivityChange = vi.fn()
    const onRenderDistanceChange = vi.fn()
    const onFieldOfViewChange = vi.fn()
    const onMasterVolumeChange = vi.fn()
    const runtime = makeUiMount({
      root: host,
      settingsCallbacks: {
        onFieldOfViewChange,
        onMasterVolumeChange,
        onMouseSensitivityChange,
        onRenderDistanceChange,
      },
    })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(document.activeElement?.getAttribute('data-setting')).toBe('mouseSensitivity')

    const changes = [
      ['mouseSensitivity', '1.25', onMouseSensitivityChange],
      ['renderDistance', '20', onRenderDistanceChange],
      ['fieldOfView', '90', onFieldOfViewChange],
      ['masterVolume', '0.4', onMasterVolumeChange],
    ] as const
    for (const [setting, value, callback] of changes) {
      const input = host.querySelector<HTMLInputElement>(`[data-setting="${setting}"]`)
      if (input === null) {
        throw new Error(`Missing ${setting} input`)
      }
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      expect(callback).toHaveBeenLastCalledWith(Number(value))
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }))
    expect(dialog?.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('traps inventory focus, activates the focused slot, and restores focus', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const onInventoryActivate = vi.fn()
    const runtime = makeUiMount({ onInventoryActivate, root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(false)
    const first = inventory?.querySelector<HTMLElement>('[tabindex="0"]')
    expect(document.activeElement).toBe(first)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Tab' }))
    const second = inventory?.querySelector<HTMLElement>('[tabindex="0"]')
    expect(second).not.toBe(first)
    expect(document.activeElement).toBe(second)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: 'Tab', shiftKey: true }),
    )
    expect(inventory?.querySelector<HTMLElement>('[tabindex="0"]')).toBe(first)
    expect(document.activeElement).toBe(first)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: ' ' }))
    expect(onInventoryActivate).toHaveBeenCalledTimes(2)
    expect(onInventoryActivate).toHaveBeenLastCalledWith({
      index: 0,
      kind: 'slot',
      region: 'hotbar',
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }))
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('REGRESSION: closing the inventory via a key does not throw when nothing was focused to restore', async () => {
    // `document.activeElement` is typed `Element | null` — jsdom never actually hands the keyboard
    // path a `null`, but the internal `closeInventory` closure still guards for it. Overriding the
    // getter for this one test is what reaches that path (see the analogous `openSettings` test
    // above) without weakening the real DOM assumption everywhere else.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
    Object.defineProperty(document, 'activeElement', { configurable: true, value: null })
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))
      const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
      expect(inventory?.hasAttribute('hidden')).toBe(false)

      expect(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' })),
      ).not.toThrow()
      expect(inventory?.hasAttribute('hidden')).toBe(true)
    } finally {
      if (typeof original !== 'undefined') {
        Object.defineProperty(Document.prototype, 'activeElement', original)
      }
      Reflect.deleteProperty(document, 'activeElement')
    }
  })

  // eslint-disable-next-line max-statements -- Covers the complete focus and activation flow.
  it('shares spatial inventory navigation between arrow keys and controller commands', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryActivate = vi.fn()
    const runtime = makeUiMount({ onInventoryActivate, root: host })
    await Effect.runPromise(runtime.start)

    expect(runtime.moveInventoryFocus('right')).toBe(false)
    expect(runtime.activateInventoryFocus()).toBe(false)
    runtime.openInventory()

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowRight' }))
    expect(runtime.moveInventoryFocus('down')).toBe(true)
    expect(runtime.activateInventoryFocus()).toBe(true)
    expect(onInventoryActivate).toHaveBeenLastCalledWith({
      index: 1,
      kind: 'slot',
      region: 'main',
    })

    const focused = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    expect(focused?.getAttribute('aria-label')).toContain('main slot 2')
    expect(document.activeElement).toBe(focused)
  })

  describe('equipment actions', () => {
    it('emits typed click and shift-click inventory actions', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const onInventoryAction = vi.fn()
      const runtime = makeUiMount({ onInventoryAction, root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      expect(runtime.activateInventoryFocus()).toBe(true)
      expect(runtime.activateInventoryFocus('shift-click')).toBe(true)
      expect(onInventoryAction.mock.calls).toStrictEqual([
        [{ kind: 'click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
        [{ kind: 'shift-click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
      ])
    })

    it('emits equipment drag actions in equip and unequip directions', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const onInventoryAction = vi.fn()
      const runtime = makeUiMount({ onInventoryAction, root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      const storageSlot = { index: 2, kind: 'slot', region: 'main' } as const
      const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
      expect([
        runtime.dragInventorySlot(storageSlot, headSlot),
        runtime.dragInventorySlot(headSlot, storageSlot),
      ]).toStrictEqual([true, true])
      expect(onInventoryAction.mock.calls).toStrictEqual([
        [{ kind: 'drag', source: storageSlot, target: headSlot }],
        [{ kind: 'drag', source: headSlot, target: storageSlot }],
      ])
    })

    it('projects an equipment rejection supplied by the host', async () => {
      const host = document.createElement('main')
      document.body.appendChild(host)
      const runtime = makeUiMount({ root: host })
      await Effect.runPromise(runtime.start)
      runtime.openInventory()

      const storageSlot = { index: 2, kind: 'slot', region: 'main' } as const
      const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
      runtime.updateInventoryActionState({
        action: { kind: 'drag', source: storageSlot, target: headSlot },
        kind: 'rejected',
        reason: 'The selected item cannot be worn on the head',
      })
      expect(host.querySelector('[data-mx-ui="inventory-status"]')?.textContent).toBe(
        'The selected item cannot be worn on the head',
      )
    })
  })

  it('does not open inventory behind settings', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.openSettings()
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'e' }))

    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(true)
  })

  it('detaches session keyboard listeners across remount and stop', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    const firstDebug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')

    await Effect.runPromise(runtime.start)
    const currentDebug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(firstDebug?.hidden).toBe(true)
    expect(currentDebug?.hidden).toBe(false)

    await Effect.runPromise(runtime.stop)
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(currentDebug?.hidden).toBe(false)
  })

  it('falls back to zero for a non-finite debug number instead of printing NaN or Infinity', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    runtime.updateDebug({
      chunk: { chunkX: 3, chunkZ: -2 },
      coordinates: { worldX: Number.NaN, worldY: 64, worldZ: -8.25 },
      fps: Number.POSITIVE_INFINITY,
    })
    expect(debug?.textContent).toContain('FPS: 0.0')
    expect(debug?.textContent).toContain('XYZ: 0.0 / 64.0 / -8.3')
  })

  it('closes settings when the close button is clicked', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    dialog?.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click()
    expect(dialog?.hidden).toBe(true)
  })

  it('closes settings on a second F10 press instead of leaving it stuck open', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F10' }))
    expect(dialog?.hidden).toBe(true)
  })

  it('ignores an auto-repeated F1 keydown so holding the key does not re-toggle the debug HUD', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const debug = host.querySelector<HTMLElement>('[data-mx-ui="debug-hud"]')
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1' }))
    expect(debug?.hidden).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'F1', repeat: true }))
    expect(debug?.hidden).toBe(false)
  })

  it('does not re-capture or re-focus when settings are opened a second time while already open', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openSettings()
    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)
    const mouseSensitivityInput = host.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')
    expect(document.activeElement).toBe(mouseSensitivityInput)

    mouseSensitivityInput?.blur()
    runtime.openSettings()

    expect(dialog?.hidden).toBe(false)
    expect(document.activeElement).not.toBe(mouseSensitivityInput)
  })

  it('is a no-op to close settings a second time when already closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(true)

    // Observable behavior is unchanged either way here: `restoreFocus` is
    // already null before the first close a session ever performs, so this
    // pins the coverage gap (the guard branch is reachable and exercised)
    // rather than a difference the fake or real DOM can see, the same
    // distinction docs/testing.md §5-1 draws for `setMotion`'s early return.
    runtime.closeSettings()

    expect(dialog?.hidden).toBe(true)
  })

  it('forwards menu callbacks: creating a world, changing panels, and loading a world the host supplies later', async () => {
    // `buildMenuCallbacks` wraps every `MainMenuCallbacks` entry mx-ui does not
    // own extra behaviour for (`onCreateWorld`, `onLoadWorld`, `onStateChange`)
    // in a passthrough closure. `onOpenSettings` is covered elsewhere by every
    // test that opens settings through the menu button; these three are not
    // exercised by anything else in this file. `onLoadWorld` specifically needs
    // a saved world to click, and `buildMountedViews` always mounts the menu
    // with an empty list — a host repopulates it the same way mx-compose would,
    // through `current().mainMenu`, the same view object mx-ui itself rendered.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onCreateWorld = vi.fn()
    const onLoadWorld = vi.fn()
    const onStateChange = vi.fn()
    const runtime = makeUiMount({
      menuCallbacks: { onCreateWorld, onLoadWorld, onStateChange, onOpenSettings: () => undefined },
      root: host,
    })
    await Effect.runPromise(runtime.start)

    host.querySelector<HTMLButtonElement>('[data-menu-entry="new-world"]')?.click()
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ panel: 'new-world' }))

    host.querySelector<HTMLButtonElement>('[data-menu-action="confirm"]')?.click()
    expect(onCreateWorld).toHaveBeenCalledOnce()

    runtime.current()?.mainMenu.render(mainMenuViewModel(initialMainMenuState, SAVED_WORLDS))
    host.querySelector<HTMLButtonElement>('[data-session-id="session-1"]')?.click()
    expect(onLoadWorld).toHaveBeenCalledExactlyOnceWith(SAVED_WORLDS[0])
  })

  it('closes an open inventory through the top-level API and restores focus, and no-ops when already closed', async () => {
    const host = document.createElement('main')
    const trigger = document.createElement('button')
    host.appendChild(trigger)
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    trigger.focus()
    runtime.openInventory()
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(inventory?.hasAttribute('hidden')).toBe(false)

    runtime.closeInventory()
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)

    // Already closed: the guard returns before touching focus or the attribute again.
    trigger.focus()
    runtime.closeInventory()
    expect(inventory?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('re-renders a live inventory from a host-pushed model through updateInventory, open or closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [{ item: 'minecraft:torch', count: 3 }] },
    })

    runtime.updateInventory(model)
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    const hotbarFirstSlot = () =>
      inventory?.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
    expect(hotbarFirstSlot()?.querySelector('[data-mx-ui="slot-item"]')?.textContent).toBe(
      'minecraft:torch',
    )

    runtime.openInventory()
    const other = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [{ item: 'minecraft:coal', count: 5 }] },
    })
    runtime.updateInventory(other)
    expect(hotbarFirstSlot()?.querySelector('[data-mx-ui="slot-item"]')?.textContent).toBe(
      'minecraft:coal',
    )
  })

  it('REGRESSION: updateInventory and updateInventoryActionState are no-ops before start (or after stop)', async () => {
    // `session.mounted` is `null` until `start` succeeds (and again after `stop`) — a host that
    // calls either update before mounting, or races a `stop`, must not crash.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })

    expect(() =>
      runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot)),
    ).not.toThrow()
    expect(() => runtime.updateInventoryActionState({ kind: 'idle' })).not.toThrow()

    await Effect.runPromise(runtime.start)
    await Effect.runPromise(runtime.stop)

    expect(() =>
      runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot)),
    ).not.toThrow()
    expect(() => runtime.updateInventoryActionState({ kind: 'idle' })).not.toThrow()
  })

  it('applies host-pushed settings through updateSettings without opening the dialog', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.updateSettings({ fieldOfView: 90, masterVolume: 0.5, mouseSensitivity: 2, renderDistance: 20 })

    runtime.openSettings()
    expect(host.querySelector<HTMLInputElement>('[data-setting="fieldOfView"]')?.value).toBe('90')
    expect(host.querySelector<HTMLInputElement>('[data-setting="renderDistance"]')?.value).toBe('20')
  })

  it('rejects stop when tearing down the previous mount throws', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const mounted = runtime.current()
    if (typeof mounted === 'undefined') {
      throw new Error('expected a mounted session')
    }
    vi.spyOn(mounted.overlays, 'destroy').mockImplementation(() => {
      throw new Error('destroy failed')
    })

    await expect(Effect.runPromise(runtime.stop)).rejects.toThrow('destroy failed')
  })

  it('recognizes all four arrow keys, not just the one the other navigation test happens to use', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    const focusedRegion = () =>
      host
        .querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
        ?.closest('[data-region]')
        ?.getAttribute('data-region')

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' }))
    expect(focusedRegion()).toBe('main')

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowRight' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowLeft' }))
    expect(focusedRegion()).toBe('main')

    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowUp' }))
    expect(focusedRegion()).toBe('hotbar')
  })

  it('emits a shift-click action from Shift+Enter and Shift+Space, not only through the direct API', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryAction = vi.fn()
    const runtime = makeUiMount({ onInventoryAction, root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: 'Enter', shiftKey: true }),
    )
    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: ' ', shiftKey: true }),
    )

    expect(onInventoryAction.mock.calls).toStrictEqual([
      [{ kind: 'shift-click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
      [{ kind: 'shift-click', target: { index: 0, kind: 'slot', region: 'hotbar' } }],
    ])
  })

  it('Shift+Tab wraps focus onto the crafting output when a match makes it navigable', async () => {
    // `inventoryTargets` (inventory-navigation.ts) appends `{ kind: 'crafting-output' }` LAST,
    // and only once `model.crafting.kind === 'match'`. Shift+Tab from the first real target wraps
    // backward onto whatever is last — this is the one path that sends real keyboard focus onto the
    // crafting-output square instead of a `{ focused: { kind: 'crafting-output' } }` passed directly
    // to `render()`, which is how every other test in this file reaches that state.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.updateInventory(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: { item: 'stick', count: 4 } },
        },
      }),
    )
    runtime.openInventory()

    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: 'Tab', shiftKey: true }),
    )

    const output = host.querySelector<HTMLElement>('[data-mx-ui="crafting-output"]')
    expect(document.activeElement).toBe(output)
  })

  it('an unrecognized key while the inventory is open falls through every handler untouched', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)
    runtime.openInventory()

    const before = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    const event = new KeyboardEvent('keydown', { cancelable: true, key: 'a' })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')).toBe(before)
  })

  it('rejects start when the mount root has no owning document', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    Object.defineProperty(host, 'ownerDocument', { value: null })
    const runtime = makeUiMount({ root: host })

    await expect(Effect.runPromise(runtime.start)).rejects.toThrow(
      'The mx-ui mount root has no ownerDocument',
    )
  })

  it('does not emit a drag action while the inventory is closed', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryAction = vi.fn()
    const runtime = makeUiMount({ onInventoryAction, root: host })
    await Effect.runPromise(runtime.start)

    const storageSlot = { index: 0, kind: 'slot', region: 'hotbar' } as const
    const headSlot = { kind: 'equipment-slot', slot: 'head' } as const
    expect(runtime.dragInventorySlot(storageSlot, headSlot)).toBe(false)
    expect(onInventoryAction).not.toHaveBeenCalled()
  })

  it('does not restore focus to a non-HTMLElement active element when the inventory closes', async () => {
    // `restoreFocusTarget` narrows `document.activeElement` (`Element | null`) to `HTMLElement`.
    // jsdom lets a focusable SVG element become `activeElement`, and `SVGElement` is real and not
    // an `HTMLElement` — a host page with an SVG icon focused when the inventory opens is exactly
    // this case, not a fabricated one.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svgIcon.setAttribute('tabindex', '0')
    host.appendChild(svgIcon)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    svgIcon.focus()
    expect(document.activeElement).toBe(svgIcon)
    runtime.openInventory()
    runtime.closeInventory()

    expect(document.activeElement).not.toBe(svgIcon)
  })

  it('falls back to the first real target when a host-pushed model drops the currently focused one', async () => {
    // `renderInventory`'s `targets.find(...) ?? targets[ZERO] ?? { kind: 'crafting-output' }` only
    // takes its first fallback when the session's remembered focus no longer names anything in the
    // new model's targets. Every other test in this file updates the inventory without disturbing
    // the target the focus already points at; this one moves focus onto the crafting output and
    // then pushes a model where the match — and the crafting-output target with it — is gone.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    runtime.updateInventory(
      inventoryViewModel({
        ...emptyInventorySnapshot,
        crafting: {
          gridWidth: 2,
          grid: [undefined, undefined, undefined, undefined],
          result: { _tag: 'Match', output: { item: 'stick', count: 4 } },
        },
      }),
    )
    runtime.openInventory()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: 'Tab', shiftKey: true }),
    )
    expect(document.activeElement).toBe(host.querySelector('[data-mx-ui="crafting-output"]'))

    runtime.updateInventory(inventoryViewModel(emptyInventorySnapshot))

    const hotbarFirstSlot = host.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
    expect(hotbarFirstSlot?.getAttribute('tabindex')).toBe('0')
  })

  it('opens with a host-supplied model through the top-level API, and no-ops when already open', async () => {
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const model = inventoryViewModel({
      ...emptyInventorySnapshot,
      inventory: { slots: [{ item: 'minecraft:diamond', count: 1 }] },
    })
    runtime.openInventory(model)
    const inventory = host.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
    expect(
      inventory
        ?.querySelector('[data-region="hotbar"] [data-mx-ui="slot"]')
        ?.querySelector('[data-mx-ui="slot-item"]')?.textContent,
    ).toBe('minecraft:diamond')

    const focusedBefore = document.activeElement
    runtime.openInventory()
    expect(document.activeElement).toBe(focusedBefore)
  })

  it('opens settings without capturing a focus target when the document reports none', async () => {
    // `document.activeElement` is typed `Element | null` — jsdom (and every real document with a
    // body) never actually hands `openSettings` a `null`, but `session-overlays.ts` still guards
    // for it since the type says a host's document could. Overriding the getter for this one test
    // is what reaches that path without weakening the real DOM assumption everywhere else.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
    Object.defineProperty(document, 'activeElement', { configurable: true, value: null })
    try {
      runtime.openSettings()
    } finally {
      if (typeof original !== 'undefined') {
        Object.defineProperty(Document.prototype, 'activeElement', original)
      }
      Reflect.deleteProperty(document, 'activeElement')
    }

    const dialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')
    expect(dialog?.hidden).toBe(false)

    runtime.closeSettings()
    expect(dialog?.hidden).toBe(true)
  })

  it('Tab does nothing against a hand-built model with no navigable target', async () => {
    // `InventoryViewModel` is host-suppliable directly — `inventoryTargets` can only ever see zero
    // targets for one that was hand-built or replayed from persistence rather than produced by
    // `inventoryViewModel`, which always seeds a non-empty `hotbar` and `main`.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const runtime = makeUiMount({ root: host })
    await Effect.runPromise(runtime.start)

    const empty: InventoryViewModel = {
      carried: undefined,
      crafting: { kind: 'unknown' },
      mergeTargets: { kind: 'unknown' },
      regions: [],
    }
    runtime.updateInventory(empty)
    runtime.openInventory()

    const before = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Tab' }))
    expect(host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')).toBe(before)
  })

  it('does not activate a hand-built offhand target beyond the one real offhand slot', async () => {
    // `inventoryActionTarget` (inventory-actions.ts) answers `null` for an offhand index other than
    // the one real slot `offhandRegion` ever builds — reachable only by handing `updateInventory` a
    // model whose offhand region carries more than one slot, which no real snapshot produces.
    const host = document.createElement('main')
    document.body.appendChild(host)
    const onInventoryAction = vi.fn()
    const runtime = makeUiMount({ onInventoryAction, root: host })
    await Effect.runPromise(runtime.start)

    const base = inventoryViewModel({
      ...emptyInventorySnapshot,
      offhand: { item: 'minecraft:shield', count: 1 },
    })
    const widenedOffhand: InventoryViewModel = {
      ...base,
      regions: base.regions.map((region) => {
        if (region.kind === 'slots' && region.id === 'offhand') {
          return { ...region, slots: [...region.slots, { ...region.slots[0]!, index: 1 }] }
        }
        return region
      }),
    }
    runtime.updateInventory(widenedOffhand)
    runtime.openInventory()

    document.dispatchEvent(
      new KeyboardEvent('keydown', { cancelable: true, key: 'Tab', shiftKey: true }),
    )
    const focused = host.querySelector<HTMLElement>('[data-mx-ui="inventory"] [tabindex="0"]')
    expect(focused?.closest('[data-region]')?.getAttribute('data-region')).toBe('offhand')

    expect(runtime.activateInventoryFocus()).toBe(false)
    expect(onInventoryAction).not.toHaveBeenCalled()
  })
})
