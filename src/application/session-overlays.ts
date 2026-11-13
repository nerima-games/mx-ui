import { DEFAULT_SETTINGS, isValidSettings } from '@nerima-games/mc-sim'
import {
  DEFAULT_UI_LANGUAGE,
  type UiLanguage,
  type UiLanguageFailure,
  type UiMessageKey,
  type UiMessageText,
  decodeUiLanguage,
} from '../domain/ui-language.js'
import {
  type SettingsViewModelFailure as DomainSettingsViewModelFailure,
  type SettingsSnapshot,
  settingsViewModel,
} from '../domain/settings-view-model.js'
import { type InventoryNavigationDirection, focusTargetForElement, moveFocusTarget } from './inventory-navigation.js'
import {
  type SettingsChoiceField,
  type SettingsChoiceValue,
  type SettingsSliderField,
  type SettingsSliderValue,
  type SettingsToggleField,
  type SettingsView,
  type SettingsViewActions,
  type SettingsViewInputFailure,
  createSettingsView,
} from './settings-view.js'
import { type TextCell, textCell } from './dom-write.js'
import {
  applyValidatedUiLanguage,
  setLocalizedAttribute,
  setLocalizedText,
  writeLocalizedText,
} from './ui-localization.js'
import type { DomElement } from './dom-surface.js'
import type { InputAction as RenderInputAction } from '@nerima-games/mc-render'
import { Result } from 'effect'
import type { UiScale } from '../domain/accessibility.js'
import { KeyCode as kernelKeyCode } from '@nerima-games/mc-kernel/domain/settings'

export type DebugHudSnapshot = {
  readonly fps: number
  readonly coordinates: Readonly<{ worldX: number; worldY: number; worldZ: number }>
  readonly chunk: Readonly<{ chunkX: number; chunkZ: number }>
  readonly facing?: UiMessageText
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
  readonly onBindingActivate?: (action: BindableAction) => void
}

export type SessionKeyDelegate = (event: KeyboardEvent) => boolean

export type SessionOverlayInitializationFailure =
  | SettingsViewModelFailure
  | { readonly _tag: 'InvalidInitialDebugSnapshot' }
  | { readonly _tag: 'InvalidSessionOverlayInput'; readonly field: string }

type SettingsViewModelFailure = DomainSettingsViewModelFailure | SettingsViewInputFailure

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
  readonly initializationResult: Result.Result<SettingsSnapshot, SessionOverlayInitializationFailure>
  readonly updateDebug: (
    snapshot: DebugHudSnapshot,
  ) => Result.Result<void, { readonly _tag: 'InvalidSessionOverlayInput'; readonly field: string }>
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
  element !== null &&
  'focus' in element &&
  typeof element.focus === 'function' &&
  (element !== element.ownerDocument.body || element.hasAttribute('tabindex'))

