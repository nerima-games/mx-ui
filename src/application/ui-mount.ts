import * as Scope from 'effect/Scope'
import {
  type AchievementToastSubscription,
  startAchievementToastSubscriber,
} from './achievement-toast-subscriber.js'
import { type AchievementToastView, createAchievementToastView } from './achievement-toast-view.js'
import { type CrosshairView, createCrosshairView } from './crosshair-view.js'
import {
  type ColorVisionFilterController,
  type ColorVisionFilterFailure,
  createColorVisionFilterController,
} from './color-vision-filters.js'
import {
  DEFAULT_DEBUG_HUD_SNAPSHOT,
  DEFAULT_UI_SETTINGS,
  type DebugHudSnapshot,
  type SessionOverlays,
  type UiSettings,
  type UiSettingsCallbacks,
  createSessionOverlays,
} from './session-overlays.js'
import { DEFAULT_SETTINGS, DomainEventBus, isValidSettings } from '@nerima-games/mc-sim'
import {
  DEFAULT_UI_LANGUAGE,
  type UiLanguage,
  type UiLanguageFailure,
  decodeUiLanguage,
} from '../domain/ui-language.js'
import { Effect, Exit, Result, Schema } from 'effect'
import {
  HOTBAR_SLOT_COUNT,
  type HudViewModel,
  hudViewModel,
  spawnSnapshot,
} from '../domain/hud-view-model.js'
import { type HudView, createHudView } from './hud-view.js'
import {
  type InventoryAction,
  type InventoryActionState,
  type InventoryDragTarget,
  inventoryActionStatus,
  inventoryActionTarget,
} from './inventory-actions.js'
import {
  type InventoryInteractionTarget,
  type InventoryView,
  createInventoryView,
} from './inventory-view.js'
import {
  type InventoryNavigationDirection,
  focusTargetForElement as focusTargetForUiElement,
  inventoryTargets,
  moveFocusTarget,
  moveInventoryTarget,
  sameInventoryTarget,
} from './inventory-navigation.js'
import {
  type InventoryViewModel,
  emptyInventorySnapshot,
  inventoryViewModel,
} from '../domain/inventory-view-model.js'
import {
  type MainMenuCallbacks,
  type MainMenuView,
  createMainMenuView,
} from './main-menu-view.js'
import { type MotionPreference, type UiScale, decodeUiScale } from '../domain/accessibility.js'
import {
  type MotionMediaQuery,
  type MotionPreferenceController,
  type MotionPreferenceControllerFailure,
  REDUCED_MOTION_MEDIA_QUERY,
  createMotionPreferenceController,
} from './accessibility-dom.js'
import type { SettingsSnapshot, SettingsViewModelFailure } from '../domain/settings-view-model.js'
import { finishToastSubscriptionClose, finishUiMountCleanup } from './ui-mount-cleanup.js'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu.js'
import type { AchievementToast } from '../domain/achievement-toast.js'
import { type CrosshairViewModel } from '../domain/crosshair.js'
import type { FocusTarget } from '@nerima-games/mc-render'
import { UiMountError } from './ui-mount-error.js'
import type { UiQaSnapshot } from '../domain/ui-qa.js'
import { applyUiLanguage } from './ui-localization.js'
import { applyUiScale } from './ui-scale.js'
import { createUiModuleInstance } from './ui-module-instance.js'
import { uiModule } from '../stages/registration.js'

export { UiMountError } from './ui-mount-error.js'

const HOTBAR_START_INDEX = 0
const INITIAL_SELECTED_HOTBAR_SLOT = 0

export type UiMountedViews = {
  readonly root: HTMLElement
  readonly hud: HudView
  readonly crosshair: CrosshairView
  readonly inventory: InventoryView
  readonly mainMenu: MainMenuView
  readonly overlays: SessionOverlays
  readonly achievementToast: AchievementToastView
}

type SettingsPreferenceFailure = Schema.SchemaError | ColorVisionFilterFailure | MotionPreferenceControllerFailure
type SettingsOperationFailure = SettingsViewModelFailure | SettingsPreferenceFailure
type SettingsLanguageFailure = UiLanguageFailure | SettingsViewModelFailure
type MountInitializationFailure = SettingsPreferenceFailure | SettingsViewModelFailure

export type UiMountOptions = {
  readonly root: HTMLElement
  readonly motion?: MotionPreference
  readonly initialLanguage?: UiLanguage
  readonly menuCallbacks?: MainMenuCallbacks
  readonly initialSettings?: UiSettings
  readonly initialSettingsSnapshot?: SettingsSnapshot
  readonly settingsCallbacks?: UiSettingsCallbacks
  readonly colorVisionTarget?: HTMLElement
  readonly initialDebugSnapshot?: DebugHudSnapshot
  readonly onInventoryActivate?: (target: InventoryInteractionTarget) => void
  readonly onInventoryAction?: (action: InventoryAction) => void
  readonly onRespawn?: () => void
}

/** The browser-session shape consumed by mc-compose, without a package cycle. */
export type UiMount = {
  readonly name: string
  readonly start: Effect.Effect<
    typeof uiModule,
    UiMountError | Schema.SchemaError,
    DomainEventBus | Scope.Scope
  >
  readonly stop: Effect.Effect<void, UiMountError | Schema.SchemaError>
  readonly current: () => UiMountedViews | undefined
  readonly updateHud: (model: HudViewModel) => void
  readonly updateCrosshair: (model: CrosshairViewModel | undefined) => void
  /** Apply a hit immediately; the next frame's updateCrosshair result owns expiry. */
  readonly notifyHit: () => void
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => Result.Result<UiScale, SettingsOperationFailure>
  readonly updateSettingsSnapshot: (settings: unknown) => Result.Result<SettingsSnapshot, SettingsOperationFailure>
  readonly updateLanguage: (language: unknown) => Result.Result<UiLanguage, SettingsLanguageFailure>
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly openInventory: (model?: InventoryViewModel) => void
  readonly closeInventory: () => void
  readonly updateInventory: (model: InventoryViewModel) => void
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly moveFocus: (direction: InventoryNavigationDirection) => boolean
  readonly activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
  readonly dragInventorySlot: (
    source: InventoryDragTarget,
    target: InventoryDragTarget,
  ) => boolean
  readonly updateInventoryActionState: (state: InventoryActionState) => void
}

