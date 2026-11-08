import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Effect, Result } from 'effect'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DomElement,
  DomElementFactory,
  DomInputElement,
  DomInteractiveElement,
} from '../../src/application/dom-surface'
import { EMPTY_SAVE_LIST_NOTE } from '../../src/application/main-menu-view'
import { settingsViewModel } from '../../src/domain/settings-view-model'
import { SESSION_SCENARIOS } from '../../apps/browser-harness/scenarios/session'
import { defaultScenarioForScreen } from '../../apps/browser-harness/scenario-registry'
import type { ScenarioContext } from '../../apps/browser-harness/scenario-types'
import { FakeElement, fakeDocument, fakeElement, type FakeDocument } from '../fake-dom'

class SessionFakeElement extends FakeElement {
  override get textContent(): string {
    return super.textContent
  }

  override set textContent(value: string | null) {
    super.textContent = value
    this.children.length = 0
  }
}

class SessionFakeInteractiveElement extends SessionFakeElement implements DomInteractiveElement {
  focus(): void {
    this.record('focus', 'focus', undefined)
  }

  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
    if (callback === null) {
      return
    }
    const callbacks = this.eventListeners.get(type) ?? []
    const callbackIndex = callbacks.indexOf(callback)
    if (callbackIndex < 0) {
      return
    }
    callbacks.splice(callbackIndex, 1)
    if (callbacks.length === 0) {
      this.eventListeners.delete(type)
    }
    const listenerIndex = this.listeners.indexOf(type)
    if (listenerIndex >= 0) {
      this.listeners.splice(listenerIndex, 1)
    }
  }
}

class SessionFakeFactory implements DomElementFactory {
  private readonly backing: FakeDocument

  constructor(backing: FakeDocument) {
    this.backing = backing
  }

  createElement(tagName: 'input'): DomInputElement
  createElement(tagName: 'button'): DomInteractiveElement
  createElement(tagName: string): DomElement
  createElement(tagName: string): DomElement | DomInteractiveElement | DomInputElement {
    const element =
      tagName === 'button' || tagName === 'input'
        ? new SessionFakeInteractiveElement(tagName, this.backing.mutations)
        : new SessionFakeElement(tagName, this.backing.mutations)
    this.backing.created.push(element)
    return element
  }
}

const makeContext = () => {
  const factory = new SessionFakeFactory(fakeDocument())
  const host = fakeElement(factory.createElement('main'))
  const context: ScenarioContext = {
    factory,
    host,
    environment: {
      motion: 'full',
      cvd: 'off',
      width: 1280,
      height: 720,
      safe: 0,
      dpr: 1,
      textScale: 100,
      contrast: 'normal',
      background: 'mid',
    },
    time: 0,
    emitIntent: () => undefined,
    runSync: Effect.runSync,
  }
  return {
    factory,
    host,
    context,
  }
}

const makeNativeContext = (document: Document) => {
  const host = document.createElement('main')
  document.body.appendChild(host)
  const context: ScenarioContext = {
    factory: document,
    host,
    environment: {
      motion: 'full',
      cvd: 'off',
      width: 1280,
      height: 720,
      safe: 0,
      dpr: 1,
      textScale: 100,
      contrast: 'normal',
      background: 'mid',
    },
    time: 0,
    emitIntent: () => undefined,
    runSync: Effect.runSync,
  }
  return { host, context }
}

const scenario = (screen: string, id: string) => {
  const match = SESSION_SCENARIOS.find((entry) => entry.screen === screen && entry.id === id)
  if (match === undefined) {
    throw new Error(`Missing session scenario ${screen}/${id}`)
  }
  return match
}

