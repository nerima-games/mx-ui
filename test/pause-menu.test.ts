import { describe, expect, it } from 'vitest'
import {
  SAVE_AND_QUIT_TO_TITLE_INTENT,
  closePauseSettings,
  escapePauseMenu,
  openPauseSettings,
  pauseMenuViewModel,
  resumePauseMenu,
  type PauseMenuHostIntent,
} from '../src/domain/pause-menu-view-model'
import {
  PAUSE_MENU_ACTION_LABEL,
  createPauseMenuView,
  type PauseMenuCallbacks,
} from '../src/application/pause-menu-view'
import { emptyModalStack, type ModalStack } from '../src/domain/modal-stack'
import type { DomElement, DomElementFactory, DomInputElement, DomInteractiveElement } from '../src/application/dom-surface'
import { fakeDocument, fakeElement, FakeInteractiveElement, type FakeDocument, type FakeElement } from './fake-dom'

class RemovableInteractiveElement extends FakeInteractiveElement {
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
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

class RemovableFakeDocument implements DomElementFactory {
  private readonly base: FakeDocument

  constructor(base: FakeDocument) {
    this.base = base
  }

  createElement(tagName: 'input'): DomInputElement
  createElement(tagName: 'button'): DomInteractiveElement
  createElement(tagName: string): DomElement
  createElement(tagName: string): DomElement | DomInteractiveElement | DomInputElement {
    if (tagName === 'button' || tagName === 'input') {
      const element = new RemovableInteractiveElement(tagName, this.base.mutations)
      this.base.created.push(element)
      return element
    }
    return this.base.createElement(tagName)
  }
}

const mount = (overrides: Partial<PauseMenuCallbacks> = {}) => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const stackChanges: Array<ModalStack> = []
  const hostIntents: Array<PauseMenuHostIntent> = []
  const callbacks: PauseMenuCallbacks = {
    onHostIntent: (intent) => hostIntents.push(intent),
    onModalStackChange: (modalStack) => stackChanges.push(modalStack),
    ...overrides,
  }
  const view = createPauseMenuView(new RemovableFakeDocument(factory), parent, callbacks)
  return {
    factory,
    hostIntents,
    parent,
    root: fakeElement(view.root),
    stackChanges,
    view,
  }
}

const accessibleButtons = (root: FakeElement): ReadonlyArray<FakeElement> =>
  root.findAll('data-mx-ui', 'pause-menu-action')

const focusedActions = (
  factory: ReturnType<typeof fakeDocument>,
  from: number,
): ReadonlyArray<string | undefined> =>
  factory
    .since(from)
    .filter((mutation) => mutation.kind === 'focus')
    .map((mutation) => mutation.target.attributes.get('data-pause-action'))

describe('pause menu domain', () => {
  it('opens pause on Escape from an empty stack and otherwise closes only the top modal', () => {
    expect(escapePauseMenu(emptyModalStack)).toStrictEqual(['pause'])

    const settings = openPauseSettings(['pause'])
    expect(settings).toStrictEqual(['pause', 'settings'])
    expect(escapePauseMenu(settings)).toStrictEqual(['pause'])
    expect(escapePauseMenu(['inventory'])).toStrictEqual([])
  })

  it('keeps the settings close button and Escape on the same pop transition', () => {
    const settings = openPauseSettings(['pause'])

    expect(closePauseSettings(settings)).toStrictEqual(escapePauseMenu(settings))
    expect(resumePauseMenu(settings)).toBe(settings)
    expect(resumePauseMenu(['pause'])).toStrictEqual(emptyModalStack)
    expect(pauseMenuViewModel(settings)).toStrictEqual({
      modalStack: settings,
      pauseActive: false,
      pauseVisible: true,
      settingsVisible: true,
    })
  })

  it('leaves the stack unchanged when settings is opened or closed outside its active pause flow', () => {
    const pauseOnly: ModalStack = ['pause']
    const settingsOpen: ModalStack = ['pause', 'settings']
    const unrelated: ModalStack = ['inventory']

    expect(openPauseSettings(emptyModalStack)).toBe(emptyModalStack)
    expect(openPauseSettings(unrelated)).toBe(unrelated)
    expect(openPauseSettings(settingsOpen)).toBe(settingsOpen)
    expect(closePauseSettings(emptyModalStack)).toBe(emptyModalStack)
    expect(closePauseSettings(pauseOnly)).toBe(pauseOnly)
    expect(closePauseSettings(unrelated)).toBe(unrelated)
  })

  it('ignores settings actions while the pause flow is inactive', () => {
    const mounted = mount()
    const before = mounted.factory.mark()

    mounted.root.find('data-pause-action', 'settings')?.dispatch('click')
    mounted.root.find('data-pause-action', 'close-settings')?.dispatch('click')

    expect(mounted.stackChanges).toStrictEqual([])
    expect(focusedActions(mounted.factory, before)).toStrictEqual([])
  })
})

