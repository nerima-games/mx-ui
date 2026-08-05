import { textCell, writeText } from './dom-write'

export type DebugHudSnapshot = {
  readonly fps: number
  readonly coordinates: Readonly<{ x: number; y: number; z: number }>
  readonly chunk: Readonly<{ x: number; z: number }>
  readonly facing?: string
}

export type UiSettings = {
  readonly mouseSensitivity: number
  readonly renderDistance: number
  readonly fieldOfView: number
  readonly masterVolume: number
}

export type UiSettingsCallbacks = {
  readonly onMouseSensitivityChange?: (value: number) => void
  readonly onRenderDistanceChange?: (value: number) => void
  readonly onFieldOfViewChange?: (value: number) => void
  readonly onMasterVolumeChange?: (value: number) => void
}

export type SessionKeyDelegate = (event: KeyboardEvent) => boolean

export const DEFAULT_UI_SETTINGS: UiSettings = {
  fieldOfView: 70,
  masterVolume: 1,
  mouseSensitivity: 1,
  renderDistance: 12,
}

export const DEFAULT_DEBUG_HUD_SNAPSHOT: DebugHudSnapshot = {
  chunk: { x: 0, z: 0 },
  coordinates: { x: 0, y: 0, z: 0 },
  fps: 0,
}

export type SessionOverlays = {
  readonly root: HTMLElement
  readonly debugHud: HTMLElement
  readonly settingsDialog: HTMLElement
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => void
  readonly toggleDebug: () => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly destroy: () => void
}

type SettingDefinition = {
  readonly key: keyof UiSettings
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly notify: (callbacks: UiSettingsCallbacks, value: number) => void
}

const SETTING_DEFINITIONS: ReadonlyArray<SettingDefinition> = [
  {
    key: 'mouseSensitivity',
    label: 'Mouse sensitivity',
    max: 2,
    min: 0.1,
    notify: (callbacks, value) => callbacks.onMouseSensitivityChange?.(value),
    step: 0.05,
  },
  {
    key: 'renderDistance',
    label: 'Render distance',
    max: 32,
    min: 2,
    notify: (callbacks, value) => callbacks.onRenderDistanceChange?.(value),
    step: 1,
  },
  {
    key: 'fieldOfView',
    label: 'Field of view',
    max: 110,
    min: 30,
    notify: (callbacks, value) => callbacks.onFieldOfViewChange?.(value),
    step: 1,
  },
  {
    key: 'masterVolume',
    label: 'Master volume',
    max: 1,
    min: 0,
    notify: (callbacks, value) => callbacks.onMasterVolumeChange?.(value),
    step: 0.05,
  },
]

const finite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback

const focusable = (element: Element | null): element is HTMLElement =>
  element !== null && 'focus' in element && typeof element.focus === 'function'

