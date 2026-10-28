import {
  type AttributeCell,
  attributeCell,
  writeAttribute,
  writeHidden,
} from './dom-write.js'
import type { DomElement, DomElementFactory, DomInteractiveElement } from './dom-surface.js'
import { type ModalStack, topOf } from '../domain/modal-stack.js'
import { PALETTE_VAR, declarePalette } from './palette-css.js'
import {
  type PauseMenuHostIntent,
  type PauseMenuViewModel,
  SAVE_AND_QUIT_TO_TITLE_INTENT,
  closePauseSettings,
  escapePauseMenu,
  openPauseSettings,
  pauseMenuViewModel,
  resumePauseMenu,
} from '../domain/pause-menu-view-model.js'

export const PAUSE_MENU_ACTION_LABEL = {
  closeSettings: 'Close',
  resume: 'Back to Game',
  saveAndQuit: 'Save and Quit to Title',
  settings: 'Options...',
} as const

export type PauseMenuCallbacks = {
  readonly onModalStackChange: (modalStack: ModalStack) => void
  readonly onHostIntent: (intent: PauseMenuHostIntent) => void
}

export type PauseMenuView = {
  readonly root: DomElement
  readonly render: (model: PauseMenuViewModel) => void
  /** Called by the single frame-level Escape handler; this view adds no key listener. */
  readonly handleEscape: () => void
  readonly destroy: () => void
}

type MountContext = {
  readonly cleanups: Array<() => void>
  readonly factory: DomElementFactory
}

type PauseMenuShell = {
  readonly root: DomElement
  readonly pausePanel: DomElement
  readonly settingsPanel: DomElement
  readonly resumeButton: DomInteractiveElement
  readonly settingsButton: DomInteractiveElement
  readonly saveAndQuitButton: DomInteractiveElement
  readonly closeSettingsButton: DomInteractiveElement
  readonly pauseHidden: AttributeCell
  readonly pauseInert: AttributeCell
  readonly pauseAriaHidden: AttributeCell
  readonly pauseAriaModal: AttributeCell
  readonly settingsHidden: AttributeCell
  readonly settingsAriaModal: AttributeCell
}

const noop = (): void => {
  // No-op.
}

const NOOP_CALLBACKS: PauseMenuCallbacks = {
  onHostIntent: noop,
  onModalStackChange: noop,
}

const addManagedClick = (
  context: MountContext,
  target: DomInteractiveElement,
  handler: () => void,
): void => {
  target.addEventListener('click', handler)
  context.cleanups.push(() => target.removeEventListener?.('click', handler))
}

type ButtonOptions = {
  readonly action: string
  readonly label: string
  readonly parent: DomElement
  readonly testId?: string
}

const setOptionalTestId = (button: DomInteractiveElement, testId: string | undefined): void => {
  if (testId) {
    button.setAttribute('data-testid', testId)
  }
}

const createButton = (context: MountContext, { action, label, parent, testId }: ButtonOptions): DomInteractiveElement => {
  const button = context.factory.createElement('button')
  button.setAttribute('aria-label', label)
  button.setAttribute('data-mx-ui', 'pause-menu-action')
  button.setAttribute('data-pause-action', action)
  setOptionalTestId(button, testId)
  button.setAttribute('type', 'button')
  button.style.setProperty('color', PALETTE_VAR.ink)
  button.textContent = label
  parent.appendChild(button)
  return button
}

type DialogOptions = {
  readonly ariaLabel: string
  readonly dataName: string
  readonly testId?: string
  readonly titleTag: 'h1' | 'h2'
  readonly title: string
  readonly titleName: string
}

const createPauseMenuRoot = (context: MountContext, parent: DomElement): DomElement => {
  const root = context.factory.createElement('div')
  root.setAttribute('data-mx-ui', 'pause-menu')
  declarePalette(root)
  root.style.setProperty('color', PALETTE_VAR.ink)
  parent.appendChild(root)
  return root
}

const createDialogPanel = (context: MountContext, root: DomElement, options: DialogOptions): DomElement => {
  const panel = context.factory.createElement('section')
  panel.setAttribute('aria-label', options.ariaLabel)
  panel.setAttribute('data-mx-ui', options.dataName)
  if (options.testId) {
    panel.setAttribute('data-testid', options.testId)
  }
  panel.setAttribute('role', 'dialog')
  panel.style.setProperty('background-color', PALETTE_VAR.surface)
  root.appendChild(panel)
  return panel
}

const appendDialogTitle = (context: MountContext, panel: DomElement, options: DialogOptions): void => {
  const title = context.factory.createElement(options.titleTag)
  title.setAttribute('data-mx-ui', options.titleName)
  title.textContent = options.title
  panel.appendChild(title)
}

type PausePanelElements = {
  readonly pausePanel: DomElement
  readonly resumeButton: DomInteractiveElement
  readonly settingsButton: DomInteractiveElement
  readonly saveAndQuitButton: DomInteractiveElement
}

const createPausePanel = (context: MountContext, root: DomElement): PausePanelElements => {
  const options: DialogOptions = {
    ariaLabel: 'Game menu',
    dataName: 'pause-panel',
    testId: 'pause-overlay',
    title: 'Game Menu',
    titleName: 'pause-title',
    titleTag: 'h1',
  }
  const pausePanel = createDialogPanel(context, root, options)
  appendDialogTitle(context, pausePanel, options)
  const resumeButton = createButton(context, {
    action: 'resume',
    label: PAUSE_MENU_ACTION_LABEL.resume,
    parent: pausePanel,
    testId: 'resume-button',
  })
  const settingsButton = createButton(context, {
    action: 'settings',
    label: PAUSE_MENU_ACTION_LABEL.settings,
    parent: pausePanel,
    testId: 'options-button',
  })
  const saveAndQuitButton = createButton(context, {
    action: 'save-and-quit',
    label: PAUSE_MENU_ACTION_LABEL.saveAndQuit,
    parent: pausePanel,
    testId: 'save-quit-button',
  })
  return { pausePanel, resumeButton, saveAndQuitButton, settingsButton }
}

