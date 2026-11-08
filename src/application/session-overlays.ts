import { DEFAULT_SETTINGS, isValidSettings } from '@nerima-games/mc-sim'
import { type InventoryNavigationDirection, focusTargetForElement, moveFocusTarget } from './inventory-navigation.js'
import {
  type SettingsChoiceField,
  type SettingsChoiceValue,
  type SettingsSliderField,
  type SettingsSliderValue,
  type SettingsToggleField,
  createSettingsView,
} from './settings-view.js'
import {
  type SettingsSnapshot,
  type SettingsViewModelFailure,
  settingsViewModel,
} from '../domain/settings-view-model.js'
import { type TextCell, textCell } from './dom-write.js'
import { type UiLanguage, type UiLanguageFailure, type UiMessageKey } from '../domain/ui-language.js'
import { setLocalizedAttribute, setLocalizedText, writeLocalizedText } from './ui-localization.js'
import type { UiScale } from '../domain/accessibility.js'
import type { InputAction as RenderInputAction } from '@nerima-games/mc-render'
import { Result } from 'effect'
import { KeyCode as kernelKeyCode } from '@nerima-games/mc-kernel/domain/settings'

export type DebugHudSnapshot = {
  readonly fps: number
  readonly coordinates: Readonly<{ worldX: number; worldY: number; worldZ: number }>
  readonly chunk: Readonly<{ chunkX: number; chunkZ: number }>
  readonly facing?: string
}

/** Compatibility shape for hosts that still push the original four settings. */
export type UiSettings = {
  readonly mouseSensitivity: number
  readonly renderDistance: number
  readonly fieldOfView: number
  readonly masterVolume: number
  readonly uiScale: UiScale
}

export type UiSettingsCallbacks = {
  readonly onMouseSensitivityChange?: (value: number) => void
  readonly onRenderDistanceChange?: (value: number) => void
  readonly onFieldOfViewChange?: (value: number) => void
  readonly onMasterVolumeChange?: (value: number) => void
  readonly onLanguageChange?: (language: UiLanguage) => void
  readonly onSettingsChange?: (settings: SettingsSnapshot) => void
  readonly onBindingActivate?: (action: string) => void
}

export type SessionKeyDelegate = (event: KeyboardEvent) => boolean

export const DEFAULT_UI_SETTINGS: UiSettings = {
  fieldOfView: 70,
  masterVolume: 1,
  mouseSensitivity: 1,
  renderDistance: 12,
  uiScale: 1,
}

const DECIMAL_PLACES = 1
type BindableAction = Exclude<RenderInputAction, 'escape'>

const BINDABLE_ACTIONS: ReadonlyArray<BindableAction> = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'sneak',
  'sprint',
  'openInventory',
  'openChat',
  'attack',
  'use',
  'pickBlock',
  'hotbarSlot1',
  'hotbarSlot2',
  'hotbarSlot3',
  'hotbarSlot4',
  'hotbarSlot5',
  'hotbarSlot6',
  'hotbarSlot7',
  'hotbarSlot8',
  'hotbarSlot9',
]

const DEFAULT_SETTINGS_BINDINGS: Readonly<Record<BindableAction, ReturnType<typeof kernelKeyCode>>> = {
  attack: kernelKeyCode('MouseLeft'),
  hotbarSlot1: kernelKeyCode('Digit1'),
  hotbarSlot2: kernelKeyCode('Digit2'),
  hotbarSlot3: kernelKeyCode('Digit3'),
  hotbarSlot4: kernelKeyCode('Digit4'),
  hotbarSlot5: kernelKeyCode('Digit5'),
  hotbarSlot6: kernelKeyCode('Digit6'),
  hotbarSlot7: kernelKeyCode('Digit7'),
  hotbarSlot8: kernelKeyCode('Digit8'),
  hotbarSlot9: kernelKeyCode('Digit9'),
  jump: kernelKeyCode('Space'),
  moveBackward: kernelKeyCode('KeyS'),
  moveForward: kernelKeyCode('KeyW'),
  moveLeft: kernelKeyCode('KeyA'),
  moveRight: kernelKeyCode('KeyD'),
  openChat: kernelKeyCode('KeyT'),
  openInventory: kernelKeyCode('KeyE'),
  pickBlock: kernelKeyCode('MouseMiddle'),
  sneak: kernelKeyCode('ShiftLeft'),
  sprint: kernelKeyCode('ControlLeft'),
  use: kernelKeyCode('MouseRight'),
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
  readonly initializationResult: Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateSettingsSnapshot: (
    settings: unknown,
    language?: UiLanguage,
  ) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly toggleDebug: () => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly destroy: () => void
}

