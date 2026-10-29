import * as Scope from 'effect/Scope'
import {
  type AchievementToastSubscription,
  startAchievementToastSubscriber,
} from './achievement-toast-subscriber.js'
import { type AchievementToastView, createAchievementToastView } from './achievement-toast-view.js'
import {
  DEFAULT_DEBUG_HUD_SNAPSHOT,
  DEFAULT_UI_SETTINGS,
  type DebugHudSnapshot,
  type SessionOverlays,
  type UiSettings,
  type UiSettingsCallbacks,
  createSessionOverlays,
} from './session-overlays.js'
import { Effect, Exit, Schema } from 'effect'
import { HOTBAR_SLOT_COUNT, hudViewModel, spawnSnapshot } from '../domain/hud-view-model.js'
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
  inventoryTargets,
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
import { finishToastSubscriptionClose, finishUiMountCleanup } from './ui-mount-cleanup.js'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu.js'
import type { AchievementToast } from '../domain/achievement-toast.js'
import { DomainEventBus } from '@nerima-games/mc-sim'
import type { MotionPreference } from '../domain/accessibility.js'
import { UiMountError } from './ui-mount-error.js'
import type { UiQaSnapshot } from '../domain/ui-qa.js'
import { createUiModuleInstance } from './ui-module-instance.js'
import { uiModule } from '../stages/registration.js'

export { UiMountError } from './ui-mount-error.js'

const HOTBAR_START_INDEX = 0
const INITIAL_SELECTED_HOTBAR_SLOT = 0

export type UiMountedViews = {
  readonly root: HTMLElement
  readonly hud: HudView
  readonly inventory: InventoryView
  readonly mainMenu: MainMenuView
  readonly overlays: SessionOverlays
  readonly achievementToast: AchievementToastView
}

export type UiMountOptions = {
  readonly root: HTMLElement
  readonly motion?: MotionPreference
  readonly menuCallbacks?: MainMenuCallbacks
  readonly initialSettings?: UiSettings
  readonly settingsCallbacks?: UiSettingsCallbacks
  readonly initialDebugSnapshot?: DebugHudSnapshot
  readonly onInventoryActivate?: (target: InventoryInteractionTarget) => void
  readonly onInventoryAction?: (action: InventoryAction) => void
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
  readonly updateDebug: (snapshot: DebugHudSnapshot) => void
  readonly updateSettings: (settings: UiSettings) => void
  readonly openSettings: () => void
  readonly closeSettings: () => void
  readonly openInventory: (model?: InventoryViewModel) => void
  readonly closeInventory: () => void
  readonly updateInventory: (model: InventoryViewModel) => void
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
  readonly dragInventorySlot: (
    source: InventoryDragTarget,
    target: InventoryDragTarget,
  ) => boolean
  readonly updateInventoryActionState: (state: InventoryActionState) => void
}

const inventoryDirectionForKey = (key: string): InventoryNavigationDirection | null => {
  switch (key) {
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    default:
      return null
  }
}

const ZERO = 0
const FOCUS_STEP_FORWARD = 1
const FOCUS_STEP_BACKWARD = -1

type NonEmptyArray<Element> = readonly [Element, ...Element[]]

const isNonEmpty = <Element>(values: readonly Element[]): values is NonEmptyArray<Element> =>
  values.length !== ZERO

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
  debugSnapshot: DebugHudSnapshot
  inventoryModel: InventoryViewModel
  inventoryOpen: boolean
  inventoryFocus: InventoryInteractionTarget
  inventoryActionState: InventoryActionState
  inventoryRestoreFocus: HTMLElement | null
  toastScope: Scope.Closeable | null
  toastSubscription: AchievementToastSubscription | null
}

/** `document.activeElement` narrowed to something focus-restorable, or nothing. */
const restoreFocusTarget = (active: Element | null): HTMLElement | null => {
  if (active instanceof HTMLElement) {
    return active
  }
  return null
}