const ZERO = 0

export const inventoryTargetAt = (
  targets: ReadonlyArray<InventoryInteractionTarget>,
  index: number,
): InventoryInteractionTarget | null => {
  const target = targets[index]
  if (typeof target === 'undefined') {
    return null
  }
  return target
}

/** The mutable session state one `makeUiMount` call owns, gathered into one cell. */
type UiMountSession = {
  achievementToast?: AchievementToast
  mounted: UiMountedViews | null
  settings: SettingsSnapshot
  settingsFailure: SettingsOperationFailure | null
  language: UiLanguage
  debugSnapshot: DebugHudSnapshot
  inventoryModel: InventoryViewModel
  inventoryOpen: boolean
  inventoryFocus: InventoryInteractionTarget
  inventoryActionState: InventoryActionState
  hudModel: HudViewModel
  crosshairModel?: CrosshairViewModel
  inventoryRestoreFocus: HTMLElement | null
  toastScope: Scope.Closeable | null
  toastSubscription: AchievementToastSubscription | null
  motionController: MotionPreferenceController | null
  colorVisionController: ColorVisionFilterController | null
}

/** `document.activeElement` narrowed to something focus-restorable, or nothing. */
const restoreFocusTarget = (active: Element | null): HTMLElement | null => {
  if (active instanceof HTMLElement) {
    return active
  }
  return null
}

/** Where keyboard focus lands after a render: the crafting output, or a real slot. */
const inventoryFocusTarget = (
  root: HTMLElement | null,
  focus: InventoryInteractionTarget,
): HTMLElement | null | undefined => {
  if (focus.kind === 'crafting-output') {
    return root?.querySelector<HTMLElement>('[data-mx-ui="crafting-output"]')
  }
  return root
    ?.querySelector<HTMLElement>(`[data-region="${focus.region}"]`)
    ?.querySelectorAll<HTMLElement>('[data-mx-ui="slot"]')[focus.index]
}

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }
  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }
  return target instanceof HTMLElement && target.isContentEditable
}

/** Everything a keyboard handler needs, gathered so each handler takes one argument. */
type InventoryKeyContext = {
  readonly session: UiMountSession
  readonly closeInventory: () => void
  readonly openInventory: () => void
}

const handleToggleKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  if (isEditableKeyboardTarget(event.target)) {
    return false
  }
  if (ctx.session.inventoryOpen) {
    ctx.closeInventory()
  } else {
    ctx.openInventory()
  }
  return true
}

const handleEscapeKey = (_event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  ctx.closeInventory()
  return true
}

type KeyHandler = {
  readonly matches: (event: KeyboardEvent) => boolean
  readonly handle: (event: KeyboardEvent, ctx: InventoryKeyContext) => boolean
}

const INVENTORY_KEY_HANDLERS: ReadonlyArray<KeyHandler> = [
  { handle: handleEscapeKey, matches: (event) => event.key === 'Escape' },
]

/**
 * `E` always toggles, everything else requires the inventory to already be
 * open — same priority order the original sequential `if` chain used.
 */
const dispatchOpenInventoryKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  const handler = INVENTORY_KEY_HANDLERS.find(({ matches }) => matches(event))
  if (typeof handler === 'undefined') {
    return false
  }
  return handler.handle(event, ctx)
}

const dispatchInventoryKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  if (event.key.toLowerCase() === 'e') {
    return handleToggleKey(event, ctx)
  }
  if (!ctx.session.inventoryOpen) {
    return false
  }
  return dispatchOpenInventoryKey(event, ctx)
}

/** Creates the mx-ui owned root or fails in the Effect error channel. */
const requireOwnedRoot = (
  root: HTMLElement,
): Effect.Effect<{ readonly document: Document; readonly ownedRoot: HTMLElement }, UiMountError> => {
  const document = root.ownerDocument
  if (document === null) {
    return Effect.fail(new UiMountError('The mx-ui mount root has no ownerDocument'))
  }
  return Effect.try({
    catch: (cause) => new UiMountError('Failed to mount mx-ui', { cause }),
    try: () => {
      const ownedRoot = document.createElement('div')
      ownedRoot.setAttribute('data-mx-ui', 'mount-root')
      root.appendChild(ownedRoot)
      return { document, ownedRoot }
    },
  })
}

type PartialMount = {
  hud?: HudView
  mainMenu: MainMenuView | null
  overlays: SessionOverlays | null
  motionController: MotionPreferenceController | null
  colorVisionController: ColorVisionFilterController | null
  readonly ownedRoot: HTMLElement
}

/** Removes the views and owned root left by a failed initialization. */
const destroyPartialMount = (partial: PartialMount): Effect.Effect<void, UiMountError> =>
  Effect.try({
    catch: (cause) => new UiMountError('Failed to clean up partial mx-ui mount', { cause }),
    try: () => {
      partial.hud?.dispose()
      partial.mainMenu?.destroy()
      partial.overlays?.destroy()
      partial.motionController?.dispose()
      partial.colorVisionController?.dispose()
      partial.ownedRoot.remove()
    },
  })

type MutableMainMenuCallbacks = {
  -readonly [Key in keyof MainMenuCallbacks]?: MainMenuCallbacks[Key]
}

