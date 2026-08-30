export type DebugHudSnapshot = {
  readonly fps: number
  readonly coordinates: Readonly<{ worldX: number; worldY: number; worldZ: number }>
  readonly chunk: Readonly<{ chunkX: number; chunkZ: number }>
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
  chunk: { chunkX: 0, chunkZ: 0 },
  coordinates: { worldX: 0, worldY: 0, worldZ: 0 },
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

const finite = (value: number, fallback: number): number => {
  if (Number.isFinite(value)) {
    return value
  }
  return fallback
}

const focusable = (element: Element | null): element is HTMLElement =>
  element !== null && 'focus' in element && typeof element.focus === 'function'

/** The value shown for a non-finite coordinate or frame rate. */
const NON_FINITE_FALLBACK = 0

/** How many decimal places the debug HUD prints a coordinate to. */
const DECIMAL_PLACES = 1

const facingLine = (facing: string | undefined): string => {
  if (typeof facing === 'undefined') {
    return ''
  }
  return `\nFacing: ${facing}`
}

const debugHudText = (snapshot: DebugHudSnapshot): string => {
  const { coordinates, chunk } = snapshot
  const fps = finite(snapshot.fps, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posX = finite(coordinates.worldX, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posY = finite(coordinates.worldY, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posZ = finite(coordinates.worldZ, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const chunkX = finite(chunk.chunkX, NON_FINITE_FALLBACK)
  const chunkZ = finite(chunk.chunkZ, NON_FINITE_FALLBACK)
  return `FPS: ${fps}\nXYZ: ${posX} / ${posY} / ${posZ}\nChunk: ${chunkX} / ${chunkZ}${facingLine(snapshot.facing)}`
}

const applySettingsToInputs = (
  inputs: ReadonlyMap<keyof UiSettings, HTMLInputElement>,
  settings: UiSettings,
): void => {
  for (const definition of SETTING_DEFINITIONS) {
    // Non-null: the settings screen's construction loop calls
    // `inputs.set(definition.key, ...)` for every entry of this SAME
    // `SETTING_DEFINITIONS` array, and nothing ever deletes from `inputs` — so
    // Every key this loop asks for is already present by the time settings
    // Are applied.
    const input = inputs.get(definition.key)!
    input.value = String(finite(settings[definition.key], DEFAULT_UI_SETTINGS[definition.key]))
  }
}

const buildRoot = (document: Document, parent: HTMLElement): HTMLElement => {
  const root = document.createElement('div')
  root.setAttribute('data-mx-ui', 'session-overlays')
  parent.appendChild(root)
  return root
}

const buildDebugHud = (document: Document, root: HTMLElement): HTMLElement => {
  const debugHud = document.createElement('output')
  debugHud.setAttribute('data-mx-ui', 'debug-hud')
  debugHud.setAttribute('role', 'region')
  debugHud.setAttribute('aria-label', 'Debug information')
  debugHud.hidden = true
  debugHud.style.whiteSpace = 'pre'
  root.appendChild(debugHud)
  return debugHud
}

const buildSettingsDialog = (document: Document, root: HTMLElement): HTMLElement => {
  const settingsDialog = document.createElement('section')
  settingsDialog.setAttribute('data-mx-ui', 'settings')
  settingsDialog.setAttribute('role', 'dialog')
  settingsDialog.setAttribute('aria-modal', 'true')
  settingsDialog.setAttribute('aria-label', 'Settings')
  settingsDialog.hidden = true
  root.appendChild(settingsDialog)
  return settingsDialog
}

const appendSettingsTitle = (document: Document, settingsDialog: HTMLElement): void => {
  const title = document.createElement('h2')
  title.textContent = 'Settings'
  settingsDialog.appendChild(title)
}

type SettingInputContext = {
  readonly document: Document
  readonly settingsDialog: HTMLElement
  readonly callbacks: UiSettingsCallbacks
}

type SettingInputBuild = {
  readonly input: HTMLInputElement
  readonly cleanup: () => void
}

const buildRangeInput = (
  document: Document,
  definition: SettingDefinition,
  callbacks: UiSettingsCallbacks,
): SettingInputBuild => {
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(definition.min)
  input.max = String(definition.max)
  input.step = String(definition.step)
  input.setAttribute('aria-label', definition.label)
  input.setAttribute('data-setting', definition.key)
  const onInput = (): void => definition.notify(callbacks, input.valueAsNumber)
  input.addEventListener('input', onInput)
  return { cleanup: () => input.removeEventListener('input', onInput), input }
}

const mountSettingInput = (
  context: SettingInputContext,
  definition: SettingDefinition,
  input: HTMLInputElement,
): void => {
  const label = context.document.createElement('label')
  label.textContent = definition.label
  label.appendChild(input)
  context.settingsDialog.appendChild(label)
}

const buildSettingInput = (
  context: SettingInputContext,
  definition: SettingDefinition,
): SettingInputBuild => {
  const built = buildRangeInput(context.document, definition, context.callbacks)
  mountSettingInput(context, definition, built.input)
  return built
}

type SettingInputsResult = {
  readonly inputs: ReadonlyMap<keyof UiSettings, HTMLInputElement>
  readonly cleanups: Array<() => void>
}

const buildSettingInputs = (context: SettingInputContext): SettingInputsResult => {
  const inputs = new Map<keyof UiSettings, HTMLInputElement>()
  const cleanups: Array<() => void> = []
  for (const definition of SETTING_DEFINITIONS) {
    const built = buildSettingInput(context, definition)
    inputs.set(definition.key, built.input)
    cleanups.push(built.cleanup)
  }
  return { cleanups, inputs }
}

const buildCloseButton = (document: Document, settingsDialog: HTMLElement): HTMLButtonElement => {
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = 'Close settings'
  closeButton.setAttribute('aria-label', 'Close settings')
  settingsDialog.appendChild(closeButton)
  return closeButton
}

type OverlaysDom = {
  readonly root: HTMLElement
  readonly debugHud: HTMLElement
  readonly settingsDialog: HTMLElement
  readonly closeButton: HTMLButtonElement
  readonly inputs: ReadonlyMap<keyof UiSettings, HTMLInputElement>
  readonly cleanups: Array<() => void>
}

const buildDom = (document: Document, parent: HTMLElement, callbacks: UiSettingsCallbacks): OverlaysDom => {
  const root = buildRoot(document, parent)
  const debugHud = buildDebugHud(document, root)
  const settingsDialog = buildSettingsDialog(document, root)
  appendSettingsTitle(document, settingsDialog)
  const { cleanups, inputs } = buildSettingInputs({ callbacks, document, settingsDialog })
  const closeButton = buildCloseButton(document, settingsDialog)
  return { cleanups, closeButton, debugHud, inputs, root, settingsDialog }
}

const toggleSettingsVisibility = (
  settingsDialog: HTMLElement,
  openSettings: () => void,
  closeSettings: () => void,
): void => {
  if (settingsDialog.hidden) {
    openSettings()
  } else {
    closeSettings()
  }
}

type OverlaysWiringContext = {
  readonly document: Document
  readonly dom: OverlaysDom
  readonly toggleDebug: () => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly delegateKeyDown: SessionKeyDelegate | undefined
}

const wireEventListeners = (context: OverlaysWiringContext): void => {
  const { document, dom, closeSettings, toggleDebug, openSettings, delegateKeyDown } = context

  const onCloseClick = (): void => closeSettings()
  dom.closeButton.addEventListener('click', onCloseClick)
  dom.cleanups.push(() => dom.closeButton.removeEventListener('click', onCloseClick))

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return
    }
    if (event.key === 'F1') {
      event.preventDefault()
      toggleDebug()
    } else if (event.key === 'F10') {
      event.preventDefault()
      toggleSettingsVisibility(dom.settingsDialog, openSettings, closeSettings)
    } else if (event.key === 'Escape' && !dom.settingsDialog.hidden) {
      event.preventDefault()
      closeSettings()
    } else if (dom.settingsDialog.hidden) {
      delegateKeyDown?.(event)
    }
  }
  document.addEventListener('keydown', onKeyDown)
  dom.cleanups.push(() => document.removeEventListener('keydown', onKeyDown))
}

/** Where `cleanups.splice` starts, to run and drop every registered cleanup. */
const SPLICE_FROM_START = 0

const wireOverlaysBehavior = (
  document: Document,
  dom: OverlaysDom,
  delegateKeyDown: SessionKeyDelegate | undefined,
): SessionOverlays => {
  let restoreFocus: HTMLElement | null = null

  const updateDebug = (snapshot: DebugHudSnapshot): void => {
    dom.debugHud.textContent = debugHudText(snapshot)
  }
  const updateSettings = (settings: UiSettings): void => {
    applySettingsToInputs(dom.inputs, settings)
  }
  const toggleDebug = (): void => {
    dom.debugHud.hidden = !dom.debugHud.hidden
  }
  const openSettings = (): void => {
    if (!dom.settingsDialog.hidden) {
      return
    }
    const active = document.activeElement
    // `document.activeElement` is typed `Element | null`.
    // That is wider than what this repository's own mount path ever produces.
    // But a host embedding this differently (or a document with no body) could still hand back
    // `null` here. So the guard stays real rather than assumed away.
    if (focusable(active)) {
      restoreFocus = active
    } else {
      restoreFocus = null
    }
    dom.settingsDialog.hidden = false
    dom.inputs.get('mouseSensitivity')?.focus()
  }
  const closeSettings = (): void => {
    if (dom.settingsDialog.hidden) {
      return
    }
    dom.settingsDialog.hidden = true
    const target = restoreFocus
    restoreFocus = null
    if (target?.isConnected === true) {
      target.focus()
    }
  }

  wireEventListeners({ closeSettings, delegateKeyDown, document, dom, openSettings, toggleDebug })

  return {
    closeSettings,
    debugHud: dom.debugHud,
    destroy: (): void => {
      for (const cleanup of dom.cleanups.splice(SPLICE_FROM_START)) {
        cleanup()
      }
      restoreFocus = null
      dom.root.remove()
    },
    openSettings,
    root: dom.root,
    settingsDialog: dom.settingsDialog,
    toggleDebug,
    updateDebug,
    updateSettings,
  }
}

export type CreateSessionOverlaysOptions = {
  readonly callbacks?: UiSettingsCallbacks | undefined
  readonly delegateKeyDown?: SessionKeyDelegate | undefined
  readonly initialDebug?: DebugHudSnapshot | undefined
  readonly initialSettings?: UiSettings | undefined
}

export const createSessionOverlays = (
  document: Document,
  parent: HTMLElement,
  options: CreateSessionOverlaysOptions = {},
): SessionOverlays => {
  const {
    callbacks = {},
    delegateKeyDown,
    initialDebug = DEFAULT_DEBUG_HUD_SNAPSHOT,
    initialSettings = DEFAULT_UI_SETTINGS,
  } = options
  const dom = buildDom(document, parent, callbacks)
  const overlays = wireOverlaysBehavior(document, dom, delegateKeyDown)
  overlays.updateSettings(initialSettings)
  overlays.updateDebug(initialDebug)
  return overlays
}