/** `event.shiftKey ? -1 : 1`, named — Shift reverses the Tab cycle direction. */
const focusStep = (shiftKey: boolean): number => {
  if (shiftKey) {
    return FOCUS_STEP_BACKWARD
  }
  return FOCUS_STEP_FORWARD
}

/** `event.shiftKey ? 'shift-click' : 'click'`, named. */
const clickKind = (shiftKey: boolean): 'click' | 'shift-click' => {
  if (shiftKey) {
    return 'shift-click'
  }
  return 'click'
}

/** The next Tab-cycle target, wrapping, or nothing when the region is empty. */
const cycleInventoryFocus = (
  inventoryModel: InventoryViewModel,
  currentFocus: InventoryInteractionTarget,
  shiftKey: boolean,
): InventoryInteractionTarget | null => {
  const targets = inventoryTargets(inventoryModel)
  // `session.inventoryModel` starts as `inventoryViewModel(emptyInventorySnapshot)`.
  // Every real `updateInventory` caller replaces it with another model built the same way.
  // Both always have a non-empty `hotbar` and `main` region.
  // But `InventoryViewModel` is host-suppliable directly.
  // So a hand-built or persisted one can leave `targets` empty.
  if (!isNonEmpty(targets)) {
    return null
  }
  const currentIndex = targets.findIndex((target) => sameInventoryTarget(target, currentFocus))
  const direction = focusStep(shiftKey)
  const nextIndex = (currentIndex + direction + targets.length) % targets.length
  // Tab is a keyboard hot path; keep the next-target lookup O(1) as the inventory grows.
  return inventoryTargetAt(targets, nextIndex)
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

/** Everything a keyboard handler needs, gathered so each handler takes one argument. */
type InventoryKeyContext = {
  readonly session: UiMountSession
  readonly inventory: InventoryView
  readonly closeInventory: () => void
  readonly openInventory: () => void
  readonly renderInventory: (view: InventoryView, focus?: boolean) => void
  readonly moveInventoryFocus: (direction: InventoryNavigationDirection) => boolean
  readonly activateInventoryFocus: (kind?: 'click' | 'shift-click') => boolean
}

const handleToggleKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  event.preventDefault()
  if (ctx.session.inventoryOpen) {
    ctx.closeInventory()
  } else {
    ctx.openInventory()
  }
  return true
}

const handleEscapeKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  event.preventDefault()
  ctx.closeInventory()
  return true
}

const handleTabKeyEvent = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  const nextFocus = cycleInventoryFocus(ctx.session.inventoryModel, ctx.session.inventoryFocus, event.shiftKey)
  // `nextFocus` is `null` only when `cycleInventoryFocus` saw zero targets.
  // See that function's comment on the same hand-built-model precondition.
  if (nextFocus === null) {
    return false
  }
  event.preventDefault()
  ctx.session.inventoryFocus = nextFocus
  ctx.renderInventory(ctx.inventory, true)
  return true
}

const handleArrowKeyEvent = (
  event: KeyboardEvent,
  ctx: InventoryKeyContext,
  direction: InventoryNavigationDirection,
): boolean => {
  event.preventDefault()
  return ctx.moveInventoryFocus(direction)
}

const handleActivateKeyEvent = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  event.preventDefault()
  return ctx.activateInventoryFocus(clickKind(event.shiftKey))
}

type KeyHandler = {
  readonly matches: (event: KeyboardEvent) => boolean
  readonly handle: (event: KeyboardEvent, ctx: InventoryKeyContext) => boolean
}

const INVENTORY_KEY_HANDLERS: ReadonlyArray<KeyHandler> = [
  { handle: handleEscapeKey, matches: (event) => event.key === 'Escape' },
  { handle: handleTabKeyEvent, matches: (event) => event.key === 'Tab' },
  {
    handle: handleActivateKeyEvent,
    matches: (event) => event.key === 'Enter' || event.key === ' ',
  },
]

/**
 * `E` always toggles, everything else requires the inventory to already be
 * open — same priority order the original sequential `if` chain used.
 */
const dispatchOpenInventoryKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  const direction = inventoryDirectionForKey(event.key)
  if (direction !== null) {
    return handleArrowKeyEvent(event, ctx, direction)
  }
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
  mainMenu: MainMenuView | null
  overlays: SessionOverlays | null
  readonly ownedRoot: HTMLElement
}

/** Removes the views and owned root left by a failed initialization. */
const destroyPartialMount = (partial: PartialMount): Effect.Effect<void, UiMountError> =>
  Effect.try({
    catch: (cause) => new UiMountError('Failed to clean up partial mx-ui mount', { cause }),
    try: () => {
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

export const makeUiMount = (options: UiMountOptions): UiMount => {
  const session: UiMountSession = {
    debugSnapshot: options.initialDebugSnapshot ?? DEFAULT_DEBUG_HUD_SNAPSHOT,
    inventoryActionState: { kind: 'idle' },
    inventoryFocus: { index: ZERO, kind: 'slot', region: 'hotbar' },
    inventoryModel: inventoryViewModel(emptyInventorySnapshot),
    inventoryOpen: false,
    inventoryRestoreFocus: null,
    mounted: null,
    settings: options.initialSettings ?? DEFAULT_UI_SETTINGS,
    toastScope: null,
    toastSubscription: null,
  }
  const toastLifecycle = createAchievementToastLifecycle(session)

  const renderInventory = (view: InventoryView, focus = false): void => {
    const targets = inventoryTargets(session.inventoryModel)
    // The `targets[ZERO] ?? { kind: 'crafting-output' }` tail runs only after `targets.find` fails.
    // `targets` is empty only for a hand-built model.
    // See `cycleInventoryFocus`'s comment on the same precondition.
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
      return yield* finishUiMountCleanup(message, subscriptionResult, viewsResult)
    })

  const createBaseViews = (
    document: Document,
    ownedRoot: HTMLElement,
  ): { readonly handleInventoryKey: (event: KeyboardEvent) => boolean; readonly hud: HudView; readonly inventory: InventoryView } => {
    const hud = createHudView(document, ownedRoot, options.motion ?? 'full')
    hud.render(
      hudViewModel(
        spawnSnapshot,
        emptyInventorySnapshot.inventory.slots.slice(
          HOTBAR_START_INDEX,
          HOTBAR_SLOT_COUNT,
        ),
        INITIAL_SELECTED_HOTBAR_SLOT,
      ),
    )

    const inventory = createInventoryView(document, ownedRoot)
    inventory.root.setAttribute('hidden', '')
    renderInventory(inventory)

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
        activateInventoryFocus,
        closeInventory,
        inventory,
        moveInventoryFocus,
        openInventory,
        renderInventory,
        session,
      })

    return { handleInventoryKey, hud, inventory }
  }

  const buildMountedViews = (): Effect.Effect<UiMountedViews, UiMountError> =>
    Effect.gen(function* run() {
      const { document, ownedRoot } = yield* requireOwnedRoot(options.root)
      const partial: PartialMount = { mainMenu: null, overlays: null, ownedRoot }
      const mount = Effect.try({
        catch: (cause) => new UiMountError('Failed to mount mx-ui', { cause }),
        try: () => {
          const { handleInventoryKey, hud, inventory } = createBaseViews(document, ownedRoot)
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
          return { achievementToast, hud, inventory, mainMenu, overlays, root: ownedRoot }
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
    },
    closeSettings: () => session.mounted?.overlays.closeSettings(),
    current: () => {
      if (session.mounted === null) {
        return
      }
      return session.mounted
    },
    dragInventorySlot,
    moveInventoryFocus,
    name: '@nerima-games/mx-ui',
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
    updateDebug: (snapshot) => {
      session.debugSnapshot = snapshot
      session.mounted?.overlays.updateDebug(snapshot)
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
    updateSettings: (nextSettings) => {
      session.settings = nextSettings
      session.mounted?.overlays.updateSettings(nextSettings)
    },
  }
}
