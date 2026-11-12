import * as Scope from 'effect/Scope'
import {
  type AchievementToastSubscription,
  startAchievementToastSubscriber,
} from './achievement-toast-subscriber.js'
import { type AchievementToastView, createAchievementToastView } from './achievement-toast-view.js'
import { type CrosshairView, createCrosshairView } from './crosshair-view.js'
import {
  DEFAULT_DEBUG_HUD_SNAPSHOT,
  DEFAULT_UI_SETTINGS,
  type DebugHudSnapshot,
  type SessionOverlays,
  type UiSettings,
  type UiSettingsCallbacks,
  createSessionOverlays,
} from './session-overlays.js'
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
import { finishToastSubscriptionClose, finishUiMountCleanup } from './ui-mount-cleanup.js'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu.js'
import type { AchievementToast } from '../domain/achievement-toast.js'
import { type CrosshairViewModel } from '../domain/crosshair.js'
import { DomainEventBus } from '@nerima-games/mc-sim'
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

export type UiMountOptions = {
  readonly root: HTMLElement
  readonly motion?: MotionPreference
  readonly initialLanguage?: UiLanguage
  readonly menuCallbacks?: MainMenuCallbacks
  readonly initialSettings?: UiSettings
  readonly settingsCallbacks?: UiSettingsCallbacks
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
  readonly updateSettings: (settings: UiSettings) => Result.Result<UiScale, Schema.SchemaError>
  readonly updateLanguage: (language: unknown) => Result.Result<UiLanguage, UiLanguageFailure>
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
  settings: UiSettings
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
}

const saveUiSettings = (
  session: UiMountSession,
  settings: UiSettings,
  mounted: UiMountedViews | null,
): void => {
  session.settings = settings
  mounted?.overlays.updateSettings(settings)
}

const updateUiSettings = (
  session: UiMountSession,
  nextSettings: UiSettings,
): Result.Result<UiScale, Schema.SchemaError> => {
  const decodedScale = decodeUiScale(nextSettings.uiScale)
  if (Result.isFailure(decodedScale)) {
    return decodedScale
  }
  const { mounted } = session
  if (mounted !== null) {
    const appliedScale = applyUiScale(mounted.root.style, decodedScale.success)
    if (Result.isFailure(appliedScale)) {
      return appliedScale
    }
  }
  saveUiSettings(session, nextSettings, mounted)
  return decodedScale
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
      partial.ownedRoot.remove()
    },
  })

const buildMenuCallbacks = (
  overlays: SessionOverlays,
  callbacks: MainMenuCallbacks | undefined,
): MainMenuCallbacks => ({
  onCreateWorld: (request) => callbacks?.onCreateWorld(request),
  onLoadWorld: (world) => callbacks?.onLoadWorld(world),
  onOpenSettings: () => {
    overlays.openSettings()
    callbacks?.onOpenSettings()
  },
  onStateChange: (state) => callbacks?.onStateChange(state),
})

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