/** The value shown for a non-finite coordinate or frame rate. */
const NON_FINITE_FALLBACK = 0

const finite = (value: number, fallback: number): number => {
  if (Number.isFinite(value)) {
    return value
  }
  return fallback
}

const focusable = (element: Element | null): element is HTMLElement =>
  element !== null && 'focus' in element && typeof element.focus === 'function'

const debugHudMessageKey = (facing: string | undefined): UiMessageKey => {
  if (typeof facing === 'undefined') {
    return 'debug.session'
  }
  return 'debug.session-facing'
}

const debugHudMessage = (
  snapshot: DebugHudSnapshot,
): Readonly<{ key: UiMessageKey; values: Readonly<Record<string, string | number>> }> => {
  const { coordinates, chunk } = snapshot
  const fps = finite(snapshot.fps, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posX = finite(coordinates.worldX, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posY = finite(coordinates.worldY, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const posZ = finite(coordinates.worldZ, NON_FINITE_FALLBACK).toFixed(DECIMAL_PLACES)
  const chunkX = finite(chunk.chunkX, NON_FINITE_FALLBACK)
  const chunkZ = finite(chunk.chunkZ, NON_FINITE_FALLBACK)
  return {
    key: debugHudMessageKey(snapshot.facing),
    values: {
      chunk: `${chunkX} / ${chunkZ}`,
      coordinates: `${posX} / ${posY} / ${posZ}`,
      facing: snapshot.facing ?? '',
      fps,
    },
  }
}

const mergeLegacySettings = (settings: UiSettings, current: SettingsSnapshot): unknown => ({
  ...current,
  fovDegrees: settings.fieldOfView,
  masterVolume: settings.masterVolume,
  mouseSensitivity: settings.mouseSensitivity,
  renderDistance: settings.renderDistance,
})

const patchGraphicsPreset = (
  current: SettingsSnapshot,
  value: SettingsSliderValue | SettingsChoiceValue | boolean,
): Readonly<Record<string, unknown>> => ({ ...current, graphicsPreset: value, graphicsQuality: value })

const patchSettings = (
  current: SettingsSnapshot,
  field: SettingsSliderField | SettingsChoiceField | SettingsToggleField,
  value: SettingsSliderValue | SettingsChoiceValue | boolean,
): unknown => {
  switch (field) {
    case 'graphicsPreset': return patchGraphicsPreset(current, value)
    case 'language': return current
    default: return { ...current, [field]: value }
  }
}

const settingsTitle = (document: Document, dialog: HTMLElement): void => {
  const title = document.createElement('h2')
  setLocalizedText(title, 'pause.title.options')
  dialog.appendChild(title)
}

const settingsDialog = (document: Document, parent: HTMLElement): HTMLElement => {
  const dialog = document.createElement('section')
  dialog.setAttribute('data-mx-ui', 'settings')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  setLocalizedAttribute(dialog, 'aria-label', 'pause.dialog.options')
  dialog.hidden = true
  parent.appendChild(dialog)
  settingsTitle(document, dialog)
  return dialog
}

const directionForArrowKey = (key: string): InventoryNavigationDirection | null => {
  switch (key) {
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    default: return null
  }
}

const isElementInside = (root: HTMLElement, target: EventTarget | null): target is Element =>
  target instanceof Element && root.contains(target)

export type CreateSessionOverlaysOptions = {
  readonly callbacks?: UiSettingsCallbacks | undefined
  readonly delegateKeyDown?: SessionKeyDelegate | undefined
  readonly initialDebug?: DebugHudSnapshot | undefined
  readonly initialSettings?: UiSettings | undefined
  readonly initialSettingsSnapshot?: SettingsSnapshot | undefined
  readonly initialLanguage?: UiLanguage | undefined
  readonly onLanguageChange?: (
    language: UiLanguage,
  ) => Result.Result<UiLanguage, UiLanguageFailure | SettingsViewModelFailure>
}

type OverlayElements = {
  readonly root: HTMLElement
  readonly debugHud: HTMLElement
  readonly debugHudText: TextCell
  readonly dialog: HTMLElement
}

const createOverlayRoot = (document: Document, parent: HTMLElement): HTMLElement => {
  const root = document.createElement('div')
  root.setAttribute('data-mx-ui', 'session-overlays')
  parent.appendChild(root)
  return root
}

const createDebugHud = (document: Document, root: HTMLElement): Readonly<{ element: HTMLElement; text: TextCell }> => {
  const debugHud = document.createElement('output')
  debugHud.setAttribute('data-mx-ui', 'debug-hud')
  debugHud.setAttribute('role', 'region')
  setLocalizedAttribute(debugHud, 'aria-label', 'debug.information')
  debugHud.hidden = true
  debugHud.style.whiteSpace = 'pre'
  root.appendChild(debugHud)
  return { element: debugHud, text: textCell(debugHud) }
}

const createOverlayElements = (document: Document, parent: HTMLElement): OverlayElements => {
  const root = createOverlayRoot(document, parent)
  const debugHud = createDebugHud(document, root)
  const dialog = settingsDialog(document, root)
  return { debugHud: debugHud.element, debugHudText: debugHud.text, dialog, root }
}

type SettingsControllerState = {
  activeSettings: SettingsSnapshot
  activeLanguage: UiLanguage
  view: ReturnType<typeof createSettingsView> | null
}

type SettingsSnapshotUpdater = (
  input: unknown,
  language?: UiLanguage,
) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>

type SettingsActionsContext = {
  readonly options: CreateSessionOverlaysOptions
  readonly state: SettingsControllerState
  readonly updateSettingsSnapshot: SettingsSnapshotUpdater
  readonly renderCurrentSettings: () => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly closeSettings: () => void
}

const handleLanguageChoice = (
  field: SettingsChoiceField,
  value: SettingsChoiceValue,
  context: SettingsActionsContext,
): boolean => {
  if (field !== 'language' || (value !== 'en' && value !== 'ja')) {
    return false
  }
  const languageResult = context.options.onLanguageChange?.(value) ?? Result.succeed(value)
  if (Result.isFailure(languageResult)) {
    return true
  }
  context.state.activeLanguage = languageResult.success
  context.options.callbacks?.onLanguageChange?.(context.state.activeLanguage)
  context.renderCurrentSettings()
  return true
}

const handleChoiceChange = (
  field: SettingsChoiceField,
  value: SettingsChoiceValue,
  context: SettingsActionsContext,
): void => {
  if (handleLanguageChoice(field, value, context)) {
    return
  }
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, value),
    context.state.activeLanguage,
  )
  if (Result.isSuccess(updated)) {
    context.options.callbacks?.onSettingsChange?.(updated.success)
  }
}

const notifyLegacySliderChange = (
  field: SettingsSliderField,
  value: SettingsSliderValue,
  callbacks: UiSettingsCallbacks | undefined,
): void => {
  switch (field) {
    case 'mouseSensitivity': callbacks?.onMouseSensitivityChange?.(value); return
    case 'renderDistance': callbacks?.onRenderDistanceChange?.(value); return
    case 'fovDegrees': callbacks?.onFieldOfViewChange?.(value); return
    case 'masterVolume': callbacks?.onMasterVolumeChange?.(value); return
    default: return
  }
}

const handleSliderChange = (
  field: SettingsSliderField,
  value: SettingsSliderValue,
  context: SettingsActionsContext,
): void => {
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, value),
    context.state.activeLanguage,
  )
  if (Result.isFailure(updated)) {
    return
  }
  notifyLegacySliderChange(field, value, context.options.callbacks)
  context.options.callbacks?.onSettingsChange?.(updated.success)
}