type SettingsPanelElements = {
  readonly closeSettingsButton: DomInteractiveElement
  readonly settingsPanel: DomElement
}

const createSettingsPanel = (context: MountContext, root: DomElement): SettingsPanelElements => {
  const options: DialogOptions = {
    ariaLabel: 'Options',
    dataName: 'pause-settings-modal',
    title: 'Options',
    titleName: 'pause-settings-title',
    titleTag: 'h2',
  }
  const settingsPanel = createDialogPanel(context, root, options)
  appendDialogTitle(context, settingsPanel, options)
  const closeSettingsButton = createButton(context, {
    action: 'close-settings',
    label: PAUSE_MENU_ACTION_LABEL.closeSettings,
    parent: settingsPanel,
  })
  return { closeSettingsButton, settingsPanel }
}

const createPauseMenuShell = (context: MountContext, parent: DomElement): PauseMenuShell => {
  const root = createPauseMenuRoot(context, parent)
  const pausePanel = createPausePanel(context, root)
  const settingsPanel = createSettingsPanel(context, root)
  return {
    ...pausePanel,
    ...settingsPanel,
    pauseAriaHidden: attributeCell(pausePanel.pausePanel, 'aria-hidden'),
    pauseAriaModal: attributeCell(pausePanel.pausePanel, 'aria-modal'),
    pauseHidden: attributeCell(pausePanel.pausePanel, 'hidden'),
    pauseInert: attributeCell(pausePanel.pausePanel, 'inert'),
    root,
    settingsAriaModal: attributeCell(settingsPanel.settingsPanel, 'aria-modal'),
    settingsHidden: attributeCell(settingsPanel.settingsPanel, 'hidden'),
  }
}

const writePresentAttribute = (cell: AttributeCell, present: boolean, value: string): void => {
  if (present) {
    writeAttribute(cell, value)
    return
  }
  writeAttribute(cell)
}

const applyModel = (shell: PauseMenuShell, model: PauseMenuViewModel): void => {
  const pauseInert = model.pauseVisible && !model.pauseActive
  writeHidden(shell.pauseHidden, !model.pauseVisible)
  writeHidden(shell.settingsHidden, !model.settingsVisible)
  writeHidden(shell.pauseInert, pauseInert)
  writePresentAttribute(shell.pauseAriaHidden, pauseInert, 'true')
  writePresentAttribute(shell.pauseAriaModal, model.pauseActive, 'true')
  writePresentAttribute(shell.settingsAriaModal, model.settingsVisible, 'true')
}

type PauseMenuActionContext = {
  readonly callbacks: PauseMenuCallbacks
  readonly context: MountContext
  readonly getModalStack: () => ModalStack
  readonly shell: PauseMenuShell
  readonly transition: (next: ModalStack) => void
}

const registerPauseMenuActions = ({ callbacks, context, getModalStack, shell, transition }: PauseMenuActionContext): void => {
  addManagedClick(context, shell.resumeButton, () => {
    transition(resumePauseMenu(getModalStack()))
  })
  addManagedClick(context, shell.settingsButton, () => {
    const next = openPauseSettings(getModalStack())
    transition(next)
    if (topOf(next) === 'settings') {
      shell.closeSettingsButton.focus()
    }
  })
  addManagedClick(context, shell.saveAndQuitButton, () => {
    callbacks.onHostIntent(SAVE_AND_QUIT_TO_TITLE_INTENT)
  })
  addManagedClick(context, shell.closeSettingsButton, () => {
    const previous = getModalStack()
    const next = closePauseSettings(previous)
    transition(next)
    if (next !== previous && topOf(next) === 'pause') {
      shell.settingsButton.focus()
    }
  })
}

/** Mount the pause/settings UI; persistence and routing remain with the host. */
export const createPauseMenuView = (
  factory: DomElementFactory,
  parent: DomElement,
  callbacks: PauseMenuCallbacks = NOOP_CALLBACKS,
): PauseMenuView => {
  const context: MountContext = { cleanups: [], factory }
  const shell = createPauseMenuShell(context, parent)
  let modalStack: ModalStack = []

  const render = (model: PauseMenuViewModel): void => {
    const { modalStack: nextStack } = model
    modalStack = nextStack
    applyModel(shell, model)
  }

  const transition = (next: ModalStack): void => {
    if (next === modalStack) {
      return
    }
    modalStack = next
    render(pauseMenuViewModel(next))
    callbacks.onModalStackChange(next)
  }

  const handleEscape = (): void => {
    const previousTop = topOf(modalStack)
    const next = escapePauseMenu(modalStack)
    transition(next)
    if (!previousTop && topOf(next) === 'pause') {
      shell.resumeButton.focus()
    } else if (previousTop === 'settings' && topOf(next) === 'pause') {
      shell.settingsButton.focus()
    }
  }
  registerPauseMenuActions({
    callbacks,
    context,
    getModalStack: () => modalStack,
    shell,
    transition,
  })

  render(pauseMenuViewModel())

  return {
    destroy: (): void => {
      const cleanups = [...context.cleanups].reverse()
      context.cleanups.length = 0
      for (const cleanup of cleanups) {
        cleanup()
      }
    },
    handleEscape,
    render,
    root: shell.root,
  }
}
