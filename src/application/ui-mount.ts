import { Effect } from 'effect'
import type { MotionPreference } from '../domain/accessibility'
import { hudViewModel, spawnSnapshot } from '../domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../domain/inventory-view-model'
import { initialMainMenuState, mainMenuViewModel } from '../domain/main-menu'
import { uiModule } from '../stages/registration'
import { createHudView, type HudView } from './hud-view'
import { createInventoryView, type InventoryView } from './inventory-view'
import {
  createMainMenuView,
  type MainMenuCallbacks,
  type MainMenuView,
} from './main-menu-view'

export type UiMountedViews = {
  readonly root: HTMLElement
  readonly hud: HudView
  readonly inventory: InventoryView
  readonly mainMenu: MainMenuView
}

export type UiMountOptions = {
  readonly root: HTMLElement
  readonly motion?: MotionPreference
  readonly menuCallbacks?: MainMenuCallbacks
}

/** The browser-session shape consumed by mc-compose, without a package cycle. */
export type UiMount = {
  readonly name: string
  readonly start: Effect.Effect<typeof uiModule, unknown>
  readonly stop: Effect.Effect<void, unknown>
  readonly current: () => UiMountedViews | undefined
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

  const unmount = (): void => {
    const previous = mounted
    mounted = undefined
    if (previous === undefined) return

    previous.mainMenu.destroy()
    previous.root.remove()
  }

  const start = Effect.try({
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
      try {
        const hud = createHudView(document, ownedRoot, options.motion ?? 'full')
        hud.render(hudViewModel(spawnSnapshot))

        const inventory = createInventoryView(document, ownedRoot)
        inventory.render(inventoryViewModel(emptyInventorySnapshot))

        mainMenu = createMainMenuView(document, ownedRoot, options.menuCallbacks)
        mainMenu.render(mainMenuViewModel(initialMainMenuState, []))

        mounted = { root: ownedRoot, hud, inventory, mainMenu }
        return uiModule
      } catch (cause) {
        mainMenu?.destroy()
        ownedRoot.remove()
        throw new UiMountError('Failed to mount mx-ui', { cause })
      }
    },
    catch: (cause) => cause,
  })

  const stop = Effect.try({
    try: unmount,
    catch: (cause) => cause,
  })

  return {
    name: '@nerima-games/mx-ui',
    start,
    stop,
    current: () => mounted,
  }
}