const debugHudMessageKey = (facing: string | undefined): UiMessageKey => {
  if (typeof facing === 'undefined') {
    return 'debug.session'
  }
  return 'debug.session-facing'
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const hasNumberFields = (input: unknown, fields: ReadonlyArray<string>): boolean => {
  if (!isRecord(input)) {
    return false
  }
  return fields.every((field) => typeof Reflect.get(input, field) === 'number')
}

const invalidDebugHudScalarField = (facing: unknown, fps: unknown): string | undefined => {
  if (typeof facing !== 'undefined' && typeof facing !== 'string') {
    return 'facing'
  }
  if (typeof fps !== 'number') {
    return 'fps'
  }
  return
}

const invalidDebugHudPositionField = (coordinates: unknown, chunk: unknown): string | undefined => {
  if (!hasNumberFields(coordinates, ['worldX', 'worldY', 'worldZ'])) {
    return 'coordinates'
  }
  if (!hasNumberFields(chunk, ['chunkX', 'chunkZ'])) {
    return 'chunk'
  }
  return
}

const invalidDebugHudField = (snapshot: unknown): string | undefined => {
  if (!isRecord(snapshot)) {
    return 'snapshot'
  }
  const { coordinates, facing, fps, chunk } = snapshot
  const invalidScalarField = invalidDebugHudScalarField(facing, fps)
  if (typeof invalidScalarField !== 'undefined') {
    return invalidScalarField
  }
  return invalidDebugHudPositionField(coordinates, chunk)
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

type SettingsPatchField =
  | SettingsSliderField
  | Exclude<SettingsChoiceField, 'language'>
  | SettingsToggleField

const patchSettings = (
  current: SettingsSnapshot,
  field: SettingsPatchField,
  value: SettingsSliderValue | SettingsChoiceValue | boolean,
): unknown => {
  switch (field) {
    case 'graphicsPreset': return patchGraphicsPreset(current, value)
    default: return { ...current, [field]: value }
  }
}

const settingsTitle = (document: Document, dialog: HTMLElement): void => {
  const title = document.createElement('h2')
  setLocalizedText(title, 'pause.title.options')
  dialog.appendChild(title)
}

const configureSettingsDialog = (dialog: HTMLElement): void => {
  dialog.setAttribute('data-mx-ui', 'settings')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  setLocalizedAttribute(dialog, 'aria-label', 'pause.dialog.options')
  dialog.style.setProperty('box-sizing', 'border-box')
  dialog.style.setProperty(
    'max-height',
    'calc(100vh - 2rem - var(--mx-ui-safe-area-top, env(safe-area-inset-top, 0px)) - var(--mx-ui-safe-area-bottom, env(safe-area-inset-bottom, 0px)))',
  )
  dialog.style.setProperty('flex-direction', 'column')
  dialog.style.setProperty('overflow-y', 'hidden')
  dialog.hidden = true
}

const configurePauseSettingsScroller = (root: DomElement): void => {
  root.removeAttribute('data-mx-ui')
  root.style.setProperty('flex', '1 1 auto')
  root.style.setProperty('min-height', '0')
  root.style.setProperty('max-height', 'none')
}

const settingsDialog = (document: Document, parent: HTMLElement): HTMLElement => {
  const dialog = document.createElement('section')
  configureSettingsDialog(dialog)
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
  initialLanguageFailure: SettingsViewModelFailure | null
  view: SettingsView<BindableAction> | null
}

type SettingsSnapshotUpdater = (
  input: unknown,
  language?: UiLanguage,
) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>

type SettingsActionsContext = {
  readonly dialog: HTMLElement
  readonly options: CreateSessionOverlaysOptions
  readonly state: SettingsControllerState
  readonly updateSettingsSnapshot: SettingsSnapshotUpdater
  readonly renderCurrentSettings: () => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly closeSettings: () => void
}

const applySettingsLanguage = (context: SettingsActionsContext, language: UiLanguage): void => {
  applyValidatedUiLanguage(context.dialog, language)
  context.state.activeLanguage = language
  context.options.callbacks?.onLanguageChange?.(context.state.activeLanguage)
  context.renderCurrentSettings()
}

const isTaggedFailure = (input: unknown): boolean => {
  if (!isRecord(input)) {
    return false
  }
  const { _tag: tag } = input
  return typeof tag === 'string'
}

const isUiLanguageResult = (
  input: unknown,
): input is Result.Result<UiLanguage, UiLanguageFailure | SettingsViewModelFailure> => {
  if (!isRecord(input)) {
    return false
  }
  const { _tag: tag, failure, success } = input
  if (tag === 'Failure') {
    return isTaggedFailure(failure)
  }
  if (tag !== 'Success') {
    return false
  }
  return success === 'en' || success === 'ja'
}

const handleLanguageChoice = (
  value: UiLanguage,
  context: SettingsActionsContext,
): Result.Result<
  void,
  UiLanguageFailure | SettingsViewModelFailure | { readonly _tag: 'InvalidSessionOverlayInput'; readonly field: string }
> => {
  const {onLanguageChange} = context.options
  if (onLanguageChange === null) {
    return Result.fail({ _tag: 'InvalidSessionOverlayInput', field: 'onLanguageChange' })
  }
  let languageResult: unknown = Result.succeed(value)
  if (typeof onLanguageChange !== 'undefined') {
    languageResult = onLanguageChange(value)
  }
  if (!isUiLanguageResult(languageResult)) {
    return Result.fail({ _tag: 'InvalidSessionOverlayInput', field: 'onLanguageChange.result' })
  }
  return Result.map(languageResult, (language) => {
    applySettingsLanguage(context, language)
  })
}

const handleChoiceChange = (
  field: SettingsChoiceField,
  value: SettingsChoiceValue,
  context: SettingsActionsContext,
): Result.Result<
  void,
  UiLanguageFailure | SettingsViewModelFailure | { readonly _tag: 'InvalidSessionOverlayInput'; readonly field: string }
> => {
  if (field === 'language') {
    return Result.flatMap(decodeUiLanguage(value), (language) => handleLanguageChoice(language, context))
  }
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, value),
    context.state.activeLanguage,
  )
  return Result.map(updated, (settings) => {
    context.options.callbacks?.onSettingsChange?.(settings)
  })
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
): Result.Result<void, SettingsViewModelFailure> => {
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, value),
    context.state.activeLanguage,
  )
  return Result.map(updated, (settings) => {
    notifyLegacySliderChange(field, value, context.options.callbacks)
    context.options.callbacks?.onSettingsChange?.(settings)
  })
}

