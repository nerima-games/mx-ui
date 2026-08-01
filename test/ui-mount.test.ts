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
    const runtime = makeUiMount({ root: host, motion: 'reduced' })

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
      root: host,
      menuCallbacks: {
        onStateChange: () => undefined,
        onCreateWorld: () => undefined,
        onLoadWorld: () => undefined,
        onOpenSettings,
      },
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
      if (name === 'data-menu-showing') throw new Error('render failed')
      return original.call(this, name, value)
    })
    const runtime = makeUiMount({ root: host })

    await expect(Effect.runPromise(runtime.start)).rejects.toThrow('Failed to mount mx-ui')

    expect(runtime.current()).toBeUndefined()
    expect(host.contains(unrelated)).toBe(true)
    expect(host.querySelector('[data-mx-ui="mount-root"]')).toBeNull()
  })
})
