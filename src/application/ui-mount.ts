import { Effect } from 'effect'
import type { MotionPreference } from '../domain/accessibility'
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import {
  type InventoryViewModel,
  emptyInventorySnapshot,
  inventoryViewModel,
} from '../domain/inventory-view-model'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu'
import { uiModule } from '../stages/registration'
import { type HudView, createHudView } from './hud-view'
import {
  type InventoryNavigationDirection,
  inventoryTargets,
  moveInventoryTarget,
  sameInventoryTarget,
} from './inventory-navigation'
import {
  type InventoryInteractionTarget,
  type InventoryView,
  createInventoryView,
} from './inventory-view'
import {
  type MainMenuCallbacks,
  type MainMenuView,
  createMainMenuView,
} from './main-menu-view'
import {
  DEFAULT_DEBUG_HUD_SNAPSHOT,
  DEFAULT_UI_SETTINGS,
  type DebugHudSnapshot,
  type SessionOverlays,
  type UiSettings,
  type UiSettingsCallbacks,
  createSessionOverlays,
} from './session-overlays'

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
  readonly activateInventoryFocus: () => boolean
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

export const makeUiMount = (options: UiMountOptions): UiMount => {
  let mounted: UiMountedViews | undefined
  let settings = options.initialSettings ?? DEFAULT_UI_SETTINGS
  let debugSnapshot = options.initialDebugSnapshot ?? DEFAULT_DEBUG_HUD_SNAPSHOT
  let inventoryModel = inventoryViewModel(emptyInventorySnapshot)
  let inventoryOpen = false
  let inventoryFocus: InventoryInteractionTarget = { kind: 'slot', region: 'hotbar', index: 0 }
  let inventoryRestoreFocus: HTMLElement | undefined

  const renderInventory = (view: InventoryView, focus = false): void => {
    const targets = inventoryTargets(inventoryModel)
    inventoryFocus = targets.find((target) => sameInventoryTarget(target, inventoryFocus)) ??
      targets[0] ?? { kind: 'crafting-output' }
    view.render(inventoryModel, { focused: inventoryFocus, status: '' })
    if (focus && targets.length > 0) {
      const root = options.root.querySelector<HTMLElement>('[data-mx-ui="inventory"]')
      const target =
        inventoryFocus.kind === 'crafting-output'
          ? root?.querySelector<HTMLElement>('[data-mx-ui="crafting-output"]')
          : root
              ?.querySelector<HTMLElement>(`[data-region="${inventoryFocus.region}"]`)
              ?.querySelectorAll<HTMLElement>('[data-mx-ui="slot"]')[inventoryFocus.index]
      target?.focus()
    }
  }

  const moveInventoryFocus = (direction: InventoryNavigationDirection): boolean => {
    const view = mounted?.inventory
    if (!inventoryOpen || view === undefined) {
      return false
    }
    inventoryFocus = moveInventoryTarget(inventoryModel, inventoryFocus, direction)
    renderInventory(view, true)
    return true
  }

  const activateInventoryFocus = (): boolean => {
    if (!inventoryOpen) {
      return false
    }
    options.onInventoryActivate?.(inventoryFocus)
    return true
  }

  const unmount = (): void => {
    const previous = mounted
    mounted = undefined
    if (previous === undefined) {
      return
    }

    previous.mainMenu.destroy()
    previous.overlays.destroy()
    previous.root.remove()
    inventoryOpen = false
    inventoryRestoreFocus = undefined
  }

  const start = Effect.try({
    catch: (cause) => cause,
    try: () => {
      unmount()

      const document = options.root.ownerDocument
      if (document === null) {
        throw new UiMountError('The mx-ui mount root has no ownerDocument')
      }

      const ownedRoot = document.createElement('div')
      ownedRoot.setAttribute('data-mx-ui', 'mount-root')
      options.root.appendChild(ownedRoot)

      let mainMenu: MainMenuView | undefined
      let overlays: SessionOverlays | undefined
      try {
        const hud = createHudView(document, ownedRoot, options.motion ?? 'full')
        hud.render(hudViewModel(spawnSnapshot))

        const inventory = createInventoryView(document, ownedRoot)
        inventory.root.setAttribute('hidden', '')
        renderInventory(inventory)

        const closeInventory = (): void => {
          if (!inventoryOpen) {
            return
          }
          inventoryOpen = false
          inventory.root.setAttribute('hidden', '')
          const target = inventoryRestoreFocus
          inventoryRestoreFocus = undefined
          if (target?.isConnected === true) {
            target.focus()
          }
        }
        const openInventory = (): void => {
          if (inventoryOpen) {
            return
          }
          const active = document.activeElement
          inventoryRestoreFocus = active instanceof HTMLElement ? active : undefined
          inventoryOpen = true
          inventory.root.removeAttribute('hidden')
          renderInventory(inventory, true)
        }
        const handleInventoryKey = (event: KeyboardEvent): boolean => {
          if (event.key.toLowerCase() === 'e') {
            event.preventDefault()
            inventoryOpen ? closeInventory() : openInventory()
            return true
          }
          if (!inventoryOpen) {
            return false
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            closeInventory()
            return true
          }
          if (event.key === 'Tab') {
            const targets = inventoryTargets(inventoryModel)
            if (targets.length === 0) {
              return false
            }
            event.preventDefault()
            const currentIndex = targets.findIndex((target) =>
              sameInventoryTarget(target, inventoryFocus),
            )
            const direction = event.shiftKey ? -1 : 1
            inventoryFocus = targets[(currentIndex + direction + targets.length) % targets.length] ?? targets[0]!
            renderInventory(inventory, true)
            return true
          }
          const direction = inventoryDirectionForKey(event.key)
          if (direction !== null) {
            event.preventDefault()
            return moveInventoryFocus(direction)
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            return activateInventoryFocus()
          }
          return false
        }

        overlays = createSessionOverlays(
          document,
          ownedRoot,
          settings,
          options.settingsCallbacks,
          debugSnapshot,
          handleInventoryKey,
        )
        const menuCallbacks: MainMenuCallbacks = {
          onCreateWorld: (request) => options.menuCallbacks?.onCreateWorld(request),
          onLoadWorld: (world) => options.menuCallbacks?.onLoadWorld(world),
          onOpenSettings: () => {
            overlays?.openSettings()
            options.menuCallbacks?.onOpenSettings()
          },
          onStateChange: (state) => options.menuCallbacks?.onStateChange(state),
        }
        mainMenu = createMainMenuView(document, ownedRoot, menuCallbacks)
        mainMenu.render(mainMenuViewModel(initialMainMenuState, []))

        mounted = { hud, inventory, mainMenu, overlays, root: ownedRoot }
        return uiModule
      } catch (cause) {
        mainMenu?.destroy()
        overlays?.destroy()
        ownedRoot.remove()
        throw new UiMountError('Failed to mount mx-ui', { cause })
      }
    },
  })

  const stop = Effect.try({
    catch: (cause) => cause,
    try: unmount,
  })

  return {
    activateInventoryFocus,
    closeInventory: () => {
      if (!inventoryOpen) {
        return
      }
      inventoryOpen = false
      mounted?.inventory.root.setAttribute('hidden', '')
      const target = inventoryRestoreFocus
      inventoryRestoreFocus = undefined
      if (target?.isConnected === true) {
        target.focus()
      }
    },
    closeSettings: () => mounted?.overlays.closeSettings(),
    current: () => mounted,
    name: '@nerima-games/mx-ui',
    moveInventoryFocus,
    openSettings: () => mounted?.overlays.openSettings(),
    openInventory: (model) => {
      if (model !== undefined) {
        inventoryModel = model
      }
      const view = mounted?.inventory
      if (view === undefined || inventoryOpen) {
        return
      }
      const active = options.root.ownerDocument.activeElement
      inventoryRestoreFocus = active instanceof HTMLElement ? active : undefined
      inventoryOpen = true
      view.root.removeAttribute('hidden')
      renderInventory(view, true)
    },
    start,
    stop,
    updateDebug: (snapshot) => {
      debugSnapshot = snapshot
      mounted?.overlays.updateDebug(snapshot)
    },
    updateSettings: (nextSettings) => {
      settings = nextSettings
      mounted?.overlays.updateSettings(nextSettings)
    },
    updateInventory: (model) => {
      inventoryModel = model
      const view = mounted?.inventory
      if (view !== undefined) renderInventory(view, inventoryOpen)
    },
  }
}
