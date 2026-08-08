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

// --- Provisional ---------------------------------------------------------------
// `domain/frame-contract.ts` is a temporary local stand-in for
// @nerima-games/mc-kernel and is NOT re-exported. It carries a deletion date —
// See its "WHY THIS FILE EXISTS AND WHEN IT DIES" header — and re-exporting it
// Would make `StageId`, `DeltaTimeSecs` and `StageRegistration` published API of
// A package that does not own them, so deleting the stand-in would become a
// Breaking change for every consumer. Consumers take that vocabulary from
// Kernel; the types are structurally identical, so a consumer importing them
// From kernel typechecks against the signatures above. Same call, and the same
// Reason, as mc-sim's and mc-render's barrels.
//
// `domain/inventory-view-model.ts` carries a mirror too — mc-sim's `Inventory`,
// `Slot` and `ItemStack` — and IS re-exported, which is the opposite call. The
// Difference is what the mirror denotes. `frame-contract` mirrors kernel's
// CONTRACT, the thing mc-compose consumes, so republishing it would make a
// Promised deletion breaking for every consumer. The inventory mirror is the
// PARAMETER of one of this repository's own pure functions, exactly as
// `VitalsSnapshot` has been since the first cut: mc-compose does not call
// `inventoryViewModel`, so narrowing the parameter when mc-sim is published is
// A MINOR bump under docs/versioning.md §5, not a breaking change. Pinned by
// `test/inventory-mirror.test.ts`.