describe('operable pause menu', () => {
  it('supports the default no-op host callbacks', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('div'))
    const view = createPauseMenuView(factory, parent)

    view.handleEscape()
    fakeElement(view.root).find('data-pause-action', 'save-and-quit')?.dispatch('click')

    expect(fakeElement(view.root).find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(false)
  })

  it('renders named native controls and modal dialog semantics', () => {
    const mounted = mount()
    mounted.view.render(pauseMenuViewModel(['pause']))

    const buttons = accessibleButtons(mounted.root)
    expect(mounted.parent.children).toContain(mounted.root)
    expect(buttons.map((button) => button.tagName)).toStrictEqual(['button', 'button', 'button', 'button'])
    expect(buttons.map((button) => button.attributes.get('aria-label'))).toStrictEqual([
      PAUSE_MENU_ACTION_LABEL.resume,
      PAUSE_MENU_ACTION_LABEL.settings,
      PAUSE_MENU_ACTION_LABEL.saveAndQuit,
      PAUSE_MENU_ACTION_LABEL.closeSettings,
    ])
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.get('role')).toBe('dialog')
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.get('aria-label')).toBe('Game menu')
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.get('aria-modal')).toBe('true')
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(false)
    expect(mounted.root.listenersInTree()).toStrictEqual(['click', 'click', 'click', 'click'])
  })

  it('opens settings above pause, returns focus on close, and Escape pops the same top modal', () => {
    const mounted = mount()
    const beforePause = mounted.factory.mark()
    mounted.view.handleEscape()
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause'])
    expect(focusedActions(mounted.factory, beforePause)).toStrictEqual(['resume'])

    const settingsButton = mounted.root.find('data-pause-action', 'settings')
    const beforeOpen = mounted.factory.mark()
    settingsButton?.dispatch('click')
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause', 'settings'])
    const stackChangesAfterOpen = mounted.stackChanges.length
    mounted.root.find('data-pause-action', 'resume')?.dispatch('click')
    expect(mounted.stackChanges).toHaveLength(stackChangesAfterOpen)
    expect(mounted.root.find('data-mx-ui', 'pause-settings-modal')?.attributes.get('role')).toBe('dialog')
    expect(mounted.root.find('data-mx-ui', 'pause-settings-modal')?.attributes.get('aria-label')).toBe('Options')
    expect(mounted.root.find('data-mx-ui', 'pause-settings-modal')?.attributes.get('aria-modal')).toBe('true')
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('inert')).toBe(true)
    expect(focusedActions(mounted.factory, beforeOpen)).toStrictEqual(['close-settings'])

    const beforeClose = mounted.factory.mark()
    mounted.root.find('data-pause-action', 'close-settings')?.dispatch('click')
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause'])
    expect(mounted.root.find('data-mx-ui', 'pause-settings-modal')?.attributes.has('hidden')).toBe(true)
    expect(focusedActions(mounted.factory, beforeClose)).toStrictEqual(['settings'])

    settingsButton?.dispatch('click')
    const beforeEscape = mounted.factory.mark()
    mounted.view.handleEscape()
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause'])
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('inert')).toBe(false)
    expect(focusedActions(mounted.factory, beforeEscape)).toStrictEqual(['settings'])
  })

  it('returns a host intent for save and quit without changing modal state', () => {
    const mounted = mount()
    mounted.view.render(pauseMenuViewModel(['pause']))
    mounted.root.find('data-pause-action', 'save-and-quit')?.dispatch('click')

    expect(mounted.hostIntents).toStrictEqual([SAVE_AND_QUIT_TO_TITLE_INTENT])
    expect(mounted.stackChanges).toStrictEqual([])
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(false)
  })

  it('resumes from the button and removes managed listeners when destroyed', () => {
    const mounted = mount()
    mounted.view.handleEscape()
    mounted.root.find('data-pause-action', 'resume')?.dispatch('click')

    expect(mounted.stackChanges).toStrictEqual([['pause'], emptyModalStack])
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(true)
    mounted.view.destroy()
    expect(mounted.root.listenersInTree()).toStrictEqual([])
    mounted.view.destroy()
    expect(mounted.root.listenersInTree()).toStrictEqual([])
  })

  it('can re-enter the pause menu after the host supplies a fresh stack for a later session', () => {
    const mounted = mount()
    mounted.view.handleEscape()
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause'])

    mounted.view.render(pauseMenuViewModel(emptyModalStack))
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(true)

    mounted.view.handleEscape()
    expect(mounted.stackChanges.at(-1)).toStrictEqual(['pause'])
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(false)

    mounted.view.handleEscape()
    expect(mounted.stackChanges.at(-1)).toStrictEqual(emptyModalStack)
    expect(mounted.root.find('data-testid', 'pause-overlay')?.attributes.has('hidden')).toBe(true)
  })
})
