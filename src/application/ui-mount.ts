import { Effect } from 'effect'
import type { MotionPreference } from '../domain/accessibility'
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../domain/inventory-view-model'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu'
import { uiModule } from '../stages/registration'
import { type HudView, createHudView } from './hud-view'
import { type InventoryView, createInventoryView } from './inventory-view'
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
}

export class UiMountError extends Error {
  readonly _tag = 'UiMountError'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UiMountError'
  }
}

export const makeUiMount = (options: UiMountOptions): UiMount => {
  let mounted: UiMountedViews | undefined
  let settings = options.initialSettings ?? DEFAULT_UI_SETTINGS
  let debugSnapshot = options.initialDebugSnapshot ?? DEFAULT_DEBUG_HUD_SNAPSHOT

  const unmount = (): void => {
    const previous = mounted
    mounted = undefined
    if (previous === undefined) {
      return
    }

    previous.mainMenu.destroy()
    previous.overlays.destroy()
    previous.root.remove()
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
        inventory.render(inventoryViewModel(emptyInventorySnapshot))

        overlays = createSessionOverlays(
          document,
          ownedRoot,
          settings,
          options.settingsCallbacks,
          debugSnapshot,
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
    closeSettings: () => mounted?.overlays.closeSettings(),
    current: () => mounted,
    name: '@nerima-games/mx-ui',
    openSettings: () => mounted?.overlays.openSettings(),
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
  }
}