const visibleSavedWorldCount = (root: FakeElement): number =>
  Array.from(root.walk()).filter(
    (element) =>
      element.attributes.get('data-mx-ui') === 'menu-world-row-container' &&
      !element.attributes.has('hidden'),
  ).length

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('session scenario catalog', () => {
  // Catches registry ID drift that would break stable browser-harness URLs.
  it('registers the requested surfaces with stable IDs and one default per added screen', () => {
    const ids = SESSION_SCENARIOS.map(({ screen, id }) => `${screen}/${id}`)
    expect(ids).toStrictEqual([
      'main-menu/root-panel',
      'main-menu/host-intents',
      'main-menu/new-world-survival',
      'main-menu/new-world-creative',
      'main-menu/new-world-long-name',
      'main-menu/load-world-empty',
      'main-menu/load-world-one',
      'main-menu/load-world-200',
      'main-menu/load-world-name-boundaries',
      'pause/paused',
      'settings/valid-boundaries',
      'settings/host-updates',
      'settings/invalid-nan-fov',
      'settings/invalid-high-fov',
      'onboarding/open',
      'onboarding/closed',
      'session-overlays/pause-only',
      'session-overlays/pause-settings-stack',
      'session-overlays/factory-none-open',
      'session-overlays/factory-settings-open',
      'session-overlays/factory-debug-hud-open',
      'session-overlays/factory-settings-debug-open',
      'chat/keyboard-intents',
    ])
    expect(new Set(ids).size).toBe(SESSION_SCENARIOS.length)
    expect(new Set(SESSION_SCENARIOS.map(({ screen }) => screen))).toStrictEqual(
      new Set(['main-menu', 'pause', 'settings', 'onboarding', 'session-overlays', 'chat']),
    )

    for (const screen of ['pause', 'settings', 'onboarding', 'session-overlays', 'chat']) {
      expect(defaultScenarioForScreen(screen)?.screen).toBe(screen)
      expect(SESSION_SCENARIOS.filter((entry) => entry.screen === screen && entry.isDefault)).toHaveLength(1)
    }
    expect(defaultScenarioForScreen('main-menu')?.id).toBe('default')
  })

  // Catches fake-DOM mounts that leak listeners or timers after repeated disposal.
  it('mounts fake-DOM scenarios and releases their listeners and timers on dispose', () => {
    vi.useFakeTimers()

    for (const entry of SESSION_SCENARIOS.filter(
      ({ id, screen }) =>
        !id.startsWith('factory-') &&
        !(screen === 'settings' && id === 'host-updates') &&
        screen !== 'chat',
    )) {
      const { context, host } = makeContext()
      const mounted = entry.mount(context)
      const root = fakeElement(mounted.root)

      expect(host.children).toContain(root)
      mounted.setTime(12.5)
      mounted.dispose()
      mounted.dispose()

      expect(root.listenersInTree()).toStrictEqual([])
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('mounts the native settings host-update scenario and removes its event listener on dispose', () => {
    const browserDom = new JSDOM()
    const { document } = browserDom.window
    vi.stubGlobal('document', document)

    try {
      const { context, host } = makeNativeContext(document)
      const mounted = scenario('settings', 'host-updates').mount(context)
      const mountPoint = host.querySelector<HTMLElement>('[data-settings-host-mount]')
      if (mountPoint === null) {
        throw new Error('Missing settings host mount point')
      }
      const removeListener = vi.spyOn(mountPoint, 'removeEventListener')

      mounted.dispose()

      expect(removeListener).toHaveBeenCalledWith('settings-host-update', expect.any(Function))
    } finally {
      browserDom.window.close()
    }
  })

  it('mounts the native chat scenario and removes its keyboard listener on dispose', () => {
    const browserDom = new JSDOM()
    const { document } = browserDom.window
    vi.stubGlobal('document', document)

    try {
      const { context } = makeNativeContext(document)
      const removeListener = vi.spyOn(document, 'removeEventListener')
      const mounted = scenario('chat', 'keyboard-intents').mount(context)

      mounted.dispose()

      expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))
    } finally {
      browserDom.window.close()
    }
  })

  // Catches factory scenarios that retain native resources; focus scheduling is tested separately from scenario timers.
  it.each([
    'factory-none-open',
    'factory-settings-open',
    'factory-debug-hud-open',
    'factory-settings-debug-open',
  ])('disposes native factory scenario %s without retaining resources', (id) => {
    const browserDom = new JSDOM()
    const { document } = browserDom.window
    vi.stubGlobal('document', document)
    vi.useFakeTimers()

    try {
      const { context, host } = makeNativeContext(document)
      const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
      const focus = vi.spyOn(browserDom.window.HTMLElement.prototype, 'focus').mockImplementation(() => undefined)
      const timerCountBeforeMount = vi.getTimerCount()
      const mounted = scenario('session-overlays', id).mount(context)

      expect(host.querySelector('[data-mx-ui="session-overlays"]')).toBe(mounted.root)
      mounted.setTime(12.5)
      mounted.dispose()
      mounted.dispose()

      expect(host.childElementCount).toBe(0)
      expect(removeDocumentListener).toHaveBeenCalledWith('keydown', expect.any(Function))
      const settingsWillOpen = id === 'factory-settings-open' || id === 'factory-settings-debug-open'
      expect(focus).toHaveBeenCalledTimes(settingsWillOpen ? 1 : 0)
      expect(
        vi.getTimerCount(),
        `${id} should leave no scenario-created timers beyond baseline ${timerCountBeforeMount}`,
      ).toBe(timerCountBeforeMount)
    } finally {
      browserDom.window.close()
    }
  })

  // Catches catalog entries that render another view, omit an overlay state, or fail to focus opened settings.
  it('renders the closed, settings, debug, and stacked states through createSessionOverlays', () => {
    const browserDom = new JSDOM()
    const { document } = browserDom.window
    vi.stubGlobal('document', document)
    const expectedStates = [
      { id: 'factory-none-open', settingsOpen: false, debugHudOpen: false },
      { id: 'factory-settings-open', settingsOpen: true, debugHudOpen: false },
      { id: 'factory-debug-hud-open', settingsOpen: false, debugHudOpen: true },
      { id: 'factory-settings-debug-open', settingsOpen: true, debugHudOpen: true },
    ] as const

    try {
      for (const { id, settingsOpen, debugHudOpen } of expectedStates) {
        const { context, host } = makeNativeContext(document)
        const mounted = scenario('session-overlays', id).mount(context)
        const factoryRoot = host.querySelector('[data-mx-ui="session-overlays"]')
        const debugHud = host.querySelector<HTMLOutputElement>('[data-mx-ui="debug-hud"]')
        const settingsDialog = host.querySelector<HTMLElement>('[data-mx-ui="settings"]')

        expect(factoryRoot).toBe(mounted.root)
        expect(factoryRoot).not.toBeNull()
        expect(debugHud?.hidden).toBe(!debugHudOpen)
        expect(settingsDialog?.hidden).toBe(!settingsOpen)
        expect(settingsDialog?.querySelectorAll('input[type="range"]')).toHaveLength(7)
        expect(settingsDialog?.querySelectorAll('[data-interaction-target="settings-choice"]')).toHaveLength(17)
        expect(settingsDialog?.querySelectorAll('[data-interaction-target="settings-binding"]')).toHaveLength(21)
        expect(settingsDialog?.querySelectorAll('[data-interaction-target="settings-toggle"]')).toHaveLength(2)
        if (settingsOpen) {
          expect(document.activeElement).toBe(settingsDialog?.querySelector('input[data-setting="mouseSensitivity"]'))
        }
        mounted.dispose()
      }
    } finally {
      browserDom.window.close()
    }
  })

  it('keeps the empty list distinct from one and two hundred saved worlds', () => {
    const empty = makeContext()
    const emptyMount = scenario('main-menu', 'load-world-empty').mount(empty.context)
    const emptyRoot = fakeElement(emptyMount.root)
    const emptyNote = emptyRoot.find('data-mx-ui', 'menu-note')
    expect(visibleSavedWorldCount(emptyRoot)).toBe(0)
    expect(emptyNote?.textContent).toBe(EMPTY_SAVE_LIST_NOTE)
    expect(emptyNote?.attributes.has('hidden')).toBe(false)
    emptyMount.dispose()

    const one = makeContext()
    const oneMount = scenario('main-menu', 'load-world-one').mount(one.context)
    expect(visibleSavedWorldCount(fakeElement(oneMount.root))).toBe(1)
    oneMount.dispose()

    const many = makeContext()
    const manyMount = scenario('main-menu', 'load-world-200').mount(many.context)
    expect(visibleSavedWorldCount(fakeElement(manyMount.root))).toBe(200)
    manyMount.dispose()
  })

  it('preserves empty, long, multiline, emoji, RTL, and mixed-width world names', () => {
    const { context } = makeContext()
    const mounted = scenario('main-menu', 'load-world-name-boundaries').mount(context)
    const root = fakeElement(mounted.root)
    const expectedWorlds = [
      { sessionId: 'empty-name', name: '' },
      { sessionId: 'long-name', name: `World ${'界'.repeat(256)}` },
      { sessionId: 'newline-name', name: 'First line\nSecond line' },
      { sessionId: 'emoji-name', name: '🧭🌌 Survival worlds 🎮' },
      { sessionId: 'rtl-name', name: 'العالم العربي' },
      { sessionId: 'mixed-width-name', name: '世界 ＡＢＣ ｶﾀｶﾅ' },
    ]

    for (const { sessionId, name } of expectedWorlds) {
      const loadButton = Array.from(root.walk()).find(
        (element) =>
          element.attributes.get('data-mx-ui') === 'menu-world-row' &&
          element.attributes.get('data-session-id') === sessionId,
      )
      expect(loadButton?.attributes.get('aria-label')).toBe(
        `Load ${name} (${sessionId})`,
      )
    }
    mounted.dispose()
  })

  it('renders settings validation failures as decode failures', () => {
    const invalid = settingsViewModel(
      { ...DEFAULT_SETTINGS, fovDegrees: Number.NaN },
      {},
      [],
    )
    expect(Result.isFailure(invalid)).toBe(true)
    if (Result.isFailure(invalid)) {
      expect(invalid.failure).toStrictEqual({ _tag: 'InvalidSettingsSnapshot' })
    }

    for (const id of ['invalid-nan-fov', 'invalid-high-fov']) {
      const { context } = makeContext()
      const mounted = scenario('settings', id).mount(context)
      const root = fakeElement(mounted.root)
      expect(root.attributes.get('data-harness-decode-failure')).toBe('settings')
      expect(root.attributes.get('role')).toBe('alert')
      expect(root.textContent).toBe('Settings snapshot decode failure')
      mounted.dispose()
    }
  })

  it('renders the valid settings boundary snapshot through the settings view', () => {
    const { context } = makeContext()
    const mounted = scenario('settings', 'valid-boundaries').mount(context)
    expect(fakeElement(mounted.root).attributes.get('data-mx-ui')).toBe('settings')
    mounted.dispose()
  })
})
