// @vitest-environment jsdom

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeUiMount } from '../src/application/ui-mount'
import { uiModule } from '../src/stages/registration'

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
      chunk: { x: 3, z: -2 },
      coordinates: { x: 12.5, y: 64, z: -8.25 },
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
})