const addWorldMenuCallbacks = (
  result: MutableMainMenuCallbacks,
  callbacks: MainMenuCallbacks | undefined,
): void => {
  if (typeof callbacks?.onCreateWorld === 'function') {
    result.onCreateWorld = (request) => callbacks?.onCreateWorld?.(request)
  }
  if (typeof callbacks?.onLoadWorld === 'function') {
    result.onLoadWorld = (world) => callbacks?.onLoadWorld?.(world)
  }
  if (typeof callbacks?.onDeleteWorld === 'function') {
    result.onDeleteWorld = (world) => callbacks?.onDeleteWorld?.(world)
  }
  if (typeof callbacks?.onDeleteUnreadableSave === 'function') {
    result.onDeleteUnreadableSave = (save) => callbacks?.onDeleteUnreadableSave?.(save)
  }
}

const addOtherMenuCallbacks = (
  result: MutableMainMenuCallbacks,
  callbacks: MainMenuCallbacks | undefined,
): void => {
  if (typeof callbacks?.onExportWorld === 'function') {
    result.onExportWorld = (world) => callbacks?.onExportWorld?.(world)
  }
  if (typeof callbacks?.onOpenMultiplayer === 'function') {
    result.onOpenMultiplayer = () => callbacks?.onOpenMultiplayer?.()
  }
  if (typeof callbacks?.onExit === 'function') {
    result.onExit = () => callbacks?.onExit?.()
  }
  if (typeof callbacks?.onStateChange === 'function') {
    result.onStateChange = (state) => callbacks?.onStateChange?.(state)
  }
}

const buildMenuCallbacks = (
  overlays: SessionOverlays,
  callbacks: MainMenuCallbacks | undefined,
): MainMenuCallbacks => {
  const result: MutableMainMenuCallbacks = {}
  addWorldMenuCallbacks(result, callbacks)
  addOtherMenuCallbacks(result, callbacks)
  result.onOpenSettings = () => {
      overlays.openSettings()
      callbacks?.onOpenSettings?.()
  }
  return result
}

const removeUiMountedViews = (
  previous: UiMountedViews | null,
  message: string,
): Effect.Effect<void, UiMountError> =>
  Effect.try({
    catch: (cause) => new UiMountError(message, { cause }),
    try: () => {
      previous?.hud.dispose()
      previous?.mainMenu.destroy()
      previous?.overlays.destroy()
      previous?.root.remove()
    },
  })

const createAchievementToastLifecycle = (session: UiMountSession) => {
  const close = (): Effect.Effect<void, Schema.SchemaError> => {
    const subscription = session.toastSubscription
    const scope = session.toastScope
    session.toastScope = null
    session.toastSubscription = null

    return Effect.gen(function* closeToast() {
      const subscriptionResult = yield* Effect.result(subscription?.close ?? Effect.void)
      if (scope !== null) {
        yield* Scope.close(scope, Exit.void)
      }
      delete session.achievementToast
      yield* finishToastSubscriptionClose(subscriptionResult)
    })
  }

  const read = (): UiQaSnapshot => {
    const { achievementToast } = session
    if (typeof achievementToast === 'undefined') {
      return {}
    }
    return { achievementToast }
  }

  const start = (
    mounted: UiMountedViews,
  ): Effect.Effect<void, never, DomainEventBus | Scope.Scope> =>
    Effect.gen(function* startToastSubscription() {
      const parentScope = yield* Scope.Scope
      const scope = yield* Scope.make()
      yield* Scope.addFinalizer(parentScope, Scope.close(scope, Exit.void))
      session.toastScope = scope
      const subscription = yield* startAchievementToastSubscriber((toast) => {
        session.achievementToast = toast
        mounted.achievementToast.render(toast)
      }).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.onInterrupt(() => Scope.close(scope, Exit.void)),
      )
      session.toastSubscription = subscription
    })

  return { close, read, start }
}

const validatedInitialSettingsState = (
  input: unknown,
): Readonly<{ failure: SettingsViewModelFailure | null; settings: SettingsSnapshot }> => {
  if (isValidSettings(input)) {
    return { failure: null, settings: input }
  }
  return { failure: { _tag: 'InvalidSettingsSnapshot' }, settings: DEFAULT_SETTINGS }
}

const createMountState = (options: UiMountOptions): Readonly<{
  session: UiMountSession
  toastLifecycle: ReturnType<typeof createAchievementToastLifecycle>
}> => {
  const legacySettings = options.initialSettings ?? DEFAULT_UI_SETTINGS
  const initialSettings: unknown = options.initialSettingsSnapshot ?? {
    ...DEFAULT_SETTINGS,
    fovDegrees: legacySettings.fieldOfView,
    masterVolume: legacySettings.masterVolume,
    mouseSensitivity: legacySettings.mouseSensitivity,
    renderDistance: legacySettings.renderDistance,
    uiScale: legacySettings.uiScale,
  }
  const initialSettingsState = validatedInitialSettingsState(initialSettings)
  const session: UiMountSession = {
    colorVisionController: null,
    debugSnapshot: options.initialDebugSnapshot ?? DEFAULT_DEBUG_HUD_SNAPSHOT,
    hudModel: hudViewModel(
      spawnSnapshot,
      emptyInventorySnapshot.inventory.slots.slice(HOTBAR_START_INDEX, HOTBAR_SLOT_COUNT),
      INITIAL_SELECTED_HOTBAR_SLOT,
    ),
    inventoryActionState: { kind: 'idle' },
    inventoryFocus: { index: ZERO, kind: 'slot', region: 'hotbar' },
    inventoryModel: inventoryViewModel(emptyInventorySnapshot),
    inventoryOpen: false,
    inventoryRestoreFocus: null,
    language: options.initialLanguage ?? DEFAULT_UI_LANGUAGE,
    motionController: null,
    mounted: null,
    settings: initialSettingsState.settings,
    settingsFailure: initialSettingsState.failure,
    toastScope: null,
    toastSubscription: null,
  }
  return { session, toastLifecycle: createAchievementToastLifecycle(session) }
}