const handleToggleChange = (
  field: SettingsToggleField,
  checked: boolean,
  context: SettingsActionsContext,
): void => {
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, checked),
    context.state.activeLanguage,
  )
  if (Result.isSuccess(updated)) {
    context.options.callbacks?.onSettingsChange?.(updated.success)
  }
}

const createSettingsActions = (context: SettingsActionsContext) => ({
  onBindingActivate: (action: string) => context.options.callbacks?.onBindingActivate?.(action),
  onChoiceChange: (field: SettingsChoiceField, value: SettingsChoiceValue) =>
    handleChoiceChange(field, value, context),
  onClose: context.closeSettings,
  onSliderChange: (field: SettingsSliderField, value: SettingsSliderValue) =>
    handleSliderChange(field, value, context),
  onToggleChange: (field: SettingsToggleField, checked: boolean) =>
    handleToggleChange(field, checked, context),
})

const createSettingsFocusActions = (
  document: Document,
  dialog: HTMLElement,
): Readonly<{ openSettings: () => void; closeSettings: () => void }> => {
  let restoreFocus: HTMLElement | null = null
  const openSettings = (): void => {
    if (!dialog.hidden) {
      return
    }
    if (focusable(document.activeElement)) {
      restoreFocus = document.activeElement
    } else {
      restoreFocus = null
    }
    dialog.hidden = false
    dialog.querySelector<HTMLElement>('[data-settings-field="mouseSensitivity"]')?.focus()
  }
  const closeSettings = (): void => {
    if (dialog.hidden) {
      return
    }
    dialog.hidden = true
    const target = restoreFocus
    restoreFocus = null
    if (target?.isConnected === true) {
      target.focus()
    }
  }
  return { closeSettings, openSettings }
}

