import {
  type ModalStack,
  emptyModalStack,
  escapePressed,
  openScreen,
  topOf,
} from './modal-stack.js'

export type PauseMenuViewModel = {
  readonly modalStack: ModalStack
  readonly pauseVisible: boolean
  readonly pauseActive: boolean
  readonly settingsVisible: boolean
}

export type PauseMenuHostIntent = {
  readonly type: 'save-and-quit-to-title'
}

export const SAVE_AND_QUIT_TO_TITLE_INTENT: PauseMenuHostIntent = {
  type: 'save-and-quit-to-title',
}

export const pauseMenuViewModel = (modalStack: ModalStack = emptyModalStack): PauseMenuViewModel => {
  const pauseVisible = modalStack.includes('pause')
  const top = topOf(modalStack)

  return {
    modalStack,
    pauseActive: pauseVisible && top === 'pause',
    pauseVisible,
    settingsVisible: pauseVisible && top === 'settings',
  }
}

/** The single frame-level Escape decision, projected into the pause menu stack. */
export const escapePauseMenu = (modalStack: ModalStack): ModalStack => {
  const outcome = escapePressed(modalStack)
  if (outcome.action === 'open-pause') {
    return openScreen(outcome.stack, 'pause')
  }
  return outcome.stack
}

/** Options is only reachable from the active pause dialog. */
export const openPauseSettings = (modalStack: ModalStack): ModalStack => {
  if (!modalStack.includes('pause') || topOf(modalStack) !== 'pause') {
    return modalStack
  }
  return openScreen(modalStack, 'settings')
}

/** Close the settings dialog by the same top-of-stack rule as Escape. */
export const closePauseSettings = (modalStack: ModalStack): ModalStack => {
  if (!modalStack.includes('pause') || topOf(modalStack) !== 'settings') {
    return modalStack
  }
  return escapePressed(modalStack).stack
}

/** Resume closes pause only when pause itself is the top modal. */
export const resumePauseMenu = (modalStack: ModalStack): ModalStack => {
  if (topOf(modalStack) !== 'pause') {
    return modalStack
  }
  return escapePressed(modalStack).stack
}