const motionPreferenceQuery = (document: Document): MotionMediaQuery => {
  const view = document.defaultView
  if (typeof view?.matchMedia === 'function') {
    return view.matchMedia(REDUCED_MOTION_MEDIA_QUERY)
  }
  return {
    addEventListener: () => {
      // A document without a window has no media query event source.
    },
    matches: false,
    removeEventListener: () => {
      // A document without a window has no media query event source.
    },
  }
}

const isInventoryFocusTarget = (session: UiMountSession, target: FocusTarget): boolean => {
  if (!session.inventoryOpen) {
    return false
  }
  if (target.group === 'crafting-output') {
    session.inventoryFocus = { kind: 'crafting-output' }
    return true
  }
  const region = session.inventoryModel.regions.find((candidate) => candidate.id === target.group)
  if (region?.kind !== 'slots' || target.index >= region.slots.length) {
    return false
  }
  session.inventoryFocus = { index: target.index, kind: 'slot', region: region.id }
  return true
}

const activationKind = (shiftKey: boolean): 'click' | 'shift-click' => {
  if (shiftKey) {
    return 'shift-click'
  }
  return 'click'
}

type InventoryOperations = {
  readonly activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
  readonly dragInventorySlot: (source: InventoryDragTarget, target: InventoryDragTarget) => boolean
  readonly moveFocus: (direction: InventoryNavigationDirection) => boolean
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly renderInventory: (view: InventoryView, focus?: boolean) => void
  readonly syncKeyboardFocus: () => void
}

const applySettingsScale = (
  root: HTMLElement,
  scale: number,
): ReturnType<typeof applyUiScale> => applyUiScale(root.style, scale)

const applySettingsColorVision = (
  controller: ColorVisionFilterController | null,
  correction: SettingsSnapshot['colorVisionCorrection'],
): Result.Result<boolean, ColorVisionFilterFailure> => {
  if (controller === null) {
    return Result.succeed(false)
  }
  return Result.map(controller.apply(correction), () => true)
}

const createInventoryOperations = (
  session: UiMountSession,
  options: UiMountOptions,
): InventoryOperations => {
  const syncKeyboardFocus = (): void => {
    const focusedTarget = focusTargetForUiElement(options.root.ownerDocument.activeElement)
    if (focusedTarget?.group === 'hotbar') {
      session.mounted?.hud.setKeyboardFocus(focusedTarget.index)
      return
    }
    session.mounted?.hud.setKeyboardFocus()
  }

  const renderInventory = (view: InventoryView, focus = false): void => {
    const targets = inventoryTargets(session.inventoryModel)
    // Host-assembled models can have no navigable slot. Retain an inert target
    // Until a later render supplies one.
    session.inventoryFocus =
      targets.find((target) => sameInventoryTarget(target, session.inventoryFocus)) ??
      targets[ZERO] ?? { kind: 'crafting-output' }
    view.render(session.inventoryModel, {
      focused: session.inventoryFocus,
      status: inventoryActionStatus(session.inventoryActionState),
    })
    if (focus && targets.length > ZERO) {
      const root = options.root.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
      const target = inventoryFocusTarget(root, session.inventoryFocus)
      target?.focus()
      syncKeyboardFocus()
    }
  }

  const moveInventoryFocus = (direction: InventoryNavigationDirection): boolean => {
    const view = session.mounted?.inventory
    if (!session.inventoryOpen || typeof view === 'undefined') {
      return false
    }
    session.inventoryFocus = moveInventoryTarget(session.inventoryModel, session.inventoryFocus, direction)
    renderInventory(view, true)
    return true
  }

  const moveFocus = (direction: InventoryNavigationDirection): boolean => {
    const target = focusTargetForUiElement(options.root.ownerDocument.activeElement)
    if (typeof target === 'undefined') {
      return false
    }
    if (isInventoryFocusTarget(session, target)) {
      return moveInventoryFocus(direction)
    }
    const moved = moveFocusTarget(options.root, target, direction)
    if (!moved) {
      return false
    }
    syncKeyboardFocus()
    return true
  }

  const activateInventoryFocus = (kind: 'click' | 'shift-click' = 'click'): boolean => {
    if (!session.inventoryOpen) {
      return false
    }
    const target = inventoryActionTarget(session.inventoryFocus)
    // `offhandRegion` always builds exactly one offhand slot.
    // `inventoryActionTarget` (inventory-actions.ts) answers `null` for any other offhand index.
    // Only a hand-built `InventoryViewModel` with a widened offhand region can reach this.
    if (target === null) {
      return false
    }
    options.onInventoryAction?.({ kind, target })
    options.onInventoryActivate?.(session.inventoryFocus)
    return true
  }

  const dragInventorySlot = (source: InventoryDragTarget, target: InventoryDragTarget): boolean => {
    if (!session.inventoryOpen) {
      return false
    }
    options.onInventoryAction?.({ kind: 'drag', source, target })
    return true
  }

  return {
    activateInventoryFocus,
    dragInventorySlot,
    moveFocus,
    moveInventoryFocus,
    renderInventory,
    syncKeyboardFocus,
  }
}

type BaseViewsContext = {
  readonly document: Document
  readonly ownedRoot: HTMLElement
  readonly partial: PartialMount
  readonly options: UiMountOptions
  readonly session: UiMountSession
  readonly inventory: InventoryOperations
}

