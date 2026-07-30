/**
 * Every screen this repository builds, mounted against a REAL document.
 *
 * ---------------------------------------------------------------------------
 * THE ASSIGNMENT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------
 *
 * `mountScreens` takes a `DomElementFactory` and a `DomElement`. The caller
 * (`main.ts`) hands it `document` and a real `HTMLDivElement`, with NO CAST.
 *
 * That is not a convenience — it is `application/dom-surface.ts`'s central claim
 * being collected at runtime instead of only at compile time.
 * `test/fixtures/dom-surface.ts` proves the structural surface is a SUBSET of
 * `lib.dom.d.ts` by compiling assignments against the real declarations;
 * `test/dom-surface.test.ts` asserts that compile produces zero diagnostics. But
 * a type-level subset claim says nothing about whether the members BEHAVE: a
 * surface could name `setProperty(property, value)` correctly and still be
 * unusable if every renderer in this repository silently depended on something
 * only `test/fake-dom.ts` does.
 *
 * So the harness is written to the surface types and handed the real thing. If
 * this file ever needs `as unknown as` to compile or to run, the surface is
 * wrong and that is the finding, not the workaround.
 *
 * ---------------------------------------------------------------------------
 * The screen list is `test/accessibility-gate.test.ts`'s, deliberately
 * ---------------------------------------------------------------------------
 *
 * Same seven screens, driven through the same states, in the same order. The
 * headless sweep and the browser sweep answering different questions about
 * DIFFERENT screen sets would make a disagreement between them unreadable —
 * nobody could tell whether the browser found a defect or found a screen the
 * fake never saw. Keeping the list identical means any disagreement is about the
 * one thing that changed, which is the presence of a layout and a cascade.
 *
 * ---------------------------------------------------------------------------
 * NO CLOCK, and it is not a style choice
 * ---------------------------------------------------------------------------
 *
 * `apps/` is in `SCAN_ROOTS` (`scripts/check-dependency-whitelist.ts`), so rule
 * 7 — no `Date.now()`, no `performance.now()` — applies here exactly as it does
 * to shipped source. Every time below is a literal, which is possible at all
 * because DN-UI-10 made every time-dependent derivation take its clock as an
 * ARGUMENT. A harness that needed a real clock to show a hit marker would be
 * evidence against that design; this one needs `0`.
 */
import { captionLines, emptyCaptionQueue, receiveCaption } from '../../domain/caption'
import { crosshairViewModel, IDLE_CROSSHAIR_STATUS } from '../../domain/crosshair'
import { hudViewModel, spawnSnapshot } from '../../domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../../domain/inventory-view-model'
import { initialMainMenuState, mainMenuViewModel, openPanel } from '../../domain/main-menu'
import { saveStatus, saveStatusMessage } from '../../domain/save-status'
import type { MotionPreference } from '../../domain/accessibility'
import { createCaptionView } from '../../application/caption-view'
import { createCrosshairView } from '../../application/crosshair-view'
import { createHudView } from '../../application/hud-view'
import { createInventoryView } from '../../application/inventory-view'
import { createLoadingView } from '../../application/loading-view'
import { createMainMenuView } from '../../application/main-menu-view'
import { createSaveIndicator } from '../../application/save-indicator'
import type { DomElement, DomElementFactory } from '../../application/dom-surface'

/** The `?screen=` values, and the order the hosts are created in. */
export const SCREEN_NAMES = [
  'main-menu',
  'hud',
  'inventory',
  'captions',
  'save-indicator',
  'loading',
  'crosshair',
] as const

export type ScreenName = (typeof SCREEN_NAMES)[number]

export type MountedScreen = {
  readonly name: ScreenName
  /** The harness's host. mx-ui's root is a CHILD of this; the harness styles only this. */
  readonly host: DomElement
  /** The root mx-ui built. Nothing outside mx-ui ever writes to this subtree. */
  readonly root: DomElement
}