export const createSessionOverlays = (
  document: Document,
  parent: HTMLElement,
  initialSettings: UiSettings = DEFAULT_UI_SETTINGS,
  callbacks: UiSettingsCallbacks = {},
  initialDebug: DebugHudSnapshot = DEFAULT_DEBUG_HUD_SNAPSHOT,
  delegateKeyDown?: SessionKeyDelegate,
): SessionOverlays => {
  const root = document.createElement('div')
  root.setAttribute('data-mx-ui', 'session-overlays')
  parent.appendChild(root)

  const debugHud = document.createElement('output')
  debugHud.setAttribute('data-mx-ui', 'debug-hud')
  debugHud.setAttribute('role', 'region')
  debugHud.setAttribute('aria-label', 'Debug information')
  debugHud.hidden = true
  debugHud.style.whiteSpace = 'pre'
  root.appendChild(debugHud)
  const debugText = textCell(debugHud)

  const settingsDialog = document.createElement('section')
  settingsDialog.setAttribute('data-mx-ui', 'settings')
  settingsDialog.setAttribute('role', 'dialog')
  settingsDialog.setAttribute('aria-modal', 'true')
  settingsDialog.setAttribute('aria-label', 'Settings')
  settingsDialog.hidden = true
  root.appendChild(settingsDialog)

  const title = document.createElement('h2')
  title.textContent = 'Settings'
  settingsDialog.appendChild(title)

  const inputs = new Map<keyof UiSettings, HTMLInputElement>()
  const cleanups: Array<() => void> = []
  for (const definition of SETTING_DEFINITIONS) {
    const label = document.createElement('label')
    label.textContent = definition.label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(definition.min)
    input.max = String(definition.max)
    input.step = String(definition.step)
    input.setAttribute('aria-label', definition.label)
    input.setAttribute('data-setting', definition.key)
    const onInput = (): void => definition.notify(callbacks, input.valueAsNumber)
    input.addEventListener('input', onInput)
    cleanups.push(() => input.removeEventListener('input', onInput))
    label.appendChild(input)
    settingsDialog.appendChild(label)
    inputs.set(definition.key, input)
  }

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = 'Close settings'
  closeButton.setAttribute('aria-label', 'Close settings')
  settingsDialog.appendChild(closeButton)

  let restoreFocus: HTMLElement | undefined
  const updateDebug = (snapshot: DebugHudSnapshot): void => {
    const fps = finite(snapshot.fps, 0)
    const { coordinates, chunk } = snapshot
    const facing = snapshot.facing === undefined ? '' : `\nFacing: ${snapshot.facing}`
    writeText(
      debugText,
      `FPS: ${fps.toFixed(1)}\nXYZ: ${finite(coordinates.x, 0).toFixed(1)} / ${finite(coordinates.y, 0).toFixed(1)} / ${finite(coordinates.z, 0).toFixed(1)}\nChunk: ${finite(chunk.x, 0)} / ${finite(chunk.z, 0)}${facing}`,
    )
  }
  const updateSettings = (settings: UiSettings): void => {
    for (const definition of SETTING_DEFINITIONS) {
      const input = inputs.get(definition.key)
      if (input !== undefined) {
        input.value = String(
          finite(settings[definition.key], DEFAULT_UI_SETTINGS[definition.key]),
        )
      }
    }
  }
  const toggleDebug = (): void => {
    debugHud.hidden = !debugHud.hidden
  }
  const openSettings = (): void => {
    if (!settingsDialog.hidden) {
      return
    }
    const active = document.activeElement
    restoreFocus = focusable(active) ? active : undefined
    settingsDialog.hidden = false
    inputs.get('mouseSensitivity')?.focus()
  }
  const closeSettings = (): void => {
    if (settingsDialog.hidden) {
      return
    }
    settingsDialog.hidden = true
    const target = restoreFocus
    restoreFocus = undefined
    if (target?.isConnected === true) {
      target.focus()
    }
  }
  const onClose = (): void => closeSettings()
  closeButton.addEventListener('click', onClose)
  cleanups.push(() => closeButton.removeEventListener('click', onClose))

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return
    }
    if (event.key === 'F1') {
      event.preventDefault()
      toggleDebug()
    } else if (event.key === 'F10') {
      event.preventDefault()
      settingsDialog.hidden ? openSettings() : closeSettings()
    } else if (event.key === 'Escape' && !settingsDialog.hidden) {
      event.preventDefault()
      closeSettings()
    } else if (settingsDialog.hidden) {
      delegateKeyDown?.(event)
    }
  }
  document.addEventListener('keydown', onKeyDown)
  cleanups.push(() => document.removeEventListener('keydown', onKeyDown))

  updateSettings(initialSettings)
  updateDebug(initialDebug)

  return {
    closeSettings,
    debugHud,
    destroy: () => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup()
      }
      restoreFocus = undefined
      root.remove()
    },
    openSettings,
    root,
    settingsDialog,
    toggleDebug,
    updateDebug,
    updateSettings,
  }
}