const applyExplicitMotionOverride = (
  motion: MotionPreference | undefined,
  hud: HudView,
  crosshair: CrosshairView,
): void => {
  if (typeof motion !== 'undefined') {
    hud.setMotion(motion)
    crosshair.setMotion(motion)
  }
}

const configureMotionPreference = (
  context: BaseViewsContext,
  hud: HudView,
  crosshair: CrosshairView,
): Result.Result<boolean, Schema.SchemaError> => {
  const result = createMotionPreferenceController(
    motionPreferenceQuery(context.document),
    context.session.settings.reducedMotion,
    (preference) => {
      hud.setMotion(preference)
      crosshair.setMotion(preference)
    },
  )
  if (Result.isFailure(result)) {
    return Result.fail(result.failure)
  }
  context.session.motionController = result.success
  context.partial.motionController = result.success
  applyExplicitMotionOverride(context.options.motion, hud, crosshair)
  return Result.succeed(true)
}

const configureColorVision = (context: BaseViewsContext): Result.Result<boolean, ColorVisionFilterFailure> => {
  const target = context.options.colorVisionTarget ?? context.options.root.querySelector('canvas')
  if (target === null || typeof target === 'undefined') {
    return Result.succeed(false)
  }
  const controller = createColorVisionFilterController(context.ownedRoot, target)
  context.session.colorVisionController = controller
  context.partial.colorVisionController = controller
  return applySettingsColorVision(controller, context.session.settings.colorVisionCorrection)
}

const createInventoryKeyHandler = (
  context: BaseViewsContext,
  inventory: InventoryView,
): ((event: KeyboardEvent) => boolean) => {
  // No `if (!session.inventoryOpen) return` guard here, unlike the public
  // `closeInventory` member below: this closure is only reachable through
  // `dispatchInventoryKey`, and every key that reaches `INVENTORY_KEY_HANDLERS`
  // (including Escape) is already gated by `!ctx.session.inventoryOpen`
  // Returning `false` one level up — so `inventoryOpen` is always `true` here.
  // A guard restating that would be a branch no key event can ever take.
  const closeInventory = (): void => {
    context.session.inventoryOpen = false
    inventory.root.setAttribute('hidden', '')
    const target = context.session.inventoryRestoreFocus
    context.session.inventoryRestoreFocus = null
    if (target?.isConnected === true) {
      target.focus()
    }
    context.inventory.syncKeyboardFocus()
  }
  // No `if (session.inventoryOpen) return` guard here, unlike the public
  // `openInventory` member below: this closure's only real caller is
  // `handleToggleKey`, which calls it exclusively from the
  // `!ctx.session.inventoryOpen` branch of its own toggle — so `inventoryOpen`
  // Is always `false` here.
  const openInventory = (): void => {
    context.session.inventoryRestoreFocus = restoreFocusTarget(context.document.activeElement)
    context.session.inventoryOpen = true
    inventory.root.removeAttribute('hidden')
    context.inventory.renderInventory(inventory, true)
  }
  return (event) => dispatchInventoryKey(event, { closeInventory, openInventory, session: context.session })
}

const activateInventoryViewTarget = (
  context: BaseViewsContext,
  target: InventoryInteractionTarget,
  shiftKey: boolean,
): void => {
  context.session.inventoryFocus = target
  context.inventory.activateInventoryFocus(activationKind(shiftKey))
}

const updateInventoryViewFocus = (
  context: BaseViewsContext,
  target: InventoryInteractionTarget,
  inventory: InventoryView,
): void => {
  context.session.inventoryFocus = target
  context.inventory.renderInventory(inventory)
}

const createInitialInventoryView = (context: BaseViewsContext): InventoryView => {
  const inventory = createInventoryView(context.document, context.ownedRoot, {
    onActivate: (target, shiftKey) => activateInventoryViewTarget(context, target, shiftKey),
    onFocusChange: (target) => updateInventoryViewFocus(context, target, inventory),
  })
  inventory.root.setAttribute('hidden', '')
  context.inventory.renderInventory(inventory)
  return inventory
}

const configureBasePreferences = (
  context: BaseViewsContext,
  hud: HudView,
  crosshair: CrosshairView,
): Result.Result<boolean, SettingsPreferenceFailure> => {
  const motionResult = configureMotionPreference(context, hud, crosshair)
  if (Result.isFailure(motionResult)) {
    return Result.fail(motionResult.failure)
  }
  const colorVisionResult = configureColorVision(context)
  if (Result.isFailure(colorVisionResult)) {
    return Result.fail(colorVisionResult.failure)
  }
  const scaleResult = applySettingsScale(context.ownedRoot, context.session.settings.uiScale)
  return Result.map(scaleResult, () => true)
}

const createBaseViews = (context: BaseViewsContext): Result.Result<Readonly<{
  crosshair: CrosshairView
  handleInventoryKey: (event: KeyboardEvent) => boolean
  hud: HudView
  inventory: InventoryView
}>, SettingsPreferenceFailure> => {
  const hud = createHudView(context.document, context.ownedRoot, context.options.motion ?? 'full', {
    onRespawn: context.options.onRespawn,
  })
  context.partial.hud = hud
  const crosshair = createCrosshairView(context.document, context.ownedRoot, context.options.motion ?? 'full')
  crosshair.render(context.session.crosshairModel)
  const preferences = configureBasePreferences(context, hud, crosshair)
  if (Result.isFailure(preferences)) {
    return Result.fail(preferences.failure)
  }
  hud.render(context.session.hudModel)
  const inventory = createInitialInventoryView(context)
  const handleInventoryKey = createInventoryKeyHandler(context, inventory)
  return Result.succeed({ crosshair, handleInventoryKey, hud, inventory })
}

