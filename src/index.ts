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

export * from './application/accessibility-dom.js'
export * from './application/anvil-view.js'
export * from './application/caption-view.js'
export * from './application/chest-storage-view.js'
export * from './application/crosshair-view.js'
export * from './application/dom-surface.js'
export * from './application/dom-write.js'
export * from './application/enchanting-table-view.js'
export * from './application/furnace-view.js'
export * from './application/hud-view.js'
export * from './application/icon-element.js'
export * from './application/inventory-view.js'
export * from './application/inventory-actions.js'
export * from './application/inventory-navigation.js'
export * from './application/loading-view.js'
export * from './application/main-menu-view.js'
export * from './application/palette-css.js'
export * from './application/save-indicator.js'
export * from './application/session-overlays.js'
export * from './application/settings-view.js'
export * from './application/slot-element.js'
export * from './application/ui-mount.js'
export * from './domain/accessibility.js'
export * from './domain/anvil-view-model.js'
export * from './domain/caption.js'
export * from './domain/chest-storage-view-model.js'
export * from './domain/crosshair.js'
export * from './domain/enchanting-table-view-model.js'
export * from './domain/enchanting-table-controller.js'
export * from './domain/end-hud.js'
export * from './domain/furnace-view-model.js'
export * from './domain/furnace-controller.js'
export * from './domain/fps-counter.js'
export * from './domain/hud-view-model.js'
export * from './domain/inventory-view-model.js'
export * from './domain/loading-screen.js'
export * from './domain/main-menu.js'
export * from './domain/modal-stack.js'
export * from './domain/palette.js'
export * from './domain/save-status.js'
export * from './domain/session-navigation.js'
export * from './domain/settings-view-model.js'
export * from './stages/registration.js'
export * from './stages/stage-ids.js'

// --- Vocabulary ownership --------------------------------------------------
// This repository used to carry a local stand-in for the kernel contract
// (Wave 1, W1-M7 deleted it); `stages/*.ts` now import `StageId`,
// `DeltaTimeSecs`, `GameModule` and `StageRegistration` from
// @nerima-games/mc-kernel directly. Deliberately NOT re-exported here, same
// As before: republishing them would make `StageId` and `DeltaTimeSecs`
// Published API of a package that does not own them (`test/public-api.test.ts`
// Pins the absence). Consumers take that vocabulary from kernel — same call,
// And the same reason, as mc-sim's and mc-render's barrels.
//
// `domain/inventory-view-model.ts` also used to carry a local copy of
// Mc-sim's `Inventory`, `Slot` and `ItemStack`; it now imports them from
// `@nerima-games/mc-sim` directly. Those three type names are likewise not
// Re-exported through this barrel, for the same ownership reason — only
// `inventoryViewModel`, `slotSnapshotOf` and `INVENTORY_SLOT_COUNT` (the
// Functions and constant that are this repository's own) are, via
// `export * from './domain/inventory-view-model.js'` above.