const initialSettingsSnapshot = (options: CreateSessionOverlaysOptions): unknown => {
  if (typeof options.initialSettingsSnapshot !== 'undefined') {
    return options.initialSettingsSnapshot
  }
  if (typeof options.initialSettings === 'undefined') {
    return DEFAULT_SETTINGS
  }
  return mergeLegacySettings(options.initialSettings, DEFAULT_SETTINGS)
}

const initializeSettingsController = (
  options: CreateSessionOverlaysOptions,
  state: SettingsControllerState,
  updateSettingsSnapshot: SettingsSnapshotUpdater,
): Result.Result<SettingsSnapshot, SettingsViewModelFailure> =>
  updateSettingsSnapshot(initialSettingsSnapshot(options), state.activeLanguage)

type SettingsController = {
  readonly view: ReturnType<typeof createSettingsView>
  readonly initializationResult: Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateSettings: (settings: UiSettings) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateSettingsSnapshot: SettingsSnapshotUpdater
  readonly openSettings: () => void
  readonly closeSettings: () => void
}

const createSettingsController = (
  document: Document,
  dialog: HTMLElement,
  options: CreateSessionOverlaysOptions,
): SettingsController => {
  const state: SettingsControllerState = {
    activeLanguage: options.initialLanguage ?? 'en',
    activeSettings: DEFAULT_SETTINGS,
    view: null,
  }
  const focusActions = createSettingsFocusActions(document, dialog)
  const updateSettingsSnapshot: SettingsSnapshotUpdater = (input, language = state.activeLanguage) => {
    if (!isValidSettings(input)) {
      return Result.fail({ _tag: 'InvalidSettingsSnapshot' })
    }
    const model = settingsViewModel(input, DEFAULT_SETTINGS_BINDINGS, BINDABLE_ACTIONS, language)
    if (Result.isFailure(model)) {
      return Result.fail(model.failure)
    }
    state.activeSettings = input
    state.activeLanguage = model.success.language
    state.view?.render(model.success)
    return Result.succeed(state.activeSettings)
  }
  const renderCurrentSettings = (): Result.Result<SettingsSnapshot, SettingsViewModelFailure> =>
    updateSettingsSnapshot(state.activeSettings, state.activeLanguage)
  const view = createSettingsView(document, dialog, createSettingsActions({
    closeSettings: focusActions.closeSettings,
    options,
    renderCurrentSettings,
    state,
    updateSettingsSnapshot,
  }))
  state.view = view
  view.root.removeAttribute('data-mx-ui')
  const initializationResult = initializeSettingsController(options, state, updateSettingsSnapshot)
  const updateSettings = (settings: UiSettings): Result.Result<SettingsSnapshot, SettingsViewModelFailure> =>
    updateSettingsSnapshot(mergeLegacySettings(settings, state.activeSettings), state.activeLanguage)
  return {
    closeSettings: focusActions.closeSettings,
    initializationResult,
    openSettings: focusActions.openSettings,
    updateSettings,
    updateSettingsSnapshot,
    view,
  }
}