const applySettingsMotion = (
  controller: MotionPreferenceController | null,
  motion: SettingsSnapshot['reducedMotion'],
): Result.Result<SettingsSnapshot['reducedMotion'], MotionPreferenceControllerFailure> => {
  if (controller === null) {
    return Result.succeed(motion)
  }
  return controller.update(motion)
}

type SettingsOperations = {
  readonly applySettingsPreferences: (settings: SettingsSnapshot) => Result.Result<boolean, SettingsPreferenceFailure>
  readonly updateSettings: (settings: UiSettings) => Result.Result<UiScale, SettingsOperationFailure>
  readonly updateSettingsSnapshot: (input: unknown) => Result.Result<SettingsSnapshot, SettingsOperationFailure>
  readonly updateLanguage: (input: unknown) => Result.Result<UiLanguage, SettingsLanguageFailure>
}

const applySettingsSnapshotPreferences = (
  session: UiMountSession,
  input: SettingsSnapshot,
  preferences: Result.Result<boolean, SettingsPreferenceFailure>,
): Result.Result<SettingsSnapshot, SettingsOperationFailure> => {
  if (Result.isFailure(preferences)) {
    session.settingsFailure = preferences.failure
    return Result.fail(preferences.failure)
  }
  session.settings = input
  session.settingsFailure = null
  return Result.succeed(input)
}

const updateValidSettingsSnapshot = (
  session: UiMountSession,
  input: SettingsSnapshot,
  applySettingsPreferences: SettingsOperations['applySettingsPreferences'],
): Result.Result<SettingsSnapshot, SettingsOperationFailure> => {
  const { language, mounted } = session
  const viewResult = mounted?.overlays.updateSettingsSnapshot(input, language) ?? null
  if (viewResult !== null && Result.isFailure(viewResult)) {
    return viewResult
  }
  return applySettingsSnapshotPreferences(session, input, applySettingsPreferences(input))
}

const createSettingsOperations = (
  session: UiMountSession,
): SettingsOperations => {
  const applySettingsPreferences = (settings: SettingsSnapshot): Result.Result<boolean, SettingsPreferenceFailure> => {
    const { mounted } = session
    if (mounted === null) {
      return Result.succeed(true)
    }
    const scaleResult = applySettingsScale(mounted.root, settings.uiScale)
    if (Result.isFailure(scaleResult)) {
      return Result.fail(scaleResult.failure)
    }
    const colorVisionResult = applySettingsColorVision(session.colorVisionController, settings.colorVisionCorrection)
    if (Result.isFailure(colorVisionResult)) {
      return Result.fail(colorVisionResult.failure)
    }
    return Result.map(applySettingsMotion(session.motionController, settings.reducedMotion), () => true)
  }

  const updateSettingsSnapshot = (input: unknown): Result.Result<SettingsSnapshot, SettingsOperationFailure> => {
    if (!isValidSettings(input)) {
      return Result.fail({ _tag: 'InvalidSettingsSnapshot' })
    }
    return updateValidSettingsSnapshot(session, input, applySettingsPreferences)
  }

  const updateSettings = (settings: UiSettings): Result.Result<UiScale, SettingsOperationFailure> => {
    const scale = decodeUiScale(settings.uiScale)
    if (Result.isFailure(scale)) {
      return scale
    }
    return Result.map(updateSettingsSnapshot({
      ...session.settings,
      fovDegrees: settings.fieldOfView,
      masterVolume: settings.masterVolume,
      mouseSensitivity: settings.mouseSensitivity,
      renderDistance: settings.renderDistance,
      uiScale: scale.success,
    }), () => scale.success)
  }

  const applyLanguageToMountedRoot = (
    mounted: UiMountedViews | null,
    language: UiLanguage,
  ): Result.Result<UiLanguage, UiLanguageFailure> => {
    if (mounted === null) {
      return Result.succeed(language)
    }
    return applyUiLanguage(mounted.root, language)
  }

  const updateMountedSettingsLanguage = (
    language: UiLanguage,
  ): Result.Result<SettingsSnapshot, SettingsViewModelFailure> => {
    const { mounted } = session
    if (mounted === null) {
      return Result.succeed(session.settings)
    }
    return mounted.overlays.updateSettingsSnapshot(session.settings, language)
  }

  const restoreLanguage = (
    mounted: UiMountedViews | null,
    language: UiLanguage,
  ): Result.Result<UiLanguage, UiLanguageFailure> => {
    if (mounted === null) {
      return Result.succeed(language)
    }
    return applyUiLanguage(mounted.root, language)
  }

  const failLanguageUpdate = (
    mounted: UiMountedViews | null,
    previousLanguage: UiLanguage,
    failure: SettingsViewModelFailure,
  ): Result.Result<UiLanguage, SettingsLanguageFailure> => {
    const rollback = restoreLanguage(mounted, previousLanguage)
    if (Result.isFailure(rollback)) {
      return rollback
    }
    return Result.fail(failure)
  }

  const applyDecodedLanguage = (language: UiLanguage): Result.Result<UiLanguage, SettingsLanguageFailure> => {
    const { mounted } = session
    const applied = applyLanguageToMountedRoot(mounted, language)
    if (Result.isFailure(applied)) {
      return applied
    }
    const settings = updateMountedSettingsLanguage(applied.success)
    if (Result.isFailure(settings)) {
      return failLanguageUpdate(mounted, session.language, settings.failure)
    }
    session.language = applied.success
    return applied
  }

  const updateLanguage = (input: unknown): Result.Result<UiLanguage, SettingsLanguageFailure> => {
    const decoded = decodeUiLanguage(input)
    if (Result.isFailure(decoded)) {
      return decoded
    }
    return applyDecodedLanguage(decoded.success)
  }

  return { applySettingsPreferences, updateLanguage, updateSettings, updateSettingsSnapshot }
}