/**
 * Build one host per screen and mount into it.
 *
 * A host PER SCREEN rather than one shared parent, which is the one place this
 * differs from `test/accessibility-gate.test.ts` and it differs because layout
 * exists here. Seven roots in one parent would stack in document order and every
 * geometry reading would be a reading about that stacking rather than about the
 * screen. `docs/public-api.md` §4-1 makes the parent an argument precisely so
 * that a page can stand up more than one, so seven hosts is the shape the
 * contract already anticipates.
 */
export const mountScreens = (
  factory: DomElementFactory,
  page: DomElement,
  motion: MotionPreference,
  breakProgress?: number,
): ReadonlyArray<MountedScreen> => {
  const hosts = new Map<ScreenName, DomElement>()
  for (const name of SCREEN_NAMES) {
    const host = factory.createElement('div')
    host.setAttribute('data-harness-host', name)
    page.appendChild(host)
    hosts.set(name, host)
  }

  /**
   * `Map.get` is `T | undefined` under `noUncheckedIndexedAccess`, and the
   * honest way to discharge that in a harness is to throw rather than to assert
   * non-null: the loop above put every name in, so a miss means this function
   * was edited wrongly and the harness should say so loudly on the page rather
   * than render six screens and look fine.
   */
  const hostFor = (name: ScreenName): DomElement => {
    const host = hosts.get(name)
    if (host === undefined) {
      throw new Error(`browser-harness: no host was created for screen "${name}"`)
    }
    return host
  }

  const menu = createMainMenuView(factory, hostFor('main-menu'))
  menu.render(mainMenuViewModel(openPanel(initialMainMenuState, 'new-world')))
  menu.render(mainMenuViewModel(openPanel(initialMainMenuState, 'load-world')))
  menu.render(mainMenuViewModel(initialMainMenuState))

  const hud = createHudView(factory, hostFor('hud'), motion)
  // Dead and then alive, for `test/accessibility-gate.test.ts`'s reason: a state
  // whose elements are only built when it occurs is a state a sweep sees only if
  // the sweep triggered it.
  hud.render(hudViewModel({ ...spawnSnapshot, healthPoints: 0 }))
  hud.render(hudViewModel(spawnSnapshot))
  // Slot 4, so the focus ring is DRAWN. This is the reading `docs/testing.md` §4
  // names as unproven: whether the ring is visible ON the slot is the `outline`
  // and `box-shadow` stacking order, and stacking order is a browser's answer.
  hud.setKeyboardFocus(4)

  const inventory = createInventoryView(factory, hostFor('inventory'))
  inventory.render(inventoryViewModel(emptyInventorySnapshot))

  const captions = createCaptionView(factory, hostFor('captions'), motion)
  captions.render(
    captionLines(
      receiveCaption(
        emptyCaptionQueue,
        { cueId: 'creeper', text: 'Creeper hisses', direction: 'left', atSecs: 0 },
        { captionsEnabled: true, audioUnlocked: false },
      ),
      0,
    ),
  )

  const save = createSaveIndicator(factory, hostFor('save-indicator'))
  save.render(saveStatusMessage(saveStatus('failed', 0), 1))

  const loading = createLoadingView(factory, hostFor('loading'))
  loading.render({ kind: 'failed', reason: 'chunk stream ended' })
  loading.render({ kind: 'preparing', held: true })

  const crosshair = createCrosshairView(factory, hostFor('crosshair'), motion)
  crosshair.render(
    crosshairViewModel({ ...IDLE_CROSSHAIR_STATUS, lastHitAtSecs: 0, breakProgress }, 0),
  )

  return [
    { name: 'main-menu', host: hostFor('main-menu'), root: menu.root },
    { name: 'hud', host: hostFor('hud'), root: hud.root },
    { name: 'inventory', host: hostFor('inventory'), root: inventory.root },
    { name: 'captions', host: hostFor('captions'), root: captions.root },
    { name: 'save-indicator', host: hostFor('save-indicator'), root: save.root },
    { name: 'loading', host: hostFor('loading'), root: loading.root },
    { name: 'crosshair', host: hostFor('crosshair'), root: crosshair.root },
  ]
}
