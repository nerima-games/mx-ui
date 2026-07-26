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
 * There is no DOM code in this repository YET, on purpose
 * ---------------------------------------------------------------------------
 *
 * Everything below is a pure state derivation, so the whole suite runs under
 * vitest's `environment: 'node'` in milliseconds. `tsconfig.base.json` already
 * declares the `DOM` lib — mx-ui is the one repository of the sixteen that does
 * — so adding the first screen is not also a build-configuration change.
 *
 * When those screens arrive, their tests must be written with plain `it` +
 * `Effect.runPromise`, NOT `it.effect`. See docs/testing.md.
 */

export * from './domain/accessibility'
export * from './domain/caption'
export * from './domain/hud-view-model'
export * from './domain/modal-stack'
export * from './stages/registration'
export * from './stages/stage-ids'

// --- Provisional ---------------------------------------------------------------
// `domain/frame-contract.ts` is a temporary local stand-in for
// @nerima-games/mc-kernel and is NOT re-exported. It carries a deletion date —
// see its "WHY THIS FILE EXISTS AND WHEN IT DIES" header — and re-exporting it
// would make `StageId`, `DeltaTimeSecs` and `StageRegistration` published API of
// a package that does not own them, so deleting the stand-in would become a
// breaking change for every consumer. Consumers take that vocabulary from
// kernel; the types are structurally identical, so a consumer importing them
// from kernel typechecks against the signatures above. Same call, and the same
// reason, as mc-sim's and mc-render's barrels.
