/**
 * @nerima-games/mx-ui — every DOM surface the game has.
 *
 * PRE-IMPLEMENTATION FIRST CUT (叩き台). See README.md 現状.
 *
 * mx-ui is an EXPERIENCE MODULE: a verb (plan.md §2.3-1). It owns presentation —
 * HUD, menus, inventory and crafting screens, settings and accessibility,
 * achievements and statistics, captions, loading and save indicators — and owns
 * no game state. Everything it shows is a projection of mc-sim's state; every
 * caption it shows comes from mc-audio's event stream.
 *
 * It knows nothing of mx-gameplay, mx-redstone or mx-multiplayer. "Mining fills
 * a hotbar slot" is mx-gameplay writing to mc-sim's InventoryService and mx-ui
 * reading that same service; mx-ui has no compile-time knowledge that mining
 * exists, and that is the property that lets either repository be rewritten
 * without touching the other.
 *
 * ---------------------------------------------------------------------------
 * Two layers, and the line between them
 * ---------------------------------------------------------------------------
 *
 * `domain/` is pure state derivation — no `document`, no clock, no service — so
 * the whole suite runs under vitest's `environment: 'node'` in milliseconds.
 * `domain/palette.ts` is part of that: colour VALUES and the arithmetic that
 * checks them, which is what lets the contrast and colour-vision guarantee it
 * states be a test rather than a claim.
 *
 * `application/` is the DOM layer that consumes them, and it arrived after the
 * derivations rather than alongside them, on purpose: a renderer written against
 * a tested projection is a dumb one, so a rendering bug and a derivation bug are
 * never the same bug (`domain/hud-view-model.ts`). It writes through the narrow
 * structural surface in `application/dom-surface.ts` rather than through
 * `HTMLElement` directly — not because the DOM lib is missing (mx-ui is the one
 * repository of the sixteen that has it) but because a fake document under
 * `environment: 'node'` must satisfy the renderer WITHOUT A CAST, and because a
* generic surface with no event methods cannot grow a second owner for Escape;
* only the menu's button/input surface exposes click and input events (DN-UI-4).
 *
 * Tests that drive DOM flows must be written with plain `it` +
 * `Effect.runPromise`, NOT `it.effect`. See docs/testing.md.
 */

export * from './application/accessibility-dom'
export * from './application/anvil-view'
export * from './application/caption-view'
export * from './application/chest-storage-view'
export * from './application/crosshair-view'
export * from './application/dom-surface'
export * from './application/dom-write'
export * from './application/enchanting-table-view'
export * from './application/furnace-view'
export * from './application/hud-view'
export * from './application/icon-element'
export * from './application/inventory-view'
export * from './application/inventory-actions'
export * from './application/inventory-navigation'
export * from './application/loading-view'
export * from './application/main-menu-view'
export * from './application/palette-css'
export * from './application/save-indicator'
export * from './application/session-overlays'
export * from './application/slot-element'
export * from './application/ui-mount'
export * from './domain/accessibility'
export * from './domain/anvil-view-model'
export * from './domain/caption'
export * from './domain/chest-storage-view-model'
export * from './domain/crosshair'
export * from './domain/enchanting-table-view-model'
export * from './domain/enchanting-table-controller'
export * from './domain/end-hud'
export * from './domain/furnace-view-model'
export * from './domain/furnace-controller'
export * from './domain/fps-counter'
export * from './domain/hud-view-model'
export * from './domain/inventory-view-model'
export * from './domain/loading-screen'
export * from './domain/main-menu'
export * from './domain/modal-stack'
export * from './domain/palette'
export * from './domain/save-status'
export * from './stages/registration'
export * from './stages/stage-ids'

// Frame vocabulary is owned by @nerima-games/mc-kernel and is intentionally
// Not re-exported from this barrel. The inventory view-model mirror is a
// Parameter of a local pure function and remains a separate, deliberate API.
