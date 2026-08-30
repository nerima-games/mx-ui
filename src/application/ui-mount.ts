import {
  DEFAULT_DEBUG_HUD_SNAPSHOT,
  DEFAULT_UI_SETTINGS,
  type DebugHudSnapshot,
  type SessionOverlays,
  type UiSettings,
  type UiSettingsCallbacks,
  createSessionOverlays,
} from './session-overlays.js'
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
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model.js'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu.js'
import { Effect } from 'effect'
import type { MotionPreference } from '../domain/accessibility.js'
import { uiModule } from '../stages/registration.js'

export type UiMountedViews = {
  readonly root: HTMLElement
  readonly hud: HudView
  readonly inventory: InventoryView
  readonly mainMenu: MainMenuView
  readonly overlays: SessionOverlays
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
  readonly start: Effect.Effect<typeof uiModule, unknown>
  readonly stop: Effect.Effect<void, unknown>
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

export class UiMountError extends Error {
  readonly _tag = 'UiMountError'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UiMountError'
  }
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

/** The mutable session state one `makeUiMount` call owns, gathered into one cell. */
type UiMountSession = {
  mounted: UiMountedViews | null
  settings: UiSettings
  debugSnapshot: DebugHudSnapshot
  inventoryModel: InventoryViewModel
  inventoryOpen: boolean
  inventoryFocus: InventoryInteractionTarget
  inventoryActionState: InventoryActionState
  inventoryRestoreFocus: HTMLElement | null
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
  if (targets.length === ZERO) {
    return null
  }
  const currentIndex = targets.findIndex((target) => sameInventoryTarget(target, currentFocus))
  const direction = focusStep(shiftKey)
  // Non-null, not a `??` fallback: `currentIndex` is `-1` only when nothing in `targets` matches
  // `currentFocus`. `direction` is always `1` or `-1`. `targets.length` here is always at least
  // One, given the fallback above. Given all three facts, the modulo arithmetic below always
  // Stays within `[0, targets.length)` — `noUncheckedIndexedAccess` cannot see that proof, but a
  // `?? targets[ZERO]!` fallback here would be a branch no input can ever take, which is exactly
  // The shape that must be proven unreachable rather than fabricated a test for.
  return targets[(currentIndex + direction + targets.length) % targets.length]!
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

const handleArrowKeyEvent = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  // Non-null: `handleArrowKeyEvent` is only ever reached through
  // `INVENTORY_KEY_HANDLERS`, whose `matches` for this entry is
  // `inventoryDirectionForKey(event.key) !== null` — the exact condition this
  // Asks again. Two evaluations of the same pure function on the same
  // `event.key` agree, so by the time this line runs the caller has already
  // Excluded `null`.
  const direction = inventoryDirectionForKey(event.key)!
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
  { handle: handleArrowKeyEvent, matches: (event) => inventoryDirectionForKey(event.key) !== null },
  {
    handle: handleActivateKeyEvent,
    matches: (event) => event.key === 'Enter' || event.key === ' ',
  },
]

/**
 * `E` always toggles, everything else requires the inventory to already be
 * open — same priority order the original sequential `if` chain used.
 */
const dispatchInventoryKey = (event: KeyboardEvent, ctx: InventoryKeyContext): boolean => {
  if (event.key.toLowerCase() === 'e') {
    return handleToggleKey(event, ctx)
  }
  if (!ctx.session.inventoryOpen) {
    return false
  }
  const handler = INVENTORY_KEY_HANDLERS.find(({ matches }) => matches(event))
  if (typeof handler === 'undefined') {
    return false
  }
  return handler.handle(event, ctx)
}

/** The mx-ui mount root's owning document, or a thrown `UiMountError`. */
const requireOwnedRoot = (
  root: HTMLElement,
): { readonly document: Document; readonly ownedRoot: HTMLElement } => {
  const document = root.ownerDocument
  if (document === null) {
    throw new UiMountError('The mx-ui mount root has no ownerDocument')
  }
  const ownedRoot = document.createElement('div')
  ownedRoot.setAttribute('data-mx-ui', 'mount-root')
  root.appendChild(ownedRoot)
  return { document, ownedRoot }
}

type PartialMount = {
  readonly mainMenu: MainMenuView | null
  readonly overlays: SessionOverlays | null
  readonly ownedRoot: HTMLElement
}

/** Cleans up whatever partially mounted, then re-throws as a `UiMountError`. */
const destroyPartialMount = (partial: PartialMount, cause: unknown): never => {
  partial.mainMenu?.destroy()
  partial.overlays?.destroy()
  partial.ownedRoot.remove()
  throw new UiMountError('Failed to mount mx-ui', { cause })
}

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
  }

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

  const unmount = (): void => {
    const previous = session.mounted
    session.mounted = null
    if (previous === null) {
      return
    }

    previous.mainMenu.destroy()
    previous.overlays.destroy()
    previous.root.remove()
    session.inventoryOpen = false
    session.inventoryRestoreFocus = null
  }

  const createBaseViews = (
    document: Document,
    ownedRoot: HTMLElement,
  ): { readonly handleInventoryKey: (event: KeyboardEvent) => boolean; readonly hud: HudView; readonly inventory: InventoryView } => {
    const hud = createHudView(document, ownedRoot, options.motion ?? 'full')
    hud.render(hudViewModel(spawnSnapshot))

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

  const buildMountedViews = (): UiMountedViews => {
    const { document, ownedRoot } = requireOwnedRoot(options.root)
    let mainMenu: MainMenuView | null = null
    let overlays: SessionOverlays | null = null
    try {
      const { handleInventoryKey, hud, inventory } = createBaseViews(document, ownedRoot)
      overlays = createSessionOverlays(document, ownedRoot, {
        callbacks: options.settingsCallbacks,
        delegateKeyDown: handleInventoryKey,
        initialDebug: session.debugSnapshot,
        initialSettings: session.settings,
      })
      mainMenu = createMainMenuView(document, ownedRoot, buildMenuCallbacks(overlays, options.menuCallbacks))
      mainMenu.render(mainMenuViewModel(initialMainMenuState, []))
      return { hud, inventory, mainMenu, overlays, root: ownedRoot }
    } catch (cause) {
      throw destroyPartialMount({ mainMenu, overlays, ownedRoot }, cause)
    }
  }

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
    start: Effect.try({
      catch: (cause) => cause,
      try: () => {
        unmount()
        session.mounted = buildMountedViews()
        return uiModule
      },
    }),
    stop: Effect.try({
      catch: (cause) => cause,
      try: unmount,
    }),
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