type OverlayShortcutContext = {
  readonly dialog: HTMLElement
  readonly toggleDebug: () => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
}

const handleDebugShortcut = (event: KeyboardEvent, context: OverlayShortcutContext): boolean => {
  if (event.key !== 'F1') {
    return false
  }
  event.preventDefault()
  context.toggleDebug()
  return true
}

const handleSettingsToggleShortcut = (event: KeyboardEvent, context: OverlayShortcutContext): boolean => {
  if (event.key !== 'F10') {
    return false
  }
  event.preventDefault()
  if (context.dialog.hidden) {
    context.openSettings()
  } else {
    context.closeSettings()
  }
  return true
}

const handleSettingsEscapeShortcut = (event: KeyboardEvent, context: OverlayShortcutContext): boolean => {
  if (event.key !== 'Escape' || context.dialog.hidden) {
    return false
  }
  event.preventDefault()
  event.stopPropagation()
  context.closeSettings()
  return true
}

const handleOverlayShortcut = (event: KeyboardEvent, context: OverlayShortcutContext): boolean =>
  handleDebugShortcut(event, context) ||
  handleSettingsToggleShortcut(event, context) ||
  handleSettingsEscapeShortcut(event, context)

const handleSettingsFocusNavigation = (event: KeyboardEvent, dialog: HTMLElement): boolean => {
  if (dialog.hidden || !isElementInside(dialog, event.target)) {
    return false
  }
  const direction = directionForArrowKey(event.key)
  const target = focusTargetForElement(event.target)
  if (direction !== null && target && moveFocusTarget(dialog, target, direction)) {
    event.preventDefault()
  }
  return true
}

const handleOverlayKeyDown = (
  event: KeyboardEvent,
  options: CreateSessionOverlaysOptions,
  context: OverlayShortcutContext,
): void => {
  if (event.repeat) {
    return
  }
  if (handleOverlayShortcut(event, context)) {
    return
  }
  if (handleSettingsFocusNavigation(event, context.dialog)) {
    return
  }
  if (context.dialog.hidden) {
    options.delegateKeyDown?.(event)
  }
}

const updateDebugHud = (debugHudText: TextCell, snapshot: DebugHudSnapshot): void => {
  const message = debugHudMessage(snapshot)
  writeLocalizedText(debugHudText, message.key, message.values)
}

export const createSessionOverlays = (
  document: Document,
  parent: HTMLElement,
  options: CreateSessionOverlaysOptions = {},
): SessionOverlays => {
  const elements = createOverlayElements(document, parent)
  const settings = createSettingsController(document, elements.dialog, options)
  const toggleDebug = (): void => {
    elements.debugHud.hidden = !elements.debugHud.hidden
  }
  const shortcutContext: OverlayShortcutContext = {
    closeSettings: settings.closeSettings,
    dialog: elements.dialog,
    openSettings: settings.openSettings,
    toggleDebug,
  }
  const onKeyDown = (event: KeyboardEvent): void => handleOverlayKeyDown(event, options, shortcutContext)
  document.addEventListener('keydown', onKeyDown)
  const updateSettings = (settingsValue: UiSettings): Result.Result<SettingsSnapshot, SettingsViewModelFailure> =>
    settings.updateSettings(settingsValue)
  return {
    closeSettings: settings.closeSettings,
    debugHud: elements.debugHud,
    destroy: (): void => {
      document.removeEventListener('keydown', onKeyDown)
      elements.root.remove()
    },
    initializationResult: settings.initializationResult,
    openSettings: settings.openSettings,
    root: elements.root,
    settingsDialog: elements.dialog,
    toggleDebug,
    updateDebug: (snapshot) => updateDebugHud(elements.debugHudText, snapshot),
    updateSettings,
    updateSettingsSnapshot: settings.updateSettingsSnapshot,
  }
}