const createMountState = (options: UiMountOptions): Readonly<{
  session: UiMountSession
  toastLifecycle: ReturnType<typeof createAchievementToastLifecycle>
}> => {
  const session: UiMountSession = {
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
    mounted: null,
    settings: options.initialSettings ?? DEFAULT_UI_SETTINGS,
    toastScope: null,
    toastSubscription: null,
  }
  return { session, toastLifecycle: createAchievementToastLifecycle(session) }
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

type UiMountInventoryOperations = Readonly<{
  activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
  dragInventorySlot: (source: InventoryDragTarget, target: InventoryDragTarget) => boolean
  moveFocus: (direction: InventoryNavigationDirection) => boolean
  moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  renderInventory: (view: InventoryView, focus?: boolean) => void
  syncKeyboardFocus: () => void
}>

const createUiMountInventoryOperations = (
  options: UiMountOptions,
  session: UiMountSession,
): UiMountInventoryOperations => {
  const syncKeyboardFocus = (): void => {
    const focusedTarget = focusTargetForUiElement(options.root.ownerDocument.activeElement)
    const hotbarIndex = focusedTarget?.group === 'hotbar' ? focusedTarget.index : undefined
    session.mounted?.hud.setKeyboardFocus(hotbarIndex)
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

  const dragInventorySlot = (
    source: InventoryDragTarget,
    target: InventoryDragTarget,
  ): boolean => {
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

export const makeUiMount = (options: UiMountOptions): UiMount => {
  const { session, toastLifecycle } = createMountState(options)
  const {
    activateInventoryFocus,
    dragInventorySlot,
    moveFocus,
    moveInventoryFocus,
    renderInventory,
    syncKeyboardFocus,
  } = createUiMountInventoryOperations(options, session)

  const unmount = (
    message = 'Failed to stop mx-ui',
  ): Effect.Effect<void, UiMountError | Schema.SchemaError> =>
    Effect.gen(function* closeMount() {
      const previous = session.mounted
      session.mounted = null
      session.inventoryOpen = false
      session.inventoryRestoreFocus = null

      const subscriptionResult = yield* Effect.result(toastLifecycle.close())
      const viewsResult = yield* Effect.result(removeUiMountedViews(previous, message))
      return yield* finishUiMountCleanup(subscriptionResult, viewsResult)
    })

  const createBaseInventory = (document: Document, ownedRoot: HTMLElement): InventoryView => {
    const inventory = createInventoryView(document, ownedRoot, {
      onActivate: (target, shiftKey) => {
        session.inventoryFocus = target
        activateInventoryFocus(activationKind(shiftKey))
      },
      onFocusChange: (target) => {
        session.inventoryFocus = target
        renderInventory(inventory)
      },
    })
    inventory.root.setAttribute('hidden', '')
    renderInventory(inventory)
    return inventory
  }

  const createBaseViews = (
    document: Document,
    ownedRoot: HTMLElement,
  ): {
    readonly handleInventoryKey: (event: KeyboardEvent) => boolean
    readonly hud: HudView
    readonly crosshair: CrosshairView
    readonly inventory: InventoryView
  } => {
    const hud = createHudView(document, ownedRoot, options.motion ?? 'full', {
      onRespawn: options.onRespawn,
    })
    hud.render(session.hudModel)
    const crosshair = createCrosshairView(document, ownedRoot, options.motion ?? 'full')
    crosshair.render(session.crosshairModel)

    const inventory = createBaseInventory(document, ownedRoot)

    // No `if (!session.inventoryOpen) return` guard here, unlike the public
    // `closeInventory` member below: this closure is only reachable through
    // `dispatchInventoryKey`, and every key that reaches `INVENTORY_KEY_HANDLERS`
    // (including Escape) is already gated by `!ctx.session.inventoryOpen`
    // Returning `false` one level up — so `inventoryOpen` is always `true` here.
    // A guard restating that would be a branch no key event can ever take.
    const closeInventory = (): void => {
      session.inventoryOpen = false
      inventory.root.setAttribute('hidden', '')
      const target = session.inventoryRestoreFocus
      session.inventoryRestoreFocus = null
      if (target?.isConnected === true) {
        target.focus()
      }
      syncKeyboardFocus()
    }
    // No `if (session.inventoryOpen) return` guard here, unlike the public
    // `openInventory` member below: this closure's only real caller is
    // `handleToggleKey`, which calls it exclusively from the
    // `!ctx.session.inventoryOpen` branch of its own toggle — so `inventoryOpen`
    // Is always `false` here.
    const openInventory = (): void => {
      session.inventoryRestoreFocus = restoreFocusTarget(document.activeElement)
      session.inventoryOpen = true
      inventory.root.removeAttribute('hidden')
      renderInventory(inventory, true)
    }
    const handleInventoryKey = (event: KeyboardEvent): boolean =>
      dispatchInventoryKey(event, {
        closeInventory,
        openInventory,
        session,
      })

    return { crosshair, handleInventoryKey, hud, inventory }
  }

  const buildMountedViews = (): Effect.Effect<UiMountedViews, UiMountError> =>
    Effect.gen(function* run() {
      const { document, ownedRoot } = yield* requireOwnedRoot(options.root)
      const partial: PartialMount = { mainMenu: null, overlays: null, ownedRoot }
      const uiScale = applyUiScale(ownedRoot.style, session.settings.uiScale)
      if (Result.isFailure(uiScale)) {
        return yield* Effect.andThen(
          destroyPartialMount(partial),
          Effect.fail(new UiMountError('Invalid initial UI scale', { cause: uiScale.failure })),
        )
      }
      const mount = Effect.try({
        catch: (cause) => new UiMountError('Failed to mount mx-ui', { cause }),
        try: () => {
          const { crosshair, handleInventoryKey, hud, inventory } = createBaseViews(document, ownedRoot)
          partial.hud = hud
          const achievementToast = createAchievementToastView(document, ownedRoot)
          achievementToast.render()
          const overlays = createSessionOverlays(document, ownedRoot, {
            callbacks: options.settingsCallbacks,
            delegateKeyDown: handleInventoryKey,
            initialDebug: session.debugSnapshot,
            initialSettings: session.settings,
          })
          partial.overlays = overlays
          const mainMenu = createMainMenuView(
            document,
            ownedRoot,
            buildMenuCallbacks(overlays, options.menuCallbacks),
          )
          partial.mainMenu = mainMenu
          mainMenu.render(mainMenuViewModel(initialMainMenuState, []))
          applyUiLanguage(ownedRoot, session.language)
          return { achievementToast, crosshair, hud, inventory, mainMenu, overlays, root: ownedRoot }
        },
      })
      return yield* Effect.catch(mount, (mountError) =>
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
    activateInventoryFocus,
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
      syncKeyboardFocus()
    },
    closeSettings: () => session.mounted?.overlays.closeSettings(),
    current: () => {
      if (session.mounted === null) {
        return
      }
      return session.mounted
    },
    dragInventorySlot,
    moveFocus,
    moveInventoryFocus,
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
      renderInventory(view, true)
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
        renderInventory(view, session.inventoryOpen)
      }
    },
    updateInventoryActionState: (state) => {
      session.inventoryActionState = state
      const view = session.mounted?.inventory
      if (view) {
        renderInventory(view)
      }
    },
    updateLanguage: (input) => {
      const decoded = decodeUiLanguage(input)
      if (Result.isFailure(decoded)) {
        return decoded
      }
      session.language = decoded.success
      if (session.mounted !== null) {
        return applyUiLanguage(session.mounted.root, decoded.success)
      }
      return decoded
    },
    updateSettings: (nextSettings) => updateUiSettings(session, nextSettings),
  }
}