const detachPreferenceControllers = (
  session: UiMountSession,
): Readonly<{
  motionController: MotionPreferenceController | null
  colorVisionController: ColorVisionFilterController | null
}> => {
  const { motionController, colorVisionController } = session
  session.motionController = null
  session.colorVisionController = null
  return { colorVisionController, motionController }
}

const combineControllerAndViewCleanup = (
  message: string,
  controllerResult: Result.Result<void, UiMountError>,
  viewsResult: Result.Result<void, UiMountError>,
): Result.Result<void, UiMountError> => {
  if (Result.isFailure(controllerResult) && Result.isFailure(viewsResult)) {
    return Result.fail(new UiMountError(message, {
      cause: {
        controllerError: controllerResult.failure,
        viewsError: viewsResult.failure,
      },
    }))
  }
  if (Result.isFailure(controllerResult)) {
    return controllerResult
  }
  return viewsResult
}

const createUnmountOperation = (
  session: UiMountSession,
  toastLifecycle: ReturnType<typeof createAchievementToastLifecycle>,
): ((message?: string) => Effect.Effect<void, UiMountError | Schema.SchemaError>) =>
  (message = 'Failed to stop mx-ui'): Effect.Effect<void, UiMountError | Schema.SchemaError> =>
    Effect.gen(function* closeMount() {
      const previous = session.mounted
      session.mounted = null
      session.inventoryOpen = false
      session.inventoryRestoreFocus = null
      const { colorVisionController, motionController } = detachPreferenceControllers(session)
      const subscriptionResult = yield* Effect.result(toastLifecycle.close())
      const controllerCleanup = Effect.try({
        catch: (cause) => new UiMountError(message, { cause }),
        try: () => {
          motionController?.dispose()
          colorVisionController?.dispose()
        },
      })
      const controllerResult = yield* Effect.result(controllerCleanup)
      const viewsResult = yield* Effect.result(removeUiMountedViews(previous, message))
      const cleanupResult = combineControllerAndViewCleanup(message, controllerResult, viewsResult)
      return yield* finishUiMountCleanup(subscriptionResult, cleanupResult)
    })

const createMountedSettingsCallbacks = (
  session: UiMountSession,
  settingsOperations: SettingsOperations,
  callbacks: UiSettingsCallbacks | undefined,
): UiSettingsCallbacks => ({
  ...callbacks,
  onSettingsChange: (settings) => {
    const update = settingsOperations.updateSettingsSnapshot(settings)
    if (Result.isFailure(update)) {
      session.settingsFailure = update.failure
      session.mounted?.overlays.updateSettingsSnapshot(session.settings, session.language)
      return
    }
    callbacks?.onSettingsChange?.(update.success)
  },
})

type CreateInitialOverlaysContext = {
  readonly document: Document
  readonly ownedRoot: HTMLElement
  readonly partial: PartialMount
  readonly options: UiMountOptions
  readonly session: UiMountSession
  readonly settingsOperations: SettingsOperations
  readonly handleInventoryKey: (event: KeyboardEvent) => boolean
}

type CreateInitialViewsContext = Omit<CreateInitialOverlaysContext, 'handleInventoryKey'> & {
  readonly inventory: InventoryOperations
}

type InitialBaseSessionViews = {
  readonly achievementToast: AchievementToastView
  readonly crosshair: CrosshairView
  readonly hud: HudView
  readonly inventory: InventoryView
  readonly overlays: SessionOverlays
}

const createInitialAchievementToast = (document: Document, ownedRoot: HTMLElement): AchievementToastView => {
  const view = createAchievementToastView(document, ownedRoot)
  view.render()
  return view
}

const createInitializedSessionOverlays = (
  context: CreateInitialOverlaysContext,
): Result.Result<SessionOverlays, SettingsViewModelFailure> => {
  const overlays = createSessionOverlays(context.document, context.ownedRoot, {
    callbacks: createMountedSettingsCallbacks(context.session, context.settingsOperations, context.options.settingsCallbacks),
    delegateKeyDown: context.handleInventoryKey,
    initialDebug: context.session.debugSnapshot,
    initialLanguage: context.session.language,
    initialSettingsSnapshot: context.session.settings,
    onLanguageChange: context.settingsOperations.updateLanguage,
  })
  context.partial.overlays = overlays
  if (Result.isFailure(overlays.initializationResult)) {
    return Result.fail(overlays.initializationResult.failure)
  }
  return Result.succeed(overlays)
}

const createInitialBaseSessionViews = (
  context: CreateInitialViewsContext,
): Result.Result<InitialBaseSessionViews, MountInitializationFailure> => {
  const baseViews = createBaseViews({ ...context, inventory: context.inventory })
  if (Result.isFailure(baseViews)) {
    return Result.fail(baseViews.failure)
  }
  const { crosshair, handleInventoryKey, hud, inventory } = baseViews.success
  const achievementToast = createInitialAchievementToast(context.document, context.ownedRoot)
  const overlaysResult = createInitializedSessionOverlays({ ...context, handleInventoryKey })
  return Result.map(overlaysResult, (overlays) => ({ achievementToast, crosshair, hud, inventory, overlays }))
}

type CreateInitialMainMenuContext = {
  readonly document: Document
  readonly ownedRoot: HTMLElement
  readonly partial: PartialMount
  readonly overlays: SessionOverlays
  readonly callbacks: MainMenuCallbacks | undefined
}

const createInitialMainMenu = (context: CreateInitialMainMenuContext): MainMenuView => {
  const mainMenu = createMainMenuView(
    context.document,
    context.ownedRoot,
    buildMenuCallbacks(context.overlays, context.callbacks),
  )
  context.partial.mainMenu = mainMenu
  mainMenu.render(mainMenuViewModel(initialMainMenuState, []))
  return mainMenu
}