const handleToggleChange = (
  field: SettingsToggleField,
  checked: boolean,
  context: SettingsActionsContext,
): Result.Result<void, SettingsViewModelFailure> => {
  const updated = context.updateSettingsSnapshot(
    patchSettings(context.state.activeSettings, field, checked),
    context.state.activeLanguage,
  )
  return Result.map(updated, (settings) => {
    context.options.callbacks?.onSettingsChange?.(settings)
  })
}

const createSettingsActions = (context: SettingsActionsContext): SettingsViewActions<BindableAction> => ({
  onBindingActivate: (action) => context.options.callbacks?.onBindingActivate?.(action),
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
    dialog.style.setProperty('display', 'flex')
    dialog.hidden = false
    dialog.querySelector<HTMLElement>('[data-settings-field="mouseSensitivity"]')?.focus()
  }
  const closeSettings = (): void => {
    if (dialog.hidden) {
      return
    }
    dialog.hidden = true
    dialog.style.removeProperty('display')
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
): Result.Result<SettingsSnapshot, SettingsViewModelFailure> => {
  if (state.initialLanguageFailure !== null) {
    return Result.fail(state.initialLanguageFailure)
  }
  return updateSettingsSnapshot(initialSettingsSnapshot(options), state.activeLanguage)
}

type SettingsController = {
  readonly view: SettingsView<BindableAction>
  readonly initializationResult: Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateSettings: (settings: UiSettings) => Result.Result<SettingsSnapshot, SettingsViewModelFailure>
  readonly updateSettingsSnapshot: SettingsSnapshotUpdater
  readonly openSettings: () => void
  readonly closeSettings: () => void
}

const createSettingsControllerState = (
  dialog: HTMLElement,
  options: CreateSessionOverlaysOptions,
): SettingsControllerState => {
  let initialLanguageResult: Result.Result<UiLanguage, UiLanguageFailure> = Result.succeed(DEFAULT_UI_LANGUAGE)
  if (typeof options.initialLanguage !== 'undefined') {
    initialLanguageResult = decodeUiLanguage(options.initialLanguage)
  }
  let initialLanguage = DEFAULT_UI_LANGUAGE
  let initialLanguageFailure: SettingsViewModelFailure | null = null
  if (Result.isFailure(initialLanguageResult)) {
    initialLanguageFailure = { _tag: 'InvalidSettingsLanguage' }
  } else {
    initialLanguage = initialLanguageResult.success
  }
  applyValidatedUiLanguage(dialog, initialLanguage)
  return {
    activeLanguage: initialLanguage,
    activeSettings: DEFAULT_SETTINGS,
    initialLanguageFailure,
    view: null,
  }
}

const createSettingsController = (
  document: Document,
  dialog: HTMLElement,
  options: CreateSessionOverlaysOptions,
): SettingsController => {
  const state = createSettingsControllerState(dialog, options)
  const focusActions = createSettingsFocusActions(document, dialog)
  const updateSettingsSnapshot: SettingsSnapshotUpdater = (input, language = state.activeLanguage) => {
    if (!isValidSettings(input)) {
      return Result.fail({ _tag: 'InvalidSettingsSnapshot' })
    }
    const model = settingsViewModel(input, DEFAULT_SETTINGS_BINDINGS, BINDABLE_ACTIONS, language)
    return Result.flatMap(model, (viewModel) => {
      const saveSettings = (): SettingsSnapshot => {
        state.activeSettings = input
        state.activeLanguage = viewModel.language
        return state.activeSettings
      }
      if (state.view === null) {
        return Result.succeed(saveSettings())
      }
      return Result.map(state.view.render(viewModel), saveSettings)
    })
  }
  const renderCurrentSettings = (): Result.Result<SettingsSnapshot, SettingsViewModelFailure> =>
    updateSettingsSnapshot(state.activeSettings, state.activeLanguage)
  const view = createSettingsView(document, dialog, createSettingsActions({
    closeSettings: focusActions.closeSettings,
    dialog,
    options,
    renderCurrentSettings,
    state,
    updateSettingsSnapshot,
  }))
  state.view = view
  configurePauseSettingsScroller(view.root)
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

const updateDebugHud = (
  debugHudText: TextCell,
  snapshot: DebugHudSnapshot,
): Result.Result<void, { readonly _tag: 'InvalidSessionOverlayInput'; readonly field: string }> => {
  const invalidField = invalidDebugHudField(snapshot)
  if (typeof invalidField !== 'undefined') {
    return Result.fail({ _tag: 'InvalidSessionOverlayInput', field: invalidField })
  }
  const message = debugHudMessage(snapshot)
  writeLocalizedText(debugHudText, message.key, message.values)
  return Result.void
}

const initializeDebugHud = (
  debugHudText: TextCell,
  initialDebug: DebugHudSnapshot | null | undefined,
): Result.Result<DebugHudSnapshot, { readonly _tag: 'InvalidInitialDebugSnapshot' }> => {
  if (initialDebug === null) {
    return Result.fail({ _tag: 'InvalidInitialDebugSnapshot' })
  }
  let snapshot = DEFAULT_DEBUG_HUD_SNAPSHOT
  if (typeof initialDebug !== 'undefined') {
    snapshot = initialDebug
  }
  const invalidField = invalidDebugHudField(snapshot)
  if (typeof invalidField !== 'undefined') {
    return Result.fail({ _tag: 'InvalidInitialDebugSnapshot' })
  }
  updateDebugHud(debugHudText, snapshot)
  return Result.succeed(snapshot)
}

export const createSessionOverlays = (
  document: Document,
  parent: HTMLElement,
  options: CreateSessionOverlaysOptions = {},
): SessionOverlays => {
  const elements = createOverlayElements(document, parent)
  const initialDebugResult = initializeDebugHud(elements.debugHudText, options.initialDebug)
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
    initializationResult: Result.flatMap(initialDebugResult, () => settings.initializationResult),
    openSettings: settings.openSettings,
    root: elements.root,
    settingsDialog: elements.dialog,
    toggleDebug,
    updateDebug: (snapshot) => updateDebugHud(elements.debugHudText, snapshot),
    updateSettings,
    updateSettingsSnapshot: settings.updateSettingsSnapshot,
  }
}