export const makeUiMount = (options: UiMountOptions): UiMount => {
  const { session, toastLifecycle } = createMountState(options)
  const settingsOperations = createSettingsOperations(session)
  const inventoryOperations = createInventoryOperations(session, options)
  const unmount = createUnmountOperation(session, toastLifecycle)

  const buildMountedViews = (): Effect.Effect<UiMountedViews, UiMountError> =>
    Effect.gen(function* run() {
      if (session.settingsFailure !== null) {
        return yield* Effect.fail(new UiMountError('Invalid initial settings snapshot'))
      }
      const { document, ownedRoot } = yield* requireOwnedRoot(options.root)
      const partial: PartialMount = {
        colorVisionController: null,
        mainMenu: null,
        motionController: null,
        overlays: null,
        ownedRoot,
      }
      const mount = Effect.try({
        catch: (cause) => new UiMountError('Failed to mount mx-ui', { cause }),
        try: (): Result.Result<UiMountedViews, MountInitializationFailure> => {
          const initialViews = createInitialBaseSessionViews({
            document,
            inventory: inventoryOperations,
            options,
            ownedRoot,
            partial,
            session,
            settingsOperations,
          })
          if (Result.isFailure(initialViews)) {
            return Result.fail(initialViews.failure)
          }
          const { achievementToast, crosshair, hud, inventory, overlays } = initialViews.success
          const mainMenu = createInitialMainMenu({
            callbacks: options.menuCallbacks,
            document,
            overlays,
            ownedRoot,
            partial,
          })
          applyUiLanguage(ownedRoot, session.language)
          return Result.succeed({ achievementToast, crosshair, hud, inventory, mainMenu, overlays, root: ownedRoot })
        },
      })
      const mountResult = Effect.flatMap(mount, (result) => {
        if (Result.isFailure(result)) {
          return Effect.fail(new UiMountError('Could not initialize mx-ui views', { cause: result.failure }))
        }
        return Effect.succeed(result.success)
      })
      return yield* Effect.catch(mountResult, (mountError) =>
        Effect.andThen(
          Effect.catch(destroyPartialMount(partial), (cleanupError) =>
            Effect.fail(
              new UiMountError('Failed to mount mx-ui', {
                cause: { cleanupError, mountError },
              }),
            ),
          ),
          Effect.fail(mountError),
        ),
      )
    })

  return {
    activateInventoryFocus: inventoryOperations.activateInventoryFocus,
    closeInventory: () => {
      if (!session.inventoryOpen) {
        return
      }
      session.inventoryOpen = false
      session.mounted?.inventory.root.setAttribute('hidden', '')
      const target = session.inventoryRestoreFocus
      session.inventoryRestoreFocus = null
      if (target?.isConnected === true) {
        target.focus()
      }
      inventoryOperations.syncKeyboardFocus()
    },
    closeSettings: () => session.mounted?.overlays.closeSettings(),
    current: () => {
      if (session.mounted === null) {
        return
      }
      return session.mounted
    },
    dragInventorySlot: inventoryOperations.dragInventorySlot,
    moveFocus: inventoryOperations.moveFocus,
    moveInventoryFocus: inventoryOperations.moveInventoryFocus,
    name: '@nerima-games/mx-ui',
    notifyHit: () => {
      const model = session.crosshairModel
      if (typeof model === 'undefined') {
        return
      }
      session.crosshairModel = { ...model, hit: true }
      const crosshair = session.mounted?.crosshair
      if (typeof crosshair === 'undefined') {
        return
      }
      crosshair.notifyHit()
    },
    openInventory: (model) => {
      if (typeof model !== 'undefined') {
        session.inventoryModel = model
      }
      const view = session.mounted?.inventory
      if (typeof view === 'undefined' || session.inventoryOpen) {
        return
      }
      session.inventoryRestoreFocus = restoreFocusTarget(options.root.ownerDocument.activeElement)
      session.inventoryOpen = true
      view.root.removeAttribute('hidden')
      inventoryOperations.renderInventory(view, true)
    },
    openSettings: () => session.mounted?.overlays.openSettings(),
    start: Effect.gen(function* start() {
      yield* unmount('Failed to unmount previous mx-ui views')
      return yield* Effect.onInterrupt(
        Effect.gen(function* completeStartup() {
          const mounted = yield* buildMountedViews()
          session.mounted = mounted
          yield* toastLifecycle.start(mounted)
          return createUiModuleInstance(uiModule.frameStages, toastLifecycle.read)
        }),
        () => unmount('Failed to roll back interrupted mx-ui startup'),
      )
    }),
    stop: Effect.suspend(unmount),
    updateCrosshair: (model) => {
      if (typeof model === 'undefined') {
        delete session.crosshairModel
      } else {
        session.crosshairModel = model
      }
      session.mounted?.crosshair.render(model)
    },
    updateDebug: (snapshot) => {
      session.debugSnapshot = snapshot
      session.mounted?.overlays.updateDebug(snapshot)
    },
    updateHud: (model) => {
      session.hudModel = model
      session.mounted?.hud.render(model)
    },
    updateInventory: (model) => {
      session.inventoryModel = model
      const view = session.mounted?.inventory
      if (typeof view !== 'undefined') {
        inventoryOperations.renderInventory(view, session.inventoryOpen)
      }
    },
    updateInventoryActionState: (state) => {
      session.inventoryActionState = state
      const view = session.mounted?.inventory
      if (view) {
        inventoryOperations.renderInventory(view)
      }
    },
    updateLanguage: settingsOperations.updateLanguage,
    updateSettings: settingsOperations.updateSettings,
    updateSettingsSnapshot: settingsOperations.updateSettingsSnapshot,
  }
}
